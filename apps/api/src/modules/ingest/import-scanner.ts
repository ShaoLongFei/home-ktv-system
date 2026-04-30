import { createHash } from "node:crypto";
import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ImportFile, ImportFileRootKind, ImportScanScope, ImportScanTrigger } from "@home-ktv/domain";
import type { CandidateBuilder } from "./candidate-builder.js";
import type { LibraryPaths } from "./library-paths.js";
import { toLibraryRelativePath } from "./library-paths.js";
import { probeMediaFile, type MediaProbeSummary } from "./media-probe.js";
import type { ImportFileRepository } from "./repositories/import-file-repository.js";
import type { ScanRunRepository } from "./repositories/scan-run-repository.js";

export interface ImportScannerOptions {
  paths: LibraryPaths;
  importFiles: ImportFileRepository;
  scanRuns: ScanRunRepository;
  candidateBuilder: Pick<CandidateBuilder, "buildFromImportFiles">;
  probeMedia?: ProbeMediaFunction;
}

export interface ScanInput {
  trigger: ImportScanTrigger;
  scope: ImportScanScope;
  pathHint?: string;
}

export type ProbeMediaFunction = (filePath: string) => Promise<MediaProbeSummary>;

interface ScanRoot {
  rootKind: ImportFileRootKind;
  rootPath: string;
}

interface DiscoveredFile {
  rootKind: ImportFileRootKind;
  rootPath: string;
  absolutePath: string;
  relativePath: string;
}

interface ScanCounters {
  filesSeen: number;
  filesAdded: number;
  filesChanged: number;
  filesDeleted: number;
  candidateCount: number;
}

const MEDIA_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".webm"]);
const QUICK_HASH_BYTES = 64 * 1024;

export class ImportScanner {
  private readonly probeMedia: ProbeMediaFunction;

  constructor(private readonly options: ImportScannerOptions) {
    this.probeMedia = options.probeMedia ?? probeMediaFile;
  }

