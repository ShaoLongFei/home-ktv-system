import { createHash } from "node:crypto";
import { open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { CompatibilityReason, ImportFile, ImportFileRootKind, ImportScanScope, ImportScanTrigger } from "@home-ktv/domain";
import type { CandidateBuilder } from "./candidate-builder.js";
import type { LibraryPaths } from "./library-paths.js";
import { toLibraryRelativePath } from "./library-paths.js";
import { probeMediaFile, type MediaProbeSummary } from "./media-probe.js";
import { parseRealMvSidecarJson, type RealMvSidecarMetadata } from "./real-mv-metadata.js";
import {
  buildRealMvArtifactSignature,
  findRealMvSidecars,
  isRealMvMediaPath,
  type RealMvSidecars
} from "./real-mv-sidecars.js";
import type { ImportFileRepository } from "./repositories/import-file-repository.js";
import type { ScanRunRepository } from "./repositories/scan-run-repository.js";

export interface ImportScannerOptions {
  paths: LibraryPaths;
  importFiles: Pick<ImportFileRepository, "findByRootAndRelativePath" | "upsertDiscoveredFile" | "markDeleted">;
  scanRuns: ScanRunRepository;
  candidateBuilder: Pick<CandidateBuilder, "buildFromImportFiles">;
  probeMedia?: ProbeMediaFunction;
  fileStabilityCheck?: FileStabilityCheckFunction;
}

export interface ScanInput {
  trigger: ImportScanTrigger;
  scope: ImportScanScope;
  pathHint?: string;
}

export type ProbeMediaFunction = (filePath: string) => Promise<MediaProbeSummary>;
export type FileStabilityCheckFunction = (filePath: string) => Promise<boolean>;

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

interface RealMvScannerPayload {
  sidecarMetadata?: RealMvSidecarMetadata;
  scannerReasons: CompatibilityReason[];
}

const MEDIA_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".webm", ".mpg", ".mpeg"]);
const QUICK_HASH_BYTES = 64 * 1024;
const FILE_UNSTABLE_REASON = {
  code: "file-unstable",
  severity: "warning",
  source: "scanner"
} as const;

export class ImportScanner {
  private readonly probeMedia: ProbeMediaFunction;
  private readonly fileStabilityCheck: FileStabilityCheckFunction;

