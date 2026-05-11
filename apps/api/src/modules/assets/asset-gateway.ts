import type { AssetId } from "@home-ktv/domain";
import type { AssetRepository } from "../catalog/repositories/asset-repository.js";
import type { MediaPathResolution, MediaPathResolver } from "./media-path-resolver.js";

export type AssetGatewayResolution =
  | { ok: true; assetId: AssetId; filePath: string; contentLength: number; contentType: string }
  | {
      ok: false;
      statusCode: 404 | 409 | 500 | 503;
      code:
        | "ASSET_NOT_FOUND"
        | "ASSET_NOT_READY"
        | "MEDIA_ROOT_NOT_CONFIGURED"
        | "MEDIA_PATH_REJECTED"
        | "MEDIA_FILE_NOT_FOUND";
    };

export interface AssetGatewayOptions {
  assetRepository: AssetRepository;
  mediaPathResolver: MediaPathResolver;
  publicBaseUrl: string;
}

export class AssetGateway {
  constructor(private readonly options: AssetGatewayOptions) {}

  createPlaybackUrl(assetId: AssetId): string {
    const path = `/media/${encodeURIComponent(assetId)}`;
    const baseUrl = this.options.publicBaseUrl.trim().replace(/\/$/, "");
    return baseUrl ? `${baseUrl}${path}` : path;
  }

  async resolveForStreaming(assetId: AssetId): Promise<AssetGatewayResolution> {
    const asset = await this.options.assetRepository.findById(assetId);
    if (!asset) {
      return { ok: false, statusCode: 404, code: "ASSET_NOT_FOUND" };
    }

    if (asset.status !== "ready") {
      return { ok: false, statusCode: 409, code: "ASSET_NOT_READY" };
    }

    const resolved = await this.options.mediaPathResolver.resolveAssetFile(asset.filePath);
    if (!resolved.ok) {
      return this.mapPathResolutionFailure(resolved);
    }

    return {
      ok: true,
      assetId,
      filePath: resolved.filePath,
      contentLength: resolved.sizeBytes,
      contentType: inferVideoContentType(asset.filePath)
    };
  }

  private mapPathResolutionFailure(resolved: Extract<MediaPathResolution, { ok: false }>): AssetGatewayResolution {
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

export function inferVideoContentType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".mkv")) return "video/x-matroska";
  if (lowerPath.endsWith(".mpg") || lowerPath.endsWith(".mpeg")) return "video/mpeg";
  if (lowerPath.endsWith(".webm")) {
    return "video/webm";
  }
  if (lowerPath.endsWith(".m4v")) {
    return "video/x-m4v";
  }
  return "video/mp4";
}
