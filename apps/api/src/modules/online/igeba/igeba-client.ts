import { mkdir, open, rename, stat, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";

export interface IgebaSong {
  songNumber: string;
  title: string;
  artistName: string;
  fileName: string;
  durationMs: number | null;
  language: string;
  album: string;
  description: string;
  mtvStyle: string;
  musicStyle: string;
  feeling: string;
  voiceChannel: string;
  coverUrl: string | null;
}

export interface IgebaSearchPage {
  songs: IgebaSong[];
  pageCount: number;
  recordCount: number;
}

export interface IgebaSongAddress {
  songNumber: string;
  fileName: string;
  fileUrl: string;
  sizeBytes: number;
  voiceChannel: string;
  rightsCode: number;
  attempts: number;
}

export interface IgebaSinger {
  singerId: string;
  singerName: string;
  otherName: string;
  mark: string;
  pictureUrl: string | null;
}

export interface IgebaHotModule {
  headId: string;
  title: string;
  subTitle: string;
  pictureUrl: string | null;
  link: string;
  objectType: string | null;
  objectId: string | null;
}

export interface IgebaHealth {
  ok: boolean;
  lastError: string | null;
  lastSuccessAt: string | null;
  cooldownUntil: string | null;
}

export interface IgebaClientOptions {
  baseUrl?: string;
  uid?: number;
  minIntervalMs?: number;
  requestTimeoutMs?: number;
  resolveAttempts?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class IgebaRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "IgebaRequestError";
  }
}

const DEFAULT_BASE_URL = "http://app.ige8.net";
const DEFAULT_MIN_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_RESOLVE_ATTEMPTS = 30;
const CLOUD_PATH = "/cloud.php";
const TELNET_PATH = "/telnet.php";
const PROTOCOL_VERSION = "1";
const COVER_BASE = "http://pub.amanktv.cn/uploads/images";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const COOLDOWN_MS = 60000;

/**
 * ige8 朴素的 Promise 串行限速器：所有出站请求共享同一个最小间隔。
 * 上游对高频调用会整体返回 403 Url Expired，所以这里必须串行 + 间隔。
 */
class RateLimiter {
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>
  ) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const wait = Math.max(0, this.lastStartedAt + this.minIntervalMs - this.now());
      if (wait > 0) {
        await this.sleep(wait);
      }
      this.lastStartedAt = this.now();
      return task();
    });
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

export class IgebaClient {
  private readonly baseUrl: string;
  private readonly uid: number;
  private readonly timeoutMs: number;
  private readonly attempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limiter: RateLimiter;

  private lastError: string | null = null;
  private lastSuccessAt: string | null = null;
  private cooldownUntil = 0;

