import { execFile } from "node:child_process";
import { rename, rm, stat } from "node:fs/promises";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);

export interface InstrumentalRemuxInput {
  inputPath: string;
  outputPath: string;
  trackIndex: number;
}

export interface OnlineImportServiceOptions {
  provider: OnlineCatalogProvider;
  repository: OnlineCatalogRepository;
  cacheDir: string;
  concurrency?: number;
  cacheMaxBytes?: number;
  cacheMaxItems?: number;
  cacheTtlDays?: number;
  promoter?: OnlineCatalogPromoter;
  probeMedia?: (filePath: string) => Promise<OnlineMediaProbeResult>;
  /** 抽出伴奏轨；默认调用 ffmpeg。测试可注入。 */
  remuxInstrumental?: (input: InstrumentalRemuxInput) => Promise<void>;
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
  quota: {
    maxBytes: number;
    maxItems: number;
    ttlDays: number;
    usedBytes: number;
    usedItems: number;
  };
  metrics: {
    downloads: number;
    evictions: number;
    failures: number;
    lastPruneAt: string | null;
  };
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
  private readonly remuxInstrumental: (input: InstrumentalRemuxInput) => Promise<void>;
  private readonly promoter: OnlineCatalogPromoter;
  private readonly readyHooks = new Map<string, Array<(asset: OnlineAssetRecord) => void | Promise<void>>>();
  private readonly metrics = { downloads: 0, evictions: 0, failures: 0, lastPruneAt: null as string | null };
  private readonly maxBytes: number;
  private readonly maxItems: number;
  private readonly ttlDays: number;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly pending: Array<() => void> = [];
  private readonly inFlight = new Map<string, Promise<OnlineAssetRecord>>();
  private activeJobs = 0;

