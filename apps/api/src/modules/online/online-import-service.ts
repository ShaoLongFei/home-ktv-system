import { stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { probeMediaFile } from "../ingest/media-probe.js";
import { InMemoryOnlineCatalogPromoter, type OnlineCatalogPromoter } from "./online-catalog-promoter.js";
import type { OnlineCatalogCandidate, OnlineCatalogProvider } from "./igeba/igeba-provider.js";
import type {
  OnlineAssetRecord,
  OnlineAssetStats,
  OnlineCatalogRepository
} from "./online-catalog-repository.js";

export interface OnlineMediaProbeResult {
  durationMs: number | null;
  audioTrackCount: number | null;
  mediaInfoSummary?: unknown;
  mediaInfoProvenance?: unknown;
}

export interface OnlineImportServiceOptions {
  provider: OnlineCatalogProvider;
  repository: OnlineCatalogRepository;
  cacheDir: string;
  concurrency?: number;
  promoter?: OnlineCatalogPromoter;
  probeMedia?: (filePath: string) => Promise<OnlineMediaProbeResult>;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface RequestImportInput {
  songNumber: string;
  title?: string;
  artistName?: string;
  durationMs?: number | null;
  styleTags?: readonly string[];
}

export interface RequestImportOptions {
  /** 缓存就绪后回调；若已经就绪会立即执行。用于「点歌即排队」。 */
  onReady?: (asset: OnlineAssetRecord) => void | Promise<void>;
}

export interface RequestImportResult {
  asset: OnlineAssetRecord;
  cached: boolean;
}

export interface OnlineImportServiceStatus {
  provider: string;
  enabled: boolean;
  cacheDir: string;
  pendingJobs: number;
  activeJobs: number;
  stats: OnlineAssetStats;
}

/**
 * 在线曲库的「按需加载」流水线：
 *   搜索（只读）→ 请求导入 → 取址 → 分块下载 → ffprobe → ready → /media/online/:id 可播。
 *
 * 单并发、去重、失败不阻塞后续任务；重复请求同一首歌直接复用已完成缓存。
 */
export class OnlineImportService {
  private readonly cacheRoot: string;
  private readonly concurrency: number;
  private readonly probeMedia: (filePath: string) => Promise<OnlineMediaProbeResult>;
  private readonly promoter: OnlineCatalogPromoter;
  private readonly readyHooks = new Map<string, Array<(asset: OnlineAssetRecord) => void | Promise<void>>>();
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly pending: Array<() => void> = [];
  private readonly inFlight = new Map<string, Promise<OnlineAssetRecord>>();
  private activeJobs = 0;

  constructor(private readonly options: OnlineImportServiceOptions) {
    this.cacheRoot = resolve(options.cacheDir);
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.promoter = options.promoter ?? new InMemoryOnlineCatalogPromoter();
    this.probeMedia = options.probeMedia ?? (async (filePath) => {
      const probed = await probeMediaFile(filePath);
      return {
        durationMs: probed.durationMs,
        audioTrackCount: probed.mediaInfoSummary.audioTracks.length,
        mediaInfoSummary: probed.mediaInfoSummary,
        mediaInfoProvenance: probed.mediaInfoProvenance
      };
    });
    this.logger = options.logger ?? console;
  }

  get enabled(): boolean {
    return this.options.provider.health().cooldownUntil === null;
  }

  /** 搜索失败不影响本地曲库：任何异常都退化为空结果。 */
  async search(keyword: string, limit: number): Promise<OnlineCatalogCandidate[]> {
    if (!keyword.trim()) {
      return [];
    }
    try {
      return await this.options.provider.search(keyword, limit);
    } catch (error) {
      this.logger.warn?.(`[online] search failed: ${describeError(error)}`);
      return [];
    }
  }

  async requestImport(input: RequestImportInput, options: RequestImportOptions = {}): Promise<RequestImportResult> {
    const { provider, repository } = this.options;
    const providerAssetId = input.songNumber.trim();
    if (!providerAssetId) {
      throw new Error("songNumber is required");
    }

    const song = await repository.upsertSong({
      provider: provider.id,
      providerSongId: providerAssetId,
      title: input.title?.trim() || providerAssetId,
      artistName: input.artistName?.trim() || "",
      durationMs: input.durationMs ?? null
    });
    const asset = await repository.upsertAsset({
      provider: provider.id,
      providerAssetId,
      songId: song.id,
      mediaUrl: "",
      metadata: {
        title: input.title?.trim() || providerAssetId,
        artistName: input.artistName?.trim() || "",
        ...(input.styleTags ? { tags: input.styleTags } : {})
      }
    });

    if (asset.status === "ready" && asset.cachePath) {
      if (options.onReady) {
        await options.onReady(asset);
      }
      return { asset, cached: true };
    }

    if (options.onReady) {
      const hooks = this.readyHooks.get(asset.id) ?? [];
      hooks.push(options.onReady);
      this.readyHooks.set(asset.id, hooks);
    }

    const jobKey = asset.id;
    if (!this.inFlight.has(jobKey)) {
      const task = this.enqueue(() => this.runJob(asset.id, providerAssetId), asset.id);
      this.inFlight.set(jobKey, task);
      void task.finally(() => this.inFlight.delete(jobKey));
    }

    return { asset: { ...asset, status: "caching" }, cached: false };
  }

  async importByQuery(query: string, limit: number): Promise<RequestImportResult[]> {
    const candidates = await this.search(query, limit);
    const results: RequestImportResult[] = [];
    for (const candidate of candidates) {
      results.push(
        await this.requestImport({
          songNumber: candidate.providerSongId,
          title: candidate.title,
          artistName: candidate.artistName,
          durationMs: candidate.durationMs
        })
      );
    }
    return results;
  }

  getAsset(assetId: string): Promise<OnlineAssetRecord | null> {
    return this.options.repository.findAssetById(assetId);
  }

  listAssets(limit: number): Promise<OnlineAssetRecord[]> {
    return this.options.repository.listAssets(limit);
  }

  async status(): Promise<OnlineImportServiceStatus> {
    return {
      provider: this.options.provider.id,
      enabled: this.options.provider.health().cooldownUntil === null,
      cacheDir: this.cacheRoot,
      pendingJobs: this.pending.length,
      activeJobs: this.activeJobs,
      stats: await this.options.repository.stats()
    };
  }

  /** 测试用：等待所有排队与在途任务结束。 */
  async whenIdle(): Promise<void> {
    while (this.activeJobs > 0 || this.pending.length > 0 || this.inFlight.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  private enqueue(job: () => Promise<void>, assetId: string): Promise<OnlineAssetRecord> {
    return new Promise<OnlineAssetRecord>((resolve, reject) => {
      const run = (): void => {
        this.activeJobs += 1;
        void job()
          .then(() => this.options.repository.findAssetById(assetId))
          .then((asset) => (asset ? resolve(asset) : reject(new Error("online asset disappeared"))))
          .catch(reject)
          .finally(() => {
            this.activeJobs -= 1;
            this.drain();
          });
      };
      this.pending.push(run);
      this.drain();
    });
  }

  private drain(): void {
    while (this.activeJobs < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();
      next?.();
    }
  }

  private async runJob(assetId: string, songNumber: string): Promise<void> {
    const { provider, repository } = this.options;
    try {
      const address = await provider.resolve(songNumber);
      await repository.updateAsset(assetId, {
        status: "caching",
        mediaUrl: address.fileUrl,
        errorReason: null,
        lastResolvedAt: new Date()
      });

      if (!provider.download) {
        throw new Error(`provider ${provider.id} does not support download`);
      }
      const targetPath = join(this.cacheRoot, cacheFileName(songNumber, address.fileName));
      const downloaded = await this.downloadOrReuse(songNumber, targetPath, address.sizeBytes);

      let probed: OnlineMediaProbeResult = { durationMs: null, audioTrackCount: null };
      try {
        probed = await this.probeMedia(targetPath);
      } catch (error) {
        this.logger.warn?.(`[online] ffprobe failed for ${targetPath}: ${describeError(error)}`);
      }

      const current = await repository.findAssetById(assetId);
      const styleTags = readStyleTags(current?.metadata);
      const title = typeof current?.metadata?.title === "string" ? current.metadata.title : songNumber;
      const artistName = typeof current?.metadata?.artistName === "string" ? current.metadata.artistName : "";

      const promoted = await this.promoter.promote({
        provider: provider.id,
        providerSongId: songNumber,
        title,
        artistName,
        cachePath: targetPath,
        fileName: basename(targetPath),
        extension: extname(targetPath) || ".mkv",
        sizeBytes: downloaded.bytes,
        styleTags,
        audioTrackCount: probed.audioTrackCount,
        technicalStatus: probed.audioTrackCount === null ? "pending" : "probed",
        technicalMetadata: {
          durationMs: probed.durationMs,
          audioTrackCount: probed.audioTrackCount,
          providerSongNumber: songNumber,
          ...(probed.mediaInfoSummary ? { mediaInfoSummary: probed.mediaInfoSummary } : {}),
          ...(probed.mediaInfoProvenance ? { mediaInfoProvenance: probed.mediaInfoProvenance } : {})
        }
      });

      const ready = await repository.updateAsset(assetId, {
        status: "ready",
        cachePath: targetPath,
        cacheBytes: downloaded.bytes,
        durationMs: probed.durationMs,
        audioTrackCount: probed.audioTrackCount,
        catalogSongId: promoted.songId,
        errorReason: null
      });
      this.logger.info?.(`[online] cached ${songNumber} (${downloaded.bytes} bytes) -> ${promoted.songId}`);
      if (ready) {
        await this.runReadyHooks(ready);
      }
    } catch (error) {
      const message = describeError(error);
      await repository.updateAsset(assetId, {
        status: isPermanentFailure(error) ? "unavailable" : "failed",
        errorReason: message
      });
      this.logger.warn?.(`[online] import failed for ${songNumber}: ${message}`);
    }
  }

  /** 重启后缓存文件仍在时直接复用，避免重复下载几十 MB。 */
  private async downloadOrReuse(
    songNumber: string,
    targetPath: string,
    expectedBytes: number
  ): Promise<{ bytes: number }> {
    const provider = this.options.provider;
    try {
      const existing = (await stat(targetPath)).size;
      if (existing > 0 && (expectedBytes <= 0 || Math.abs(existing - expectedBytes) <= 1)) {
        this.logger.info?.(`[online] reuse cached file for ${songNumber} (${existing} bytes)`);
        return { bytes: existing };
      }
    } catch {
      // 文件不存在，走正常下载
    }

    if (!provider.download) {
      throw new Error(`provider ${provider.id} does not support download`);
    }
    const downloaded = await provider.download(songNumber, targetPath);
    return { bytes: downloaded.bytes };
  }

  private async runReadyHooks(asset: OnlineAssetRecord): Promise<void> {
    const hooks = this.readyHooks.get(asset.id);
    if (!hooks) {
      return;
    }
    this.readyHooks.delete(asset.id);
    for (const hook of hooks) {
      try {
        await hook(asset);
      } catch (error) {
        this.logger.warn?.(`[online] ready hook failed for ${asset.id}: ${describeError(error)}`);
      }
    }
  }
}

function readStyleTags(metadata: Record<string, unknown> | undefined): string[] {
  const raw = metadata?.tags;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
}

function cacheFileName(songNumber: string, fileName: string): string {
  const extension = /\.[A-Za-z0-9]{2,5}$/u.exec(fileName)?.[0] ?? ".mkv";
  return `${songNumber}${extension}`;
}

function isPermanentFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("no playable url") || error.message.includes("does not support download");
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