  constructor(options: IgebaClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, "");
    this.uid = options.uid ?? 0;
    this.timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.attempts = options.resolveAttempts ?? DEFAULT_RESOLVE_ATTEMPTS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.limiter = new RateLimiter(options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS, this.now, this.sleep);
  }

  health(): IgebaHealth {
    const cooldown = this.cooldownUntil > this.now() ? new Date(this.cooldownUntil).toISOString() : null;
    return {
      ok: this.lastError === null && cooldown === null,
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt,
      cooldownUntil: cooldown
    };
  }

  async search(keyword: string, options: { page?: number; pageSize?: number } = {}): Promise<IgebaSearchPage> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return { songs: [], pageCount: 0, recordCount: 0 };
    }

    const payload = await this.postCloud("GET_SONGS", {
      UserId: this.uid,
      Filter: { Name: trimmed },
      Page: {
        PageNo: Math.max(1, Math.trunc(options.page ?? 1)),
        PageSize: Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 20)))
      }
    });

    return parseSongPage(payload, "search");
  }

  /**
   * 按「包」取歌：PACKAGE_TYPE = { SINGER:1, ALBUM:2, PLAYLIST:3, RANK:4, PLAYLIST_PRI:5 }。
   * 用于榜单 / 歌单 / 专辑的一键补库。
   */
  async packageSongs(input: {
    packageType: number;
    packageId: string;
    page?: number;
    pageSize?: number;
  }): Promise<IgebaSearchPage> {
    const payload = await this.postCloud("GET_SONGS", {
      UserId: this.uid,
      Filter: { Package: { Type: input.packageType, Id: input.packageId } },
      Page: {
        PageNo: Math.max(1, Math.trunc(input.page ?? 1)),
        PageSize: Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 20)))
      }
    });
    return parseSongPage(payload, "package");
  }

  /** 热门歌手列表（PackageType=1）。 */
  async singerList(options: { page?: number; pageSize?: number } = {}): Promise<{
    singers: IgebaSinger[];
    pageCount: number;
    recordCount: number;
  }> {
    const payload = await this.postCloud("GET_PACGS", {
      UserId: this.uid,
      PackageType: 1,
      Page: {
        PageNo: Math.max(1, Math.trunc(options.page ?? 1)),
        PageSize: Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 12)))
      }
    });
    const list = isRecord(payload) && Array.isArray(payload.List) ? payload.List : [];
    const page = isRecord(payload) && isRecord(payload.Page) ? payload.Page : {};
    return {
      singers: list.filter(isRecord).map((item) => ({
        singerId: asString(item.SingerId),
        singerName: asString(item.SingerName),
        otherName: asString(item.OtherName),
        mark: asString(item.Mark),
        pictureUrl: asString(item.MidPicture) || asString(item.LargePicture) || null
      })),
      pageCount: toInt(page.PageCount),
      recordCount: toInt(page.RecordCount)
    };
  }

  /** 曲风标签（TagType=4 为音乐风格）。 */
  async musicStyles(): Promise<string[]> {
    const payload = await this.postCloud("GET_TAGS", { TagType: 4, TagFor: 1, TagTo: 2 });
    const tags = isRecord(payload) && Array.isArray(payload.Tags) ? payload.Tags : [];
    return tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
  }

  /** 按歌手取歌：Filter.Package{Type:1,Id:SingerId}。 */
  async songsBySingerId(
    singerId: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<IgebaSearchPage> {
    const payload = await this.postCloud("GET_SONGS", {
      UserId: this.uid,
      Filter: { Package: { Type: 1, Id: singerId } },
      Order: [{ Hot: 1 }],
      Page: {
        PageNo: Math.max(1, Math.trunc(options.page ?? 1)),
        PageSize: Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 20)))
      }
    });
    return parseSongPage(payload, "singer");
  }

  /** 按曲风取歌：Filter.MusicStyle。 */
  async songsByStyle(
    style: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<IgebaSearchPage> {
    const payload = await this.postCloud("GET_SONGS", {
      UserId: this.uid,
      Filter: { MusicStyle: style },
      Order: [{ Hot: 1 }],
      Page: {
        PageNo: Math.max(1, Math.trunc(options.page ?? 1)),
        PageSize: Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 20)))
      }
    });
    return parseSongPage(payload, "style");
  }

  /** 首页运营位（专题 / 榜单入口）。 */
  async hotModules(): Promise<IgebaHotModule[]> {
    const payload = await this.postCloud("GET_HEADS", { UserId: this.uid });
    const list = isRecord(payload) && Array.isArray(payload.List) ? payload.List : [];
    return list.filter(isRecord).map((item) => {
      const link = asString(item.Link);
      return {
        headId: asString(item.HeadId),
        title: asString(item.Title),
        subTitle: asString(item.SubTitle),
        pictureUrl: asString(item.Picture) || null,
        link,
        objectType: parseAppLinkParam(link, "Object"),
        objectId: parseAppLinkParam(link, "ObjectId")
      };
    });
  }

  /**
   * 取播放地址。上游双门户 token 不一致（约 30% 的 rid 会被文件节点判为
   * Url Expired），因此每次拿到地址都要用 1KB Range 探测，失败重新取址。
   */
  async resolveAddress(songNumber: string, attempts = this.attempts): Promise<IgebaSongAddress> {
    let lastFailure: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const payload = await this.postTelnet("GET_SONGADDR", { SongNumber: songNumber, UserId: this.uid });
      if (!isRecord(payload)) {
        throw new IgebaRequestError(`ige8 resolve returned non-object for ${songNumber}`, false);
      }

      const fileUrl = typeof payload.FileUrl === "string" ? payload.FileUrl.trim() : "";
      if (!fileUrl) {
        const rights = isRecord(payload.Rights) ? payload.Rights : {};
        throw new IgebaRequestError(
          `ige8 has no playable url for ${songNumber} (rights=${String(rights.Code ?? "?")})`,
          false
        );
      }

      try {
        const sizeBytes = await this.probeUrl(fileUrl);
        this.markSuccess();
        return {
          songNumber,
          fileName: typeof payload.FileName === "string" ? payload.FileName : `${songNumber}.mkv`,
          fileUrl,
          sizeBytes,
          voiceChannel: typeof payload.VoiceChannel === "string" ? payload.VoiceChannel : "",
          rightsCode: isRecord(payload.Rights) ? toInt(payload.Rights.Code) : 0,
          attempts: attempt
        };
      } catch (error) {
        lastFailure = error;
        if (error instanceof IgebaRequestError && !error.retryable) {
          throw error;
        }
        await this.sleep(this.backoff(attempt));
      }
    }

    this.enterCooldown();
    throw new IgebaRequestError(
      `ige8 resolve failed for ${songNumber} after ${attempts} attempts: ${describeError(lastFailure)}`,
      false
    );
  }

  /** 用闭合区间 Range 探测链接是否可用，返回文件总长度。 */
  async probeUrl(fileUrl: string): Promise<number> {
    for (const range of ["bytes=0-0", "bytes=0-1023"]) {
      const response = await this.request(fileUrl, { Range: range });
      if (response.ok) {
        const total = parseContentRangeTotal(response.headers.get("content-range"));
        if (total !== null) {
          await response.body?.cancel();
          return total;
        }
        const length = Number.parseInt(response.headers.get("content-length") ?? "", 10);
        await response.body?.cancel();
        return Number.isFinite(length) ? length : 0;
      }
      const reason = await readReason(response);
      if (range === "bytes=0-0" && reason.includes("Invalid Range")) {
        continue;
      }
      throw new IgebaRequestError(`probe failed (${response.status}): ${reason}`, isRetryableStatus(response.status, reason));
    }
    throw new IgebaRequestError("probe failed: no usable range response", true);
  }

  /**
   * 分块下载到本地文件。文件节点只接受闭合区间，且实际返回长度是 end-start，
   * 因此以短读 EOF 收敛，不做严格 content-length 相等校验。
   */
  async downloadToFile(
    address: IgebaSongAddress,
    targetPath: string,
    options: {
      chunkSize?: number;
      refresh?: () => Promise<IgebaSongAddress>;
      onChunk?: (writtenBytes: number, totalBytes: number) => void;
    } = {}
  ): Promise<{ path: string; bytes: number; refreshes: number }> {
    const chunkSize = options.chunkSize ?? 4 * 1024 * 1024;
    const partPath = `${targetPath}.part`;
    await mkdir(dirname(targetPath), { recursive: true });

    let fileUrl = address.fileUrl;
    let total = address.sizeBytes;
    let offset = await existingSize(partPath);
    if (total > 0 && offset >= total) {
      await rename(partPath, targetPath);
      return { path: targetPath, bytes: offset, refreshes: 0 };
    }
    offset -= offset % chunkSize;

    const handle = await openForWrite(partPath);
    let refreshes = 0;
    try {
      await handle.truncate(offset);
      while (total <= 0 || offset < total) {
        const start = offset;
        const end = total > 0 ? Math.min(start + chunkSize - 1, total - 1) : start + chunkSize - 1;
        const requested = end - start + 1;
        let response: Response;
        try {
          response = await this.request(fileUrl, { Range: `bytes=${start}-${end}` });
          if (!response.ok) {
            const reason = await readReason(response);
            throw new IgebaRequestError(
              `download chunk failed (${response.status}): ${reason}`,
              isRetryableStatus(response.status, reason)
            );
          }
        } catch (error) {
          if (options.refresh && refreshes < 5 && isRetryableError(error)) {
            refreshes += 1;
            await this.sleep(this.backoff(refreshes));
            const refreshed = await options.refresh();
            fileUrl = refreshed.fileUrl;
            if (refreshed.sizeBytes > 0) {
              total = refreshed.sizeBytes;
            }
            continue;
          }
          throw error;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength === 0) {
          break;
        }
        await handle.write(buffer, 0, buffer.byteLength, offset);
        offset += buffer.byteLength;
        options.onChunk?.(offset, total);
        if (buffer.byteLength < requested - 1) {
          break;
        }
      }
    } finally {
      await handle.close();
    }

    const produced = (await stat(partPath)).size;
    if (total > 0 && produced < total - 1) {
      throw new IgebaRequestError(`download incomplete: ${produced}/${total} bytes`, true);
    }
    await rename(partPath, targetPath);
    this.markSuccess();
    return { path: targetPath, bytes: produced, refreshes };
  }

  async probeHealth(): Promise<IgebaHealth> {
    try {
      await this.search("测试", { pageSize: 1 });
      this.markSuccess();
    } catch (error) {
      this.lastError = describeError(error);
    }
    return this.health();
  }

  private backoff(attempt: number): number {
    const base = Math.min(200 * 2 ** Math.min(attempt - 1, 3), 800);
    const jitter = Math.random() * 150;
    return (attempt > 20 ? base + 1000 : base) + jitter;
  }

  private enterCooldown(): void {
    this.cooldownUntil = this.now() + COOLDOWN_MS;
    this.lastError = "cooldown: repeated resolve failures";
  }

  private markSuccess(): void {
    this.lastError = null;
    this.lastSuccessAt = new Date(this.now()).toISOString();
  }

  private async postCloud(command: string, params: Record<string, unknown>): Promise<unknown> {
    const body = new URLSearchParams({ CMD: command, PARAMS: JSON.stringify(params) });
    const response = await this.limiter.run(() =>
      this.request(`${this.baseUrl}${CLOUD_PATH}`, {}, body)
    );
    if (!response.ok) {
      const reason = await readReason(response);
      this.lastError = `cloud ${command} ${response.status}: ${reason}`;
      throw new IgebaRequestError(`cloud ${command} failed (${response.status}): ${reason}`, isRetryableStatus(response.status, reason));
    }
    return response.json();
  }

  private async postTelnet(command: string, params: Record<string, unknown>): Promise<unknown> {
    const body = new URLSearchParams({
      VER: PROTOCOL_VERSION,
      CMD: command,
      PARAMS: JSON.stringify(params)
    });
    const response = await this.limiter.run(() =>
      this.request(`${this.baseUrl}${TELNET_PATH}`, {}, body)
    );
    if (!response.ok) {
      const reason = await readReason(response);
      this.lastError = `telnet ${command} ${response.status}: ${reason}`;
      throw new IgebaRequestError(`telnet ${command} failed (${response.status}): ${reason}`, isRetryableStatus(response.status, reason));
    }
    return response.json();
  }

  private async request(url: string, headers: Record<string, string>, body?: URLSearchParams): Promise<Response> {
    const init: RequestInit = {
      method: body ? "POST" : "GET",
      headers: {
        "user-agent": USER_AGENT,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...headers
      },
      signal: AbortSignal.timeout(this.timeoutMs)
    };
    if (body) {
      init.body = body.toString();
    }
    return this.fetchImpl(url, init);
  }
}