  async scan(input: ScanInput): Promise<ScanCounters> {
    const run = await this.options.scanRuns.startRun(input);
    const counters: ScanCounters = {
      filesSeen: 0,
      filesAdded: 0,
      filesChanged: 0,
      filesDeleted: 0,
      candidateCount: 0
    };

    try {
      const changedImportFiles: ImportFile[] = [];
      const deleted = await this.handleDeletedPathHint(input);
      counters.filesDeleted += deleted;

      if (!deleted) {
        for (const discovered of await this.discoverFiles(input)) {
          counters.filesSeen += 1;
          const { importFile, added, changed } = await this.persistDiscoveredFile(discovered, run.id);
          counters.filesAdded += added ? 1 : 0;
          counters.filesChanged += changed ? 1 : 0;

          if (changed && isImportRoot(discovered.rootKind)) {
            changedImportFiles.push(importFile);
          }
        }
      }

      counters.candidateCount = await this.options.candidateBuilder.buildFromImportFiles(changedImportFiles);
      await this.options.scanRuns.finishRun({
        scanRunId: run.id,
        status: "completed",
        ...counters
      });
      return counters;
    } catch (error) {
      await this.options.scanRuns.finishRun({
        scanRunId: run.id,
        status: "failed",
        ...counters,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async persistDiscoveredFile(
    discovered: DiscoveredFile,
    scanRunId: string
  ): Promise<{ importFile: ImportFile; added: boolean; changed: boolean }> {
    const fileStat = await stat(discovered.absolutePath);
    const sizeBytes = fileStat.size;
    const mtimeMs = Math.trunc(fileStat.mtimeMs);
    const quickHash = await computeQuickHash(discovered.absolutePath, sizeBytes);
    const existing = await this.options.importFiles.findByRootAndRelativePath(discovered.rootKind, discovered.relativePath);
    const unchanged =
      Boolean(existing) &&
      existing?.sizeBytes === sizeBytes &&
      existing.mtimeMs === mtimeMs &&
      existing.quickHash === quickHash;

    if (unchanged && existing) {
      const importFile = await this.options.importFiles.upsertDiscoveredFile({
        rootKind: discovered.rootKind,
        relativePath: discovered.relativePath,
        sizeBytes,
        mtimeMs,
        quickHash,
        probeStatus: "skipped",
        probePayload: existing.probePayload,
        durationMs: existing.durationMs,
        lastSeenScanRunId: scanRunId
      });
      return { importFile, added: false, changed: false };
    }

    const probe = await this.probeChangedFile(discovered.absolutePath);
    const importFile = await this.options.importFiles.upsertDiscoveredFile({
      rootKind: discovered.rootKind,
      relativePath: discovered.relativePath,
      sizeBytes,
      mtimeMs,
      quickHash,
      probeStatus: probe.status,
      probePayload: probe.payload,
      durationMs: probe.durationMs,
      lastSeenScanRunId: scanRunId
    });

    return {
      importFile,
      added: !existing,
      changed: true
    };
  }

  private async probeChangedFile(
    absolutePath: string
  ): Promise<{ status: "probed" | "failed"; payload: Record<string, unknown>; durationMs: number | null }> {
    try {
      const summary = await this.probeMedia(absolutePath);
      return {
        status: "probed",
        payload: summary as unknown as Record<string, unknown>,
        durationMs: summary.durationMs
      };
    } catch (error) {
      return {
        status: "failed",
        payload: {
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        durationMs: null
      };
    }
  }

  private async discoverFiles(input: ScanInput): Promise<DiscoveredFile[]> {
    const roots = rootsForScope(this.options.paths, input.scope);
    const hintedFile = await this.discoverPathHint(input.pathHint, roots);
    if (hintedFile) {
      return [hintedFile];
    }

    const files: DiscoveredFile[] = [];
    for (const root of roots) {
      files.push(...(await walkRoot(root)));
    }
    return files;
  }

  private async discoverPathHint(pathHint: string | undefined, roots: ScanRoot[]): Promise<DiscoveredFile | null> {
    if (!pathHint) {
      return null;
    }

    const absolutePath = path.resolve(pathHint);
    const root = findContainingRoot(roots, absolutePath);
    if (!root || !isSupportedFile(absolutePath)) {
      return null;
    }

    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        return null;
      }
    } catch {
      return null;
    }

    return {
      rootKind: root.rootKind,
      rootPath: root.rootPath,
      absolutePath,
      relativePath: toLibraryRelativePath(root.rootPath, absolutePath)
    };
  }

  private async handleDeletedPathHint(input: ScanInput): Promise<number> {
    if (!input.pathHint) {
      return 0;
    }

    const absolutePath = path.resolve(input.pathHint);
    try {
      await stat(absolutePath);
      return 0;
    } catch {
      const root = findContainingRoot(rootsForScope(this.options.paths, input.scope), absolutePath);
      if (!root) {
        return 0;
      }

      await this.options.importFiles.markDeleted({
        rootKind: root.rootKind,
        relativePath: toLibraryRelativePath(root.rootPath, absolutePath)
      });
      return 1;
    }
  }
}

function rootsForScope(paths: LibraryPaths, scope: ImportScanScope): ScanRoot[] {
  const importsRoots: ScanRoot[] = [
    { rootKind: "imports_pending", rootPath: paths.importsPendingRoot },
    { rootKind: "imports_needs_review", rootPath: paths.importsNeedsReviewRoot }
  ];
  const songsRoots: ScanRoot[] = [{ rootKind: "songs", rootPath: paths.songsRoot }];

  if (scope === "imports") {
    return importsRoots;
  }
  if (scope === "songs") {
    return songsRoots;
  }
  return [...importsRoots, ...songsRoots];
}

async function walkRoot(root: ScanRoot, currentPath = root.rootPath): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = [];

  try {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walkRoot(root, absolutePath)));
        continue;
      }

      if (entry.isFile() && isSupportedFile(absolutePath)) {
        files.push({
          rootKind: root.rootKind,
          rootPath: root.rootPath,
          absolutePath,
          relativePath: toLibraryRelativePath(root.rootPath, absolutePath)
        });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return files;
}

function isSupportedFile(filePath: string): boolean {
  const baseName = path.basename(filePath).toLocaleLowerCase();
  return baseName === "song.json" || MEDIA_EXTENSIONS.has(path.extname(baseName));
}

function findContainingRoot(roots: ScanRoot[], absolutePath: string): ScanRoot | null {
  return roots.find((root) => {
    const relativePath = path.relative(root.rootPath, absolutePath);
    return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  }) ?? null;
}

function isImportRoot(rootKind: ImportFileRootKind): boolean {
  return rootKind === "imports_pending" || rootKind === "imports_needs_review";
}

async function computeQuickHash(filePath: string, sizeBytes: number): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(sizeBytes, QUICK_HASH_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const hash = createHash("sha1").update(buffer.subarray(0, bytesRead)).digest("hex");
    return `${sizeBytes}:${hash}`;
  } finally {
    await handle.close();
  }
}