  constructor(private readonly options: ImportScannerOptions) {
    this.probeMedia = options.probeMedia ?? probeMediaFile;
    this.fileStabilityCheck = options.fileStabilityCheck ?? waitForStableFile;
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
    const sidecars = isRealMvMediaPath(discovered.absolutePath)
      ? await findRealMvSidecars({ mediaAbsolutePath: discovered.absolutePath, rootPath: discovered.rootPath })
      : null;
    const realMvPayload = sidecars
      ? await buildRealMvScannerPayload(discovered.rootPath, sidecars)
      : null;
    const existing = await this.options.importFiles.findByRootAndRelativePath(discovered.rootKind, discovered.relativePath);
    if (sidecars && !(await this.fileStabilityCheck(discovered.absolutePath))) {
      const quickHash = buildUnstableRealMvQuickHash(fileStat, sidecars);
      const importFile = await this.options.importFiles.upsertDiscoveredFile({
        rootKind: discovered.rootKind,
        relativePath: discovered.relativePath,
        sizeBytes,
        mtimeMs,
        quickHash,
        probeStatus: "pending",
        probePayload: mergeRealMvSidecars({
          realMv: {
            scannerReasons: [...(realMvPayload?.scannerReasons ?? []), FILE_UNSTABLE_REASON],
            ...(realMvPayload?.sidecarMetadata ? { sidecarMetadata: realMvPayload.sidecarMetadata } : {})
          }
        }, sidecars),
        durationMs: null,
        lastSeenScanRunId: scanRunId
      });
      return {
        importFile,
        added: !existing,
        changed: true
      };
    }
    const mediaQuickHash = await computeQuickHash(discovered.absolutePath, sizeBytes);
    const quickHash = sidecars
      ? `media:${mediaQuickHash}|artifacts:${buildRealMvArtifactSignature(sidecars)}`
      : mediaQuickHash;
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

    const probe = await this.probeChangedFile(discovered.absolutePath, sidecars, realMvPayload);
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
    absolutePath: string,
    sidecars: RealMvSidecars | null,
    realMvPayload: RealMvScannerPayload | null
  ): Promise<{ status: "probed" | "failed"; payload: Record<string, unknown>; durationMs: number | null }> {
    try {
      const summary = await this.probeMedia(absolutePath);
      return {
        status: "probed",
        payload: mergeRealMvSidecars(summary as unknown as Record<string, unknown>, sidecars, realMvPayload),
        durationMs: summary.durationMs
      };
    } catch (error) {
      return {
        status: "failed",
        payload: mergeRealMvSidecars({
          errorMessage: error instanceof Error ? error.message : String(error)
        }, sidecars, realMvPayload),
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
      if (await isRealMvGenericSongJsonSidecar(absolutePath)) {
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
    const realMvMediaCount = entries.filter((entry) => entry.isFile() && isRealMvMediaPath(entry.name)).length;
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walkRoot(root, absolutePath)));
        continue;
      }

      if (entry.isFile() && isSupportedFile(absolutePath)) {
        if (isSongJsonFile(absolutePath) && realMvMediaCount === 1) {
          continue;
        }
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

async function isRealMvGenericSongJsonSidecar(absolutePath: string): Promise<boolean> {
  if (!isSongJsonFile(absolutePath)) {
    return false;
  }
  try {
    const entries = await readdir(path.dirname(absolutePath), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && isRealMvMediaPath(entry.name)).length === 1;
  } catch {
    return false;
  }
}

function isSongJsonFile(filePath: string): boolean {
  return path.basename(filePath).toLocaleLowerCase() === "song.json";
}

async function buildRealMvScannerPayload(rootPath: string, sidecars: RealMvSidecars): Promise<RealMvScannerPayload> {
  if (!sidecars.songJson) {
    return { scannerReasons: [] };
  }

  try {
    const raw = await readFile(path.join(rootPath, sidecars.songJson.relativePath), "utf8");
    const result = parseRealMvSidecarJson(raw);
    if (result.status === "ok") {
      return {
        sidecarMetadata: result.metadata,
        scannerReasons: []
      };
    }
    return { scannerReasons: result.reasons };
  } catch (error) {
    return {
      scannerReasons: [
        {
          code: "sidecar-read-failed",
          severity: "warning",
          message: error instanceof Error ? error.message : String(error),
          source: "scanner"
        }
      ]
    };
  }
}

function mergeRealMvSidecars(
  payload: Record<string, unknown>,
  sidecars: RealMvSidecars | null,
  scannerPayload: RealMvScannerPayload | null = null
): Record<string, unknown> {
  if (!sidecars) {
    return payload;
  }
  const existingRealMv = isRecord(payload.realMv) ? payload.realMv : {};
  const existingReasons = Array.isArray(existingRealMv.scannerReasons)
    ? existingRealMv.scannerReasons
    : [];
  const scannerReasons = scannerPayload
    ? [...scannerPayload.scannerReasons, ...existingReasons]
    : existingReasons;
  return {
    ...payload,
    realMv: {
      ...existingRealMv,
      mediaKind: "single_file_real_mv",
      sidecars,
      scannerReasons,
      ...(scannerPayload?.sidecarMetadata ? { sidecarMetadata: scannerPayload.sidecarMetadata } : {})
    }
  };
}

function buildUnstableRealMvQuickHash(fileStat: { size: number; mtimeMs: number }, sidecars: RealMvSidecars): string {
  return `unstable:${fileStat.size}:${Math.trunc(fileStat.mtimeMs)}|artifacts:${buildRealMvArtifactSignature(sidecars)}`;
}

async function waitForStableFile(filePath: string, delayMs = 500): Promise<boolean> {
  const initial = await stat(filePath);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const current = await stat(filePath);
  return initial.size === current.size && Math.trunc(initial.mtimeMs) === Math.trunc(current.mtimeMs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
