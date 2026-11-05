import type { AssetId, SongSourceType } from "@home-ktv/domain";
import { inferVideoContentType } from "./content-type.js";
import type { MediaPathResolution, MediaPathResolver } from "../assets/media-path-resolver.js";
import type { PlayableMediaLookup, PlayableMediaRepository } from "./playable-media-repository.js";

export type MediaGatewayResolution =
  | {
      ok: true;
      sourceType: SongSourceType;
      assetId: AssetId;
      filePath: string;
      contentLength: number;
      contentType: string;
    }
  | {
      ok: false;
      statusCode: 404 | 409 | 500 | 501 | 503;
      code:
        | "MEDIA_SOURCE_NOT_FOUND"
        | "MEDIA_SOURCE_NOT_READY"
        | "MEDIA_ROOT_NOT_CONFIGURED"
        | "MEDIA_PATH_REJECTED"
        | "MEDIA_FILE_NOT_FOUND"
        | "ONLINE_ASSET_NOT_FOUND"
        | "ONLINE_ASSET_NOT_READY"
        | "ONLINE_PLAYBACK_NOT_IMPLEMENTED";
    };

export interface OnlineCachedAssetLookup {
  status: string;
  cachePath: string | null;
}

export interface OnlineCachedAssetRepository {
  findAssetById(assetId: string): Promise<OnlineCachedAssetLookup | null>;
  findAssetByCatalogSongId?(catalogSongId: string): Promise<OnlineCachedAssetLookup | null>;
}

/** 在线歌曲提升成本地条目后使用的 id 前缀，播放时优先走在线缓存。 */
export const ONLINE_CATALOG_SONG_PREFIX = "ktv-online-";

export interface MediaGatewayOptions {
  playableMedia: PlayableMediaRepository;
  mediaPathResolver: MediaPathResolver;
  publicBaseUrl: string;
  onlineAssets?: OnlineCachedAssetRepository;
}

export class MediaGateway {
  constructor(private readonly options: MediaGatewayOptions) {}

  createPlaybackUrl(source: PlayableMediaLookup): string {
    const variantQuery = source.variant ? `?variant=${encodeURIComponent(source.variant)}` : "";
    const path = `/media/${encodeURIComponent(source.sourceType)}/${encodeURIComponent(source.assetId)}${variantQuery}`;
    const baseUrl = this.options.publicBaseUrl.trim().replace(/\/$/, "");
    return baseUrl ? `${baseUrl}${path}` : path;
  }

  async resolveForStreaming(source: PlayableMediaLookup): Promise<MediaGatewayResolution> {
    if (source.sourceType === "online") {
      return this.resolveOnlineCachedAsset(source.assetId);
    }

    if (!source.variant && source.assetId.startsWith(ONLINE_CATALOG_SONG_PREFIX)) {
      const cached = await this.resolvePromotedOnlineAsset(source.assetId);
      if (cached) {
        return cached;
      }
    }

    const asset = await this.options.playableMedia.findPlayableBySource(source);
    if (!asset) {
      return { ok: false, statusCode: 404, code: "MEDIA_SOURCE_NOT_FOUND" };
    }

    if (asset.status !== "ready") {
      return { ok: false, statusCode: 409, code: "MEDIA_SOURCE_NOT_READY" };
    }

    if (source.variant && !asset.variantFilePaths?.[source.variant]) {
      return { ok: false, statusCode: 404, code: "MEDIA_FILE_NOT_FOUND" };
    }

    const filePath = source.variant
      ? (asset.variantFilePaths?.[source.variant] ?? asset.filePath)
      : asset.filePath;

    const resolved = await this.options.mediaPathResolver.resolveAssetFile(filePath);
    if (!resolved.ok) {
      return this.mapPathResolutionFailure(resolved);
    }

    return {
      ok: true,
      sourceType: asset.sourceType,
      assetId: asset.assetId,
      filePath: resolved.filePath,
      contentLength: resolved.sizeBytes,
      contentType: inferVideoContentType(filePath)
    };
  }

  /**
   * 提升后的在线歌曲（ktv-online-*）绕过 NAS 探测状态，直接用缓存文件，
   * 避免 ffprobe 尚未执行时被判定为不可播。
   */
  private async resolvePromotedOnlineAsset(assetId: AssetId): Promise<MediaGatewayResolution | null> {
    const repository = this.options.onlineAssets;
    if (!repository?.findAssetByCatalogSongId) {
      return null;
    }

    const asset = await repository.findAssetByCatalogSongId(assetId);
    if (!asset) {
      return null;
    }
    if (asset.status !== "ready" || !asset.cachePath) {
      return { ok: false, statusCode: 409, code: "ONLINE_ASSET_NOT_READY" };
    }

    const resolved = await this.options.mediaPathResolver.resolveAssetFile(asset.cachePath);
    if (!resolved.ok) {
      return this.mapPathResolutionFailure(resolved);
    }

    return {
      ok: true,
      sourceType: "nas",
      assetId,
      filePath: resolved.filePath,
      contentLength: resolved.sizeBytes,
      contentType: inferVideoContentType(asset.cachePath)
    };
  }

  /**
   * 在线歌曲永远走本地缓存文件，绝不 302 到第三方 CDN：
   * 未就绪返回 409，让前端展示「准备中」并轮询。
   */
  private async resolveOnlineCachedAsset(assetId: AssetId): Promise<MediaGatewayResolution> {
    if (!this.options.onlineAssets) {
      return { ok: false, statusCode: 501, code: "ONLINE_PLAYBACK_NOT_IMPLEMENTED" };
    }

    const asset = await this.options.onlineAssets.findAssetById(assetId);
    if (!asset) {
      return { ok: false, statusCode: 404, code: "ONLINE_ASSET_NOT_FOUND" };
    }
    if (asset.status !== "ready" || !asset.cachePath) {
      return { ok: false, statusCode: 409, code: "ONLINE_ASSET_NOT_READY" };
    }

    const resolved = await this.options.mediaPathResolver.resolveAssetFile(asset.cachePath);
    if (!resolved.ok) {
      return this.mapPathResolutionFailure(resolved);
    }

    return {
      ok: true,
      sourceType: "online",
      assetId,
      filePath: resolved.filePath,
      contentLength: resolved.sizeBytes,
      contentType: inferVideoContentType(asset.cachePath)
    };
  }

  private mapPathResolutionFailure(resolved: Extract<MediaPathResolution, { ok: false }>): MediaGatewayResolution {
    switch (resolved.reason) {
      case "media-root-not-configured":
        return { ok: false, statusCode: 503, code: "MEDIA_ROOT_NOT_CONFIGURED" };
      case "path-outside-media-root":
        return { ok: false, statusCode: 500, code: "MEDIA_PATH_REJECTED" };
      case "file-not-found":
      case "not-a-file":
        return { ok: false, statusCode: 404, code: "MEDIA_FILE_NOT_FOUND" };
    }
  }
}