function parseSongPage(payload: unknown, label: string): IgebaSearchPage {
  if (Array.isArray(payload)) {
    return { songs: [], pageCount: 0, recordCount: 0 };
  }
  if (isRecord(payload) && "Result" in payload && !("List" in payload)) {
    throw new IgebaRequestError(
      `ige8 ${label} rejected: ${String(payload.Description ?? payload.Result)}`,
      false
    );
  }

  const list = isRecord(payload) && Array.isArray(payload.List) ? payload.List : [];
  const page = isRecord(payload) && isRecord(payload.Page) ? payload.Page : {};
  return {
    songs: list.filter(isRecord).map((item) => mapSong(item)),
    pageCount: toInt(page.PageCount),
    recordCount: toInt(page.RecordCount)
  };
}

function parseAppLinkParam(link: string, key: string): string | null {
  const match = new RegExp(`(?:^|[?&/=])${key}=([^&]+)`, "u").exec(link);
  return match?.[1] ?? null;
}

function mapSong(item: Record<string, unknown>): IgebaSong {
  const songNumber = asString(item.SongNumber);
  const duration = Number.parseInt(asString(item.Duration), 10);
  return {
    songNumber,
    title: asString(item.SongName),
    artistName: asString(item.SingerName),
    fileName: asString(item.FileName),
    durationMs: Number.isFinite(duration) && duration > 0 ? duration * 1000 : null,
    language: asString(item.LanguageName),
    album: asString(item.Album),
    description: asString(item.Description),
    mtvStyle: asString(item.MtvStyle),
    musicStyle: asString(item.MusicStyle),
    feeling: asString(item.Feeling),
    voiceChannel: asString(item.VoiceChannel),
    coverUrl: songNumber ? `${COVER_BASE}/${songNumber}.jpg` : null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function toInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function parseContentRangeTotal(header: string | null): number | null {
  if (!header) {
    return null;
  }
  const total = header.split("/")[1]?.trim();
  if (!total) {
    return null;
  }
  const parsed = Number.parseInt(total, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRetryableStatus(status: number, reason: string): boolean {
  if (status === 403) {
    return reason.includes("Url Expired") || reason.includes("Anonymous User");
  }
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof IgebaRequestError) {
    return error.retryable;
  }
  return error instanceof Error && error.name === "TimeoutError";
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readReason(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200) || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function existingSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function openForWrite(path: string): Promise<FileHandle> {
  try {
    return await open(path, "r+");
  } catch {
    return open(path, "w+");
  }
}

export { COVER_BASE, DEFAULT_BASE_URL };
