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
}

export interface MediaGatewayOptions {
  playableMedia: PlayableMediaRepository;
  mediaPathResolver: MediaPathResolver;
  publicBaseUrl: string;
  onlineAssets?: OnlineCachedAssetRepository;
}

export class MediaGateway {
  constructor(private readonly options: MediaGatewayOptions) {}

  createPlaybackUrl(source: PlayableMediaLookup): string {
    const path = `/media/${encodeURIComponent(source.sourceType)}/${encodeURIComponent(source.assetId)}`;
    const baseUrl = this.options.publicBaseUrl.trim().replace(/\/$/, "");
    return baseUrl ? `${baseUrl}${path}` : path;
  }

  async resolveForStreaming(source: PlayableMediaLookup): Promise<MediaGatewayResolution> {
    if (source.sourceType === "online") {
      return this.resolveOnlineCachedAsset(source.assetId);
    }

    const asset = await this.options.playableMedia.findPlayableBySource(source);
    if (!asset) {
      return { ok: false, statusCode: 404, code: "MEDIA_SOURCE_NOT_FOUND" };
    }

    if (asset.status !== "ready") {
      return { ok: false, statusCode: 409, code: "MEDIA_SOURCE_NOT_READY" };
    }

    const resolved = await this.options.mediaPathResolver.resolveAssetFile(asset.filePath);
    if (!resolved.ok) {
      return this.mapPathResolutionFailure(resolved);
    }

    return {
      ok: true,
      sourceType: asset.sourceType,
      assetId: asset.assetId,
      filePath: resolved.filePath,
      contentLength: resolved.sizeBytes,
      contentType: inferVideoContentType(asset.filePath)
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