  constructor(private readonly options: OnlineImportServiceOptions) {
    this.cacheRoot = resolve(options.cacheDir);
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.maxBytes = options.cacheMaxBytes ?? 50 * 1024 * 1024 * 1024;
    this.maxItems = options.cacheMaxItems ?? 200;
    this.ttlDays = options.cacheTtlDays ?? 30;
    this.promoter = options.promoter ?? new InMemoryOnlineCatalogPromoter();
    this.remuxInstrumental = options.remuxInstrumental ?? (async ({ inputPath, outputPath, trackIndex }) => {
      await execFileAsync(
        "ffmpeg",
        [
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          inputPath,
          "-map",
          "0:v:0",
          "-map",
          `0:a:${trackIndex}`,
          "-c",
          "copy",
          outputPath
        ],
        { timeout: 180000 }
      );
    });
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

    const existingSong = (await repository.findSongByProviderId?.(provider.id, providerAssetId)) ?? null;
    const resolvedTitle = input.title?.trim() || existingSong?.title || providerAssetId;
    const resolvedArtist = input.artistName?.trim() || existingSong?.artistName || "";

    const song = await repository.upsertSong({
      provider: provider.id,
      providerSongId: providerAssetId,
      title: resolvedTitle,
      artistName: resolvedArtist,
      durationMs: input.durationMs ?? null
    });
    const asset = await repository.upsertAsset({
      provider: provider.id,
      providerAssetId,
      songId: song.id,
      mediaUrl: "",
      metadata: {
        title: resolvedTitle,
        artistName: resolvedArtist,
        ...(input.styleTags ? { tags: input.styleTags } : {})
      }
    });

    if (asset.status === "ready" && asset.cachePath) {
      const readyAsset = await this.renameReadyAssetIfNeeded(asset, resolvedTitle, resolvedArtist);
      if (options.onReady) {
        await options.onReady(readyAsset);
      }
      return { asset: readyAsset, cached: true };
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

  async discoverySingers(limit: number): Promise<Array<{
    singerId: string;
    singerName: string;
    mark: string;
    pictureUrl: string | null;
  }>> {
    const provider = this.options.provider;
    return provider.discoverySingers ? provider.discoverySingers(limit) : [];
  }

  async recommendedSongs(limit: number): Promise<Awaited<ReturnType<NonNullable<OnlineCatalogProvider["search"]>>>> {
    const provider = this.options.provider;
    return provider.recommendedSongs ? provider.recommendedSongs(limit) : [];
  }

  async discoverySingerPage(input: { page: number; pageSize: number }): Promise<{
    singers: Array<{ singerId: string; singerName: string; mark: string; pictureUrl: string | null }>;
    pageCount: number;
  }> {
    const provider = this.options.provider;
    return provider.discoverySingerPage ? provider.discoverySingerPage(input) : { singers: [], pageCount: 0 };
  }

  async discoveryStyles(): Promise<string[]> {
    const provider = this.options.provider;
    return provider.discoveryStyles ? provider.discoveryStyles() : [];
  }

  async songsBySinger(input: {
    singerId: string;
    page: number;
    pageSize: number;
  }): Promise<{ candidates: Awaited<ReturnType<NonNullable<OnlineCatalogProvider["packageSongs"]>>>; pageCount: number } | null> {
    const provider = this.options.provider;
    if (!provider.songsBySinger) {
      return null;
    }
    return provider.songsBySinger(input);
  }

  async songsByStyle(input: {
    style: string;
    page: number;
    pageSize: number;
  }): Promise<{ candidates: Awaited<ReturnType<NonNullable<OnlineCatalogProvider["packageSongs"]>>>; pageCount: number } | null> {
    const provider = this.options.provider;
    if (!provider.songsByStyle) {
      return null;
    }
    return provider.songsByStyle(input);
  }

  async discovery(): Promise<{ hotModules: Awaited<ReturnType<NonNullable<OnlineCatalogProvider["hotModules"]>>> }> {
    const provider = this.options.provider;
    if (!provider.hotModules) {
      return { hotModules: [] };
    }
    return { hotModules: await provider.hotModules() };
  }

  async importByPackage(input: {
    packageType: number;
    packageId: string;
    limit: number;
  }): Promise<RequestImportResult[]> {
    const provider = this.options.provider;
    if (!provider.packageSongs) {
      throw new Error(`provider ${provider.id} does not support package import`);
    }
    const candidates = await provider.packageSongs(input);
    const results: RequestImportResult[] = [];
    for (const candidate of candidates) {
      results.push(
        await this.requestImport({
          songNumber: candidate.providerSongId,
          title: candidate.title,
          artistName: candidate.artistName,
          durationMs: candidate.durationMs,
          styleTags: candidate.tags
        })
      );
    }
    return results;
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
    const stats = await this.options.repository.stats();
    return {
      provider: this.options.provider.id,
      enabled: this.options.provider.health().cooldownUntil === null,
      cacheDir: this.cacheRoot,
      pendingJobs: this.pending.length,
      activeJobs: this.activeJobs,
      stats,
      quota: {
        maxBytes: this.maxBytes,
        maxItems: this.maxItems,
        ttlDays: this.ttlDays,
        usedBytes: stats.bytes,
        usedItems: stats.ready
      },
      metrics: { ...this.metrics }
    };
  }

  /** 删除缓存文件并把曲目回退为 unavailable；同时移除本地曲库条目。 */
  async evict(assetId: string): Promise<OnlineAssetRecord | null> {
    const asset = await this.options.repository.findAssetById(assetId);
    if (!asset) {
      return null;
    }
    if (asset.cachePath) {
      await rm(asset.cachePath, { force: true });
      await rm(`${asset.cachePath}.part`, { force: true });
    }
    const instrumentalPath = readInstrumentalPath(asset.metadata);
    if (instrumentalPath) {
      await rm(instrumentalPath, { force: true });
    }
    if (asset.catalogSongId) {
      await this.promoter.demote(asset.catalogSongId);
    }
    const updated = await this.options.repository.updateAsset(assetId, {
      status: "unavailable",
      cachePath: null,
      cacheBytes: null,
      catalogSongId: null,
      errorReason: "evicted"
    });
    this.metrics.evictions += 1;
    this.logger.info?.(`[online] evicted ${asset.providerAssetId} (${asset.cacheBytes ?? 0} bytes)`);
    return updated;
  }

  /** 清理超过 TTL 的缓存，并把卡住的 caching 任务重置为 failed。 */
  async pruneExpired(now = new Date()): Promise<{ evicted: number; stale: number }> {
    const staleSince = new Date(now.getTime() - 15 * 60 * 1000);
    const stale = await this.options.repository.failStaleCaching(staleSince);

    const ttlSince = new Date(now.getTime() - this.ttlDays * 24 * 60 * 60 * 1000);
    const expired = await this.options.repository.listExpiredAssets(ttlSince, 50);
    let evicted = 0;
    for (const asset of expired) {
      await this.evict(asset.id);
      evicted += 1;
    }
    this.metrics.lastPruneAt = now.toISOString();
    return { evicted, stale };
  }

  private async enforceQuota(input: { nextBytes: number; excludeAssetId: string }): Promise<void> {
    const stats = await this.options.repository.stats();
    let usedBytes = stats.bytes;
    let usedItems = stats.ready;
    let guard = 0;

    while (
      (usedBytes + input.nextBytes > this.maxBytes || usedItems + 1 > this.maxItems) &&
      guard < 50
    ) {
      guard += 1;
      const candidates = await this.options.repository.listEvictionCandidates({
        limit: 1,
        excludeAssetId: input.excludeAssetId
      });
      const victim = candidates[0];
      if (!victim) {
        break;
      }
      const evicted = await this.evict(victim.id);
      usedBytes -= victim.cacheBytes ?? 0;
      usedItems -= 1;
      if (!evicted) {
        break;
      }
    }
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
    let claimed = false;
    try {
      const claim = await repository.claimForDownload(assetId);
      if (!claim) {
        this.logger.info?.(`[online] ${songNumber} already claimed by another worker, skip`);
        return;
      }
      claimed = true;

      const address = await provider.resolve(songNumber);
      await this.enforceQuota({ nextBytes: address.sizeBytes, excludeAssetId: assetId });
      await repository.updateAsset(assetId, {
        status: "caching",
        mediaUrl: address.fileUrl,
        errorReason: null,
        lastResolvedAt: new Date()
      });

      if (!provider.download) {
        throw new Error(`provider ${provider.id} does not support download`);
      }
      const cacheMeta = readCacheNameMeta(claim.metadata);
      const targetPath = join(this.cacheRoot, cacheFileName(songNumber, address.fileName, cacheMeta));
      const downloaded = await this.downloadOrReuse(songNumber, targetPath, address.sizeBytes);
      this.metrics.downloads += 1;

      let probed: OnlineMediaProbeResult = { durationMs: null, audioTrackCount: null };
      try {
        probed = await this.probeMedia(targetPath);
      } catch (error) {
        this.logger.warn?.(`[online] ffprobe failed for ${targetPath}: ${describeError(error)}`);
      }

      let instrumentalPath: string | null = null;
      if ((probed.audioTrackCount ?? 0) >= 2) {
        instrumentalPath = await this.ensureInstrumentalVariant(targetPath, 1);
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
          ...(probed.mediaInfoProvenance ? { mediaInfoProvenance: probed.mediaInfoProvenance } : {}),
          ...(instrumentalPath ? { onlineVariants: { instrumental: instrumentalPath } } : {})
        }
      });

      const ready = await repository.updateAsset(assetId, {
        status: "ready",
        cachePath: targetPath,
        cacheBytes: downloaded.bytes + (instrumentalPath ? await fileSizeOrZero(instrumentalPath) : 0),
        durationMs: probed.durationMs,
        audioTrackCount: probed.audioTrackCount,
        catalogSongId: promoted.songId,
        errorReason: null,
        ...(instrumentalPath ? { metadata: { instrumentalPath, instrumentalTrackIndex: 1 } } : {})
      });
      this.logger.info?.(`[online] cached ${songNumber} (${downloaded.bytes} bytes) -> ${promoted.songId}`);
      if (ready) {
        await this.runReadyHooks(ready);
      }
    } catch (error) {
      const message = describeError(error);
      this.metrics.failures += 1;
      await repository.updateAsset(assetId, {
        status: isPermanentFailure(error) ? "unavailable" : "failed",
        errorReason: message
      });
      this.logger.warn?.(`[online] import failed for ${songNumber}: ${message}`);
    } finally {
      if (claimed) {
        await repository.releaseClaim(assetId).catch(() => undefined);
      }
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
      // 文件不存在，尝试复用旧的「歌曲号.mkv」缓存
      const legacyPath = join(this.cacheRoot, `${songNumber}${extname(targetPath)}`);
      if (legacyPath !== targetPath) {
        try {
          const legacySize = (await stat(legacyPath)).size;
          if (legacySize > 0 && (expectedBytes <= 0 || Math.abs(legacySize - expectedBytes) <= 1)) {
            await rename(legacyPath, targetPath);
            this.logger.info?.(`[online] renamed legacy cache ${songNumber} -> ${basename(targetPath)}`);
            return { bytes: legacySize };
          }
        } catch {
          // 继续正常下载
        }
      }
    }

    if (!provider.download) {
      throw new Error(`provider ${provider.id} does not support download`);
    }
    const downloaded = await provider.download(songNumber, targetPath);
    return { bytes: downloaded.bytes };
  }

