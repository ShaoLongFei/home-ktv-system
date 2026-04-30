import path from "node:path";

export interface LibraryPaths {
  libraryRoot: string;
  songsRoot: string;
  importsPendingRoot: string;
  importsNeedsReviewRoot: string;
}

export function resolveLibraryPaths(mediaRoot: string): LibraryPaths {
  const libraryRoot = path.resolve(mediaRoot);

  return {
    libraryRoot,
    songsRoot: path.resolve(libraryRoot, "songs"),
    importsPendingRoot: path.resolve(libraryRoot, "imports", "pending"),
    importsNeedsReviewRoot: path.resolve(libraryRoot, "imports", "needs-review")
  };
}

export function toLibraryRelativePath(rootPath: string, absolutePath: string): string {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(absolutePath);
  const relativePath = path.relative(root, candidate);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Path is outside library root");
  }

  return relativePath.split(path.sep).join(path.posix.sep);
}
