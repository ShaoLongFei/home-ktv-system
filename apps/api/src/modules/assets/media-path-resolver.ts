import { stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

export type MediaPathResolution =
  | { ok: true; filePath: string; sizeBytes: number }
  | { ok: false; reason: "media-root-not-configured" | "path-outside-media-root" | "file-not-found" | "not-a-file" };

export interface MediaPathResolverOptions {
  mediaRoot: string;
}

export class MediaPathResolver {
  private readonly mediaRoot: string;

  constructor(options: MediaPathResolverOptions) {
    this.mediaRoot = options.mediaRoot.trim() ? resolve(options.mediaRoot) : "";
  }

  async resolveAssetFile(filePath: string): Promise<MediaPathResolution> {
    if (!this.mediaRoot) {
      return { ok: false, reason: "media-root-not-configured" };
    }

    const candidatePath = isAbsolute(filePath) ? resolve(filePath) : resolve(this.mediaRoot, filePath);
    const rootPrefix = this.mediaRoot.endsWith(sep) ? this.mediaRoot : `${this.mediaRoot}${sep}`;

    if (candidatePath !== this.mediaRoot && !candidatePath.startsWith(rootPrefix)) {
      return { ok: false, reason: "path-outside-media-root" };
    }

    try {
      const fileStat = await stat(candidatePath);
      if (!fileStat.isFile()) {
        return { ok: false, reason: "not-a-file" };
      }

      return {
        ok: true,
        filePath: candidatePath,
        sizeBytes: fileStat.size
      };
    } catch {
      return { ok: false, reason: "file-not-found" };
    }
  }
}