  /** 已缓存的老资源在拿到真实曲名后，顺手把 20003908.mkv 改名成 歌手-歌名.mkv。 */
  private async renameReadyAssetIfNeeded(
    asset: OnlineAssetRecord,
    title: string,
    artistName: string
  ): Promise<OnlineAssetRecord> {
    if (!asset.cachePath || !title || title === providerSongNumber(asset)) {
      return asset;
    }
    const extension = extname(asset.cachePath) || ".mkv";
    const desiredPath = join(
      this.cacheRoot,
      cacheFileName(asset.providerAssetId, `x${extension}`, { title, artistName })
    );
    if (desiredPath === asset.cachePath) {
      return (
        (await this.options.repository.updateAsset(asset.id, { metadata: { title, artistName } })) ?? asset
      );
    }
    try {
      await rename(asset.cachePath, desiredPath);
    } catch {
      return asset;
    }

    const previousInstrumental = readInstrumentalPath(asset.metadata);
    let instrumentalPath = previousInstrumental;
    if (previousInstrumental) {
      const nextInstrumental = `${desiredPath.slice(0, -extension.length)}.instrumental${extension}`;
      try {
        await rename(previousInstrumental, nextInstrumental);
        instrumentalPath = nextInstrumental;
      } catch {
        instrumentalPath = previousInstrumental;
      }
    }

    return (
      (await this.options.repository.updateAsset(asset.id, {
        cachePath: desiredPath,
        metadata: {
          title,
          artistName,
          ...(instrumentalPath ? { instrumentalPath } : {})
        }
      })) ?? asset
    );
  }

