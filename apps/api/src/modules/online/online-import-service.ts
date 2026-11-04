import { join, resolve } from "node:path";
import { probeMediaFile } from "../ingest/media-probe.js";
import type { OnlineCatalogCandidate, OnlineCatalogProvider } from "./igeba/igeba-provider.js";
import type {
  OnlineAssetRecord,
  OnlineAssetStats,
  OnlineCatalogRepository
} from "./online-catalog-repository.js";

export interface OnlineMediaProbeResult {
  durationMs: number | null;
  audioTrackCount: number | null;
}

export interface OnlineImportServiceOptions {
  provider: OnlineCatalogProvider;
  repository: OnlineCatalogRepository;
  cacheDir: string;
  concurrency?: number;
  probeMedia?: (filePath: string) => Promise<OnlineMediaProbeResult>;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface RequestImportInput {
  songNumber: string;
  title?: string;
  artistName?: string;
  durationMs?: number | null;
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
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly pending: Array<() => void> = [];
  private readonly inFlight = new Map<string, Promise<OnlineAssetRecord>>();
  private activeJobs = 0;

  constructor(private readonly options: OnlineImportServiceOptions) {
    this.cacheRoot = resolve(options.cacheDir);
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.probeMedia = options.probeMedia ?? (async (filePath) => {
      const probed = await probeMediaFile(filePath);
      return {
        durationMs: probed.durationMs,
        audioTrackCount: probed.mediaInfoSummary.audioTracks.length
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

  async requestImport(input: RequestImportInput): Promise<RequestImportResult> {
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
      mediaUrl: ""
    });

    if (asset.status === "ready" && asset.cachePath) {
      return { asset, cached: true };
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
      const downloaded = await provider.download(songNumber, targetPath);

      let probed: OnlineMediaProbeResult = { durationMs: null, audioTrackCount: null };
      try {
        probed = await this.probeMedia(targetPath);
      } catch (error) {
        this.logger.warn?.(`[online] ffprobe failed for ${targetPath}: ${describeError(error)}`);
      }

      await repository.updateAsset(assetId, {
        status: "ready",
        cachePath: targetPath,
        cacheBytes: downloaded.bytes,
        durationMs: probed.durationMs,
        audioTrackCount: probed.audioTrackCount,
        errorReason: null
      });
      this.logger.info?.(`[online] cached ${songNumber} (${downloaded.bytes} bytes)`);
    } catch (error) {
      const message = describeError(error);
      await repository.updateAsset(assetId, {
        status: isPermanentFailure(error) ? "unavailable" : "failed",
        errorReason: message
      });
      this.logger.warn?.(`[online] import failed for ${songNumber}: ${message}`);
    }
  }
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
