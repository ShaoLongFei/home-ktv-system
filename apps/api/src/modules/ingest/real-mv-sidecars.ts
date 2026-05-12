import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { toLibraryRelativePath } from "./library-paths.js";

export const REAL_MV_MEDIA_EXTENSIONS = new Set([".mkv", ".mpg", ".mpeg"]);
export const REAL_MV_COVER_EXTENSIONS = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

export interface RealMvSidecarArtifact {
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  contentType?: string;
}

export interface RealMvSidecars {
  cover: RealMvSidecarArtifact | null;
  songJson: RealMvSidecarArtifact | null;
}

export function isRealMvMediaPath(filePath: string): boolean {
  return REAL_MV_MEDIA_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase());
}

export async function findRealMvSidecars(input: {
  mediaAbsolutePath: string;
  rootPath: string;
}): Promise<RealMvSidecars> {
  const directory = path.dirname(input.mediaAbsolutePath);
  const stem = stripExtension(path.basename(input.mediaAbsolutePath));
  const songJson = await firstExistingArtifact(input.rootPath, [
    path.join(directory, `${stem}.song.json`),
    path.join(directory, `${stem}.json`),
    ...(await hasExactlyOneRealMvMedia(directory) ? [path.join(directory, "song.json")] : [])
  ], "application/json");
  const cover = await firstExistingArtifact(
    input.rootPath,
    Array.from(REAL_MV_COVER_EXTENSIONS.keys()).map((extension) => path.join(directory, `${stem}${extension}`))
  );

  return { cover, songJson };
}

export function buildRealMvArtifactSignature(sidecars: RealMvSidecars): string {
  return ["cover", "songJson"]
    .map((key) => {
      const artifact = sidecars[key as keyof RealMvSidecars];
      if (!artifact) {
        return `${key}:none`;
      }
      return [
        key,
        artifact.relativePath,
        artifact.sizeBytes,
        artifact.mtimeMs,
        artifact.contentType ?? ""
      ].join(":");
    })
    .join("|");
}

async function firstExistingArtifact(
  rootPath: string,
  candidates: string[],
  contentType?: string
): Promise<RealMvSidecarArtifact | null> {
  for (const absolutePath of candidates) {
    const artifact = await readArtifact(rootPath, absolutePath, contentType);
    if (artifact) {
      return artifact;
    }
  }
  return null;
}

async function readArtifact(
  rootPath: string,
  absolutePath: string,
  fallbackContentType?: string
): Promise<RealMvSidecarArtifact | null> {
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return null;
    }
    const extension = path.extname(absolutePath).toLocaleLowerCase();
    const contentType = REAL_MV_COVER_EXTENSIONS.get(extension) ?? fallbackContentType;
    return {
      relativePath: toLibraryRelativePath(rootPath, absolutePath),
      sizeBytes: fileStat.size,
      mtimeMs: Math.trunc(fileStat.mtimeMs),
      ...(contentType ? { contentType } : {})
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function hasExactlyOneRealMvMedia(directory: string): Promise<boolean> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && isRealMvMediaPath(entry.name)).length === 1;
}

function stripExtension(fileName: string): string {
  return fileName.slice(0, fileName.length - path.extname(fileName).length);
}