  /** 生成伴奏变体（默认抽第 2 条音轨），失败不阻塞主流程。 */
  private async ensureInstrumentalVariant(inputPath: string, trackIndex: number): Promise<string | null> {
    const extension = extname(inputPath) || ".mkv";
    const outputPath = `${inputPath.slice(0, -extension.length)}.instrumental${extension}`;
    try {
      const existing = (await stat(outputPath)).size;
      if (existing > 0) {
        return outputPath;
      }
    } catch {
      // 不存在，继续生成
    }
    try {
      await this.remuxInstrumental({ inputPath, outputPath, trackIndex });
      this.logger.info?.(`[online] instrumental variant ready: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.warn?.(`[online] instrumental remux failed for ${inputPath}: ${describeError(error)}`);
      return null;
    }
  }

  /** 为历史缓存补齐伴奏变体（启动时调用，幂等）。 */
  async backfillVariants(): Promise<number> {
    const assets = await this.options.repository.listAssets(200);
    let attached = 0;
    for (const asset of assets) {
      if (asset.status !== "ready" || !asset.cachePath) {
        continue;
      }
      if ((asset.audioTrackCount ?? 0) < 2) {
        continue;
      }
      let instrumentalPath = readInstrumentalPath(asset.metadata);
      if (!instrumentalPath) {
        instrumentalPath = await this.ensureInstrumentalVariant(asset.cachePath, 1);
        if (!instrumentalPath) {
          continue;
        }
        await this.options.repository.updateAsset(asset.id, {
          metadata: { instrumentalPath, instrumentalTrackIndex: 1 }
        });
      }
      if (asset.catalogSongId) {
        await this.promoter.attachVariant(asset.catalogSongId, instrumentalPath);
        attached += 1;
      }
    }
    return attached;
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

async function fileSizeOrZero(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

function providerSongNumber(asset: OnlineAssetRecord): string {
  return asset.providerAssetId;
}

function readInstrumentalPath(metadata: Record<string, unknown> | undefined): string | null {
  const value = metadata?.instrumentalPath;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStyleTags(metadata: Record<string, unknown> | undefined): string[] {
  const raw = metadata?.tags;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
}

function cacheFileName(
  songNumber: string,
  fileName: string,
  meta: { title: string | null; artistName: string | null }
): string {
  const extension = /\.[A-Za-z0-9]{2,5}$/u.exec(fileName)?.[0] ?? ".mkv";
  const title = sanitizeFilePart(meta.title);
  const artist = sanitizeFilePart(meta.artistName);
  if (!title || title === songNumber) {
    return `${songNumber}${extension}`;
  }
  return `${artist ? `${artist}-` : ""}${title}${extension}`;
}

function sanitizeFilePart(value: string | null): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/[\\/:*?"<>|\r\n\t]+/gu, "_")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^\.+|\.+$/gu, "")
    .slice(0, 80);
}

function readCacheNameMeta(metadata: Record<string, unknown> | undefined): {
  title: string | null;
  artistName: string | null;
} {
  const title = metadata?.title;
  const artistName = metadata?.artistName;
  return {
    title: typeof title === "string" && title.trim() ? title.trim() : null,
    artistName: typeof artistName === "string" && artistName.trim() ? artistName.trim() : null
  };
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
