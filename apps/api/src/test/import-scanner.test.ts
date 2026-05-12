import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ImportCandidate, ImportFile, ImportFileProbeStatus, ImportScanRun } from "@home-ktv/domain";
import { describe, expect, it, vi } from "vitest";
import { CandidateBuilder } from "../modules/ingest/candidate-builder.js";
import { ImportScanner } from "../modules/ingest/import-scanner.js";
import { resolveLibraryPaths, toLibraryRelativePath } from "../modules/ingest/library-paths.js";
import { findRealMvSidecars, isRealMvMediaPath } from "../modules/ingest/real-mv-sidecars.js";
import type { ImportCandidateRepository } from "../modules/ingest/repositories/import-candidate-repository.js";
import type { ImportFileRepository } from "../modules/ingest/repositories/import-file-repository.js";
import type { ScanRunRepository } from "../modules/ingest/repositories/scan-run-repository.js";

describe("library paths", () => {
  it("resolves canonical import and song roots under MEDIA_ROOT", () => {
    const roots = resolveLibraryPaths("/media/ktv");

    expect(roots).toEqual({
      libraryRoot: path.resolve("/media/ktv"),
      songsRoot: path.resolve("/media/ktv/songs"),
      importsPendingRoot: path.resolve("/media/ktv/imports/pending"),
      importsNeedsReviewRoot: path.resolve("/media/ktv/imports/needs-review")
    });
  });

  it("returns POSIX relative paths and rejects paths escaping the root", () => {
    const root = path.resolve("/media/ktv/imports/pending");

    expect(toLibraryRelativePath(root, path.resolve(root, "周杰伦/七里香.mp4"))).toBe("周杰伦/七里香.mp4");
    expect(() => toLibraryRelativePath(root, path.resolve("/media/ktv/other.mp4"))).toThrow("outside library root");
  });
});

describe("ImportScanner", () => {
  it("skips ffprobe for unchanged file identity", async () => {
    const { scanner, paths, probeMedia } = await createScannerHarness({
      existingFile: true,
      content: "same-media"
    });

    await scanner.scan({ trigger: "manual", scope: "imports" });

    expect(probeMedia).not.toHaveBeenCalled();
    expect(paths.importFiles.upserts[0]?.probeStatus).toBe("skipped");
  });

  it("probes changed media once and persists duration", async () => {
    const { scanner, paths, probeMedia } = await createScannerHarness({
      existingFile: false,
      content: "changed-media"
    });

    await scanner.scan({ trigger: "manual", scope: "imports" });

    expect(probeMedia).toHaveBeenCalledTimes(1);
    expect(paths.importFiles.upserts[0]).toMatchObject({
      rootKind: "imports_pending",
      relativePath: "周杰伦/七里香.instrumental.mp4",
      probeStatus: "probed",
      durationMs: 180123
    });
  });

  it("passes persisted changed import files into CandidateBuilder", async () => {
    const { scanner, paths, candidateBuilder } = await createScannerHarness({
      existingFile: false,
      content: "candidate-media"
    });

    await scanner.scan({ trigger: "watcher", scope: "imports" });

    expect(candidateBuilder.buildFromImportFiles).toHaveBeenCalledWith([
      expect.objectContaining({
        rootKind: "imports_pending",
        relativePath: "周杰伦/七里香.instrumental.mp4",
        probeStatus: "probed"
      })
    ]);
    expect(paths.scanRuns.finishes[0]).toMatchObject({ candidateCount: 1 });
  });

  it("discovers .mpg and .mpeg files under imports/pending", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-real-mv-scan-"));
    const paths = resolveLibraryPaths(mediaRoot);
    await mkdir(paths.importsPendingRoot, { recursive: true });
    await writeFile(path.join(paths.importsPendingRoot, "demo-a.mpg"), "mpg-media");
    await writeFile(path.join(paths.importsPendingRoot, "demo-b.mpeg"), "mpeg-media");
    const importFiles = new MemoryImportFileRepository(null);
    const scanRuns = new MemoryScanRunRepository();
    const candidateBuilder = { buildFromImportFiles: vi.fn(async (files: ImportFile[]) => files.length) };
    const probeMedia = vi.fn(async (_filePath: string) => createProbeSummary());

    const scanner = new ImportScanner({ paths, importFiles, scanRuns, candidateBuilder, probeMedia });

    await scanner.scan({ trigger: "manual", scope: "imports" });

    expect(probeMedia).toHaveBeenCalledTimes(2);
    expect(probeMedia.mock.calls.map(([filePath]) => path.extname(filePath)).sort()).toEqual([".mpeg", ".mpg"]);
  });

  it("includes same-stem artifact changes in the persisted quickHash", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-real-mv-hash-"));
    const paths = resolveLibraryPaths(mediaRoot);
    await mkdir(paths.importsPendingRoot, { recursive: true });
    const filePath = path.join(paths.importsPendingRoot, "周杰伦-七里香.mkv");
    await writeFile(filePath, "mkv-media");
    await writeFile(path.join(paths.importsPendingRoot, "周杰伦-七里香.jpg"), "new-cover");
    const stats = await import("node:fs/promises").then((fs) => fs.stat(filePath));
    const mediaQuickHash = `${stats.size}:${createHash("sha1").update("mkv-media").digest("hex")}`;
    const importFiles = new MemoryImportFileRepository(createImportFile({
      rootKind: "imports_pending",
      relativePath: "周杰伦-七里香.mkv",
      sizeBytes: stats.size,
      mtimeMs: Math.trunc(stats.mtimeMs),
      quickHash: `media:${mediaQuickHash}|artifacts:cover:old-cover:1:1:image/jpeg|songJson:none`
    }));
    const scanRuns = new MemoryScanRunRepository();
    const candidateBuilder = { buildFromImportFiles: vi.fn(async (files: ImportFile[]) => files.length) };
    const probeMedia = vi.fn(async (_filePath: string) => createProbeSummary());

    const scanner = new ImportScanner({ paths, importFiles, scanRuns, candidateBuilder, probeMedia });

    await scanner.scan({ trigger: "manual", scope: "imports" });

    expect(importFiles.upserts[0]?.quickHash).toContain(`media:${mediaQuickHash}|artifacts:`);
    expect(importFiles.upserts[0]?.quickHash).not.toContain("old-cover");
    expect(importFiles.upserts[0]?.probePayload).toMatchObject({
      realMv: {
        sidecars: {
          cover: expect.objectContaining({ relativePath: "周杰伦-七里香.jpg" })
        }
      }
    });
  });

  it("does not pass real MV sidecar files into CandidateBuilder", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-real-mv-sidecar-scan-"));
    const paths = resolveLibraryPaths(mediaRoot);
    await mkdir(paths.importsPendingRoot, { recursive: true });
    await writeFile(path.join(paths.importsPendingRoot, "周杰伦-七里香.mkv"), "mkv-media");
    await writeFile(path.join(paths.importsPendingRoot, "song.json"), "{}");
    const importFiles = new MemoryImportFileRepository(null);
    const scanRuns = new MemoryScanRunRepository();
    const candidateBuilder = { buildFromImportFiles: vi.fn(async (files: ImportFile[]) => files.length) };
    const probeMedia = vi.fn(async (_filePath: string) => createProbeSummary());

    const scanner = new ImportScanner({ paths, importFiles, scanRuns, candidateBuilder, probeMedia });

    await scanner.scan({ trigger: "manual", scope: "imports" });

    expect(candidateBuilder.buildFromImportFiles).toHaveBeenCalledWith([
      expect.objectContaining({ relativePath: "周杰伦-七里香.mkv" })
    ]);
    expect(candidateBuilder.buildFromImportFiles).not.toHaveBeenCalledWith([
      expect.objectContaining({ relativePath: "song.json" })
    ]);
  });

  it("parses adjacent real MV song.json metadata into the scanner payload", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-real-mv-sidecar-metadata-"));
    const paths = resolveLibraryPaths(mediaRoot);
    await mkdir(paths.importsPendingRoot, { recursive: true });
    await writeFile(path.join(paths.importsPendingRoot, "关喆-想你的夜.mkv"), "mkv-media");
    await writeFile(path.join(paths.importsPendingRoot, "关喆-想你的夜.song.json"), JSON.stringify({
      title: "想你的夜",
      artistName: "关喆"
    }));
    const importFiles = new MemoryImportFileRepository(null);
    const scanRuns = new MemoryScanRunRepository();
    const candidateBuilder = { buildFromImportFiles: vi.fn(async (files: ImportFile[]) => files.length) };
    const probeMedia = vi.fn(async (_filePath: string) => createProbeSummary());

    const scanner = new ImportScanner({ paths, importFiles, scanRuns, candidateBuilder, probeMedia });

    await scanner.scan({ trigger: "manual", scope: "imports" });

    const probePayload = importFiles.upserts[0]?.probePayload;
    expect(probePayload).toMatchObject({
      realMv: {
        sidecars: {
          songJson: expect.objectContaining({ relativePath: "关喆-想你的夜.song.json" })
        },
        sidecarMetadata: {
          title: "想你的夜",
          artistName: "关喆"
        },
        scannerReasons: []
      }
    });
    expect(JSON.stringify(probePayload)).not.toContain(mediaRoot);
  });

  it("keeps invalid real MV song.json retryable and still rebuilds candidates", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-real-mv-invalid-sidecar-"));
    const paths = resolveLibraryPaths(mediaRoot);
    await mkdir(paths.importsPendingRoot, { recursive: true });
    await writeFile(path.join(paths.importsPendingRoot, "关喆-想你的夜.mkv"), "mkv-media");
    await writeFile(path.join(paths.importsPendingRoot, "关喆-想你的夜.song.json"), "{");
    const importFiles = new MemoryImportFileRepository(null);
    const scanRuns = new MemoryScanRunRepository();
    const candidateBuilder = { buildFromImportFiles: vi.fn(async (files: ImportFile[]) => files.length) };
    const probeMedia = vi.fn(async (_filePath: string) => createProbeSummary());

    const scanner = new ImportScanner({ paths, importFiles, scanRuns, candidateBuilder, probeMedia });

    await scanner.scan({ trigger: "manual", scope: "imports" });

    expect(importFiles.upserts[0]?.probePayload).toMatchObject({
      realMv: {
        sidecars: {
          songJson: expect.objectContaining({ relativePath: "关喆-想你的夜.song.json" })
        },
        scannerReasons: [
          expect.objectContaining({
            code: "sidecar-json-invalid",
            severity: "warning",
            source: "scanner"
          })
        ]
      }
    });
    expect(candidateBuilder.buildFromImportFiles).toHaveBeenCalledWith([
      expect.objectContaining({
        relativePath: "关喆-想你的夜.mkv",
        probePayload: expect.objectContaining({
          realMv: expect.objectContaining({
            scannerReasons: [expect.objectContaining({ code: "sidecar-json-invalid" })]
          })
        })
      })
    ]);
  });

  it("keeps unstable real MV files pending without probing", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-real-mv-unstable-"));
    const paths = resolveLibraryPaths(mediaRoot);
    await mkdir(paths.importsPendingRoot, { recursive: true });
    await writeFile(path.join(paths.importsPendingRoot, "周杰伦-七里香.mkv"), "partial-mkv-media");
    const importFiles = new MemoryImportFileRepository(null);
    const scanRuns = new MemoryScanRunRepository();
    const candidateBuilder = { buildFromImportFiles: vi.fn(async (files: ImportFile[]) => files.length) };
    const probeMedia = vi.fn(async (_filePath: string) => createProbeSummary());
    const fileStabilityCheck = vi.fn(async () => false);

    const scanner = new ImportScanner({
      paths,
      importFiles,
      scanRuns,
      candidateBuilder,
      probeMedia,
      fileStabilityCheck
    });

    const result = await scanner.scan({ trigger: "manual", scope: "imports" });

    expect(fileStabilityCheck).toHaveBeenCalledTimes(1);
    expect(probeMedia).not.toHaveBeenCalled();
    expect(result.filesChanged).toBe(1);
    expect(importFiles.upserts[0]).toMatchObject({
      relativePath: "周杰伦-七里香.mkv",
      probeStatus: "pending",
      durationMs: null,
      probePayload: {
        realMv: {
          scannerReasons: [
            expect.objectContaining({
              code: "file-unstable",
              severity: "warning",
              source: "scanner"
            })
          ]
        }
      }
    });
    expect(candidateBuilder.buildFromImportFiles).toHaveBeenCalledWith([
      expect.objectContaining({
        relativePath: "周杰伦-七里香.mkv",
        probeStatus: "pending"
      })
    ]);
  });
});

describe("real MV sidecars", () => {
  it("discovers same-stem cover and song.json artifacts without treating them as media", async () => {
    const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-sidecars-"));
    const rootPath = path.join(mediaRoot, "imports", "pending");
    await mkdir(rootPath, { recursive: true });
    const mediaAbsolutePath = path.join(rootPath, "周杰伦-七里香.mkv");
    await writeFile(mediaAbsolutePath, "fake-media");
    await writeFile(path.join(rootPath, "周杰伦-七里香.jpg"), "fake-cover");
    await writeFile(path.join(rootPath, "周杰伦-七里香.song.json"), "{}");

    const sidecars = await findRealMvSidecars({ mediaAbsolutePath, rootPath });

    expect(sidecars.cover).toMatchObject({
      relativePath: "周杰伦-七里香.jpg",
      contentType: "image/jpeg"
    });
    expect(sidecars.songJson).toMatchObject({
      relativePath: "周杰伦-七里香.song.json"
    });
    expect(isRealMvMediaPath("周杰伦-七里香.jpg")).toBe(false);
    expect(isRealMvMediaPath("周杰伦-七里香.song.json")).toBe(false);
  });
});

describe("CandidateBuilder", () => {
  it("persists grouped candidate files through upsertCandidateWithFiles", async () => {
    const upsertCandidateWithFiles = vi.fn(async () => createCandidate());
    const builder = new CandidateBuilder({
      importCandidates: { upsertCandidateWithFiles }
    });

    const count = await builder.buildFromImportFiles([
      createImportFile({
        id: "import-original",
        relativePath: "周杰伦/七里香/original.mp4",
        durationMs: 180000
      }),
      createImportFile({
        id: "import-instrumental",
        relativePath: "周杰伦/七里香/instrumental.mp4",
        durationMs: 180123
      })
    ]);

    expect(count).toBe(1);
    expect(upsertCandidateWithFiles).toHaveBeenCalledWith({
      candidate: expect.objectContaining({
        artistName: "周杰伦",
        title: "七里香",
        language: "mandarin"
      }),
      files: expect.arrayContaining([
        expect.objectContaining({ importFileId: "import-original", proposedVocalMode: "original" }),
        expect.objectContaining({ importFileId: "import-instrumental", proposedVocalMode: "instrumental" })
      ])
    });
  });

  it("builds one single-file real MV candidate with metadata draft fields", async () => {
    const capturedInputs: Array<Parameters<ImportCandidateRepository["upsertCandidateWithFiles"]>[0]> = [];
    const upsertCandidateWithFiles = vi.fn(async (input: Parameters<ImportCandidateRepository["upsertCandidateWithFiles"]>[0]) => {
      capturedInputs.push(input);
      return createCandidate();
    });
    const builder = new CandidateBuilder({
      importCandidates: { upsertCandidateWithFiles }
    });

    const count = await builder.buildFromImportFiles([
      createImportFile({
        id: "import-real-mv",
        relativePath: "关喆-想你的夜(MTV)-国语-流行.mkv",
        durationMs: 60041,
        probePayload: {
          realMv: {
            mediaKind: "single_file_real_mv",
            sidecarMetadata: {
              searchHints: ["xiang ni de ye"]
            },
            scannerReasons: [],
            sidecars: { cover: null, songJson: null }
          },
          mediaInfoSummary: {
            container: "matroska,webm",
            durationMs: 60041,
            videoCodec: "h264",
            resolution: { width: 1920, height: 1080 },
            fileSizeBytes: 104857600,
            audioTracks: [
              { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
              { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
            ]
          }
        }
      })
    ]);

    expect(count).toBe(1);
    const capturedInput = capturedInputs[0];
    if (!capturedInput) {
      throw new Error("upsertCandidateWithFiles was not called");
    }
    expect(capturedInput.candidate).toMatchObject({
      title: "想你的夜",
      artistName: "关喆",
      searchHints: ["xiang ni de ye"],
      candidateMeta: {
        realMv: expect.objectContaining({
          groupKey: expect.stringContaining("关喆-想你的夜(MTV)-国语-流行.mkv"),
          sidecarMetadata: expect.objectContaining({
            searchHints: ["xiang ni de ye"]
          })
        })
      }
    });
    expect(capturedInput.files).toEqual([
      expect.objectContaining({
        importFileId: "import-real-mv",
        proposedAssetKind: "dual-track-video",
        proposedVocalMode: "dual",
        selected: true
      })
    ]);
  });

  it("keeps raw probe streams and format out of candidate probeSummary", async () => {
    const capturedInputs: Array<Parameters<ImportCandidateRepository["upsertCandidateWithFiles"]>[0]> = [];
    const upsertCandidateWithFiles = vi.fn(async (input: Parameters<ImportCandidateRepository["upsertCandidateWithFiles"]>[0]) => {
      capturedInputs.push(input);
      return createCandidate();
    });
    const builder = new CandidateBuilder({
      importCandidates: { upsertCandidateWithFiles }
    });

    await builder.buildFromImportFiles([
      createImportFile({
        relativePath: "周杰伦/七里香.mkv",
        probePayload: {
          streams: [{ codec_type: "audio" }],
          format: { duration: "60.000" },
          mediaInfoSummary: {
            container: "matroska,webm",
            durationMs: 60000,
            videoCodec: "h264",
            resolution: { width: 1920, height: 1080 },
            fileSizeBytes: 104857600,
            audioTracks: []
          },
          mediaInfoProvenance: {
            source: "ffprobe",
            sourceVersion: "8.1",
            probedAt: "2026-05-11T08:10:00.000Z",
            importedFrom: "周杰伦/七里香.mkv"
          }
        }
      })
    ]);

    const capturedInput = capturedInputs[0];
    if (!capturedInput) {
      throw new Error("upsertCandidateWithFiles was not called");
    }
    const probeSummary = capturedInput.files[0]?.probeSummary;
    expect(probeSummary).toMatchObject({
      durationMs: 180000,
      probeStatus: "probed",
      mediaInfoSummary: expect.objectContaining({ container: "matroska,webm" }),
      mediaInfoProvenance: expect.objectContaining({ source: "ffprobe" })
    });
    expect(probeSummary).not.toHaveProperty("streams");
    expect(probeSummary).not.toHaveProperty("format");
  });
});

async function createScannerHarness(input: { existingFile: boolean; content: string }) {
  const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-scan-"));
  const paths = resolveLibraryPaths(mediaRoot);
  const candidateDir = path.join(paths.importsPendingRoot, "周杰伦");
  await mkdir(candidateDir, { recursive: true });
  const filePath = path.join(candidateDir, "七里香.instrumental.mp4");
  await writeFile(filePath, input.content);
  const stats = await import("node:fs/promises").then((fs) => fs.stat(filePath));
  const relativePath = "周杰伦/七里香.instrumental.mp4";
  const quickHash = `${stats.size}:${createHash("sha1").update(input.content).digest("hex")}`;
  const importFiles = new MemoryImportFileRepository(
    input.existingFile
      ? createImportFile({
          rootKind: "imports_pending",
          relativePath,
          sizeBytes: stats.size,
          mtimeMs: Math.trunc(stats.mtimeMs),
          quickHash,
          probeStatus: "probed"
        })
      : null
  );
  const scanRuns = new MemoryScanRunRepository();
  const candidateBuilder = {
    buildFromImportFiles: vi.fn(async (files: ImportFile[]) => files.length)
  };
  const probeMedia = vi.fn(async () => ({
    durationMs: 180123,
    formatName: "mov,mp4,m4a,3gp,3g2,mj2",
    videoCodec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    mediaInfoSummary: {
      container: "mov,mp4,m4a,3gp,3g2,mj2",
      durationMs: 180123,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 10,
      audioTracks: [{ index: 0, id: "stream-0", label: "Audio 1", language: null, codec: "aac", channels: 2 }]
    },
    mediaInfoProvenance: {
      source: "ffprobe" as const,
      sourceVersion: null,
      probedAt: "2026-04-30T00:00:00.000Z",
      importedFrom: "周杰伦/七里香.instrumental.mp4"
    },
    raw: {}
  }));

  return {
    scanner: new ImportScanner({
      paths,
      importFiles,
      scanRuns,
      candidateBuilder,
      probeMedia
    }),
    paths: { ...paths, importFiles, scanRuns },
    candidateBuilder,
    probeMedia
  };
}

class MemoryImportFileRepository {
  readonly upserts: Array<{
    rootKind: ImportFile["rootKind"];
    relativePath: string;
    sizeBytes: number;
    mtimeMs: number;
    quickHash: string;
    probeStatus: ImportFileProbeStatus;
    probePayload: Record<string, unknown>;
    durationMs: number | null;
    lastSeenScanRunId: string;
  }> = [];

  constructor(private existing: ImportFile | null) {}

  async findByRootAndRelativePath(rootKind: ImportFile["rootKind"], relativePath: string): Promise<ImportFile | null> {
    return this.existing && this.existing.rootKind === rootKind && this.existing.relativePath === relativePath
      ? this.existing
      : null;
  }

  async upsertDiscoveredFile(input: Parameters<ImportFileRepository["upsertDiscoveredFile"]>[0]): Promise<ImportFile> {
    this.upserts.push(input);
    this.existing = createImportFile({
      id: "import-file-1",
      rootKind: input.rootKind,
      relativePath: input.relativePath,
      sizeBytes: input.sizeBytes,
      mtimeMs: input.mtimeMs,
      quickHash: input.quickHash,
      probeStatus: input.probeStatus,
      probePayload: input.probePayload,
      durationMs: input.durationMs
    });
    return this.existing;
  }

  async markDeleted(): Promise<void> {}
}

function createProbeSummary() {
  return {
    durationMs: 180123,
    formatName: "matroska,webm",
    videoCodec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    mediaInfoSummary: {
      container: "matroska,webm",
      durationMs: 180123,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 10,
      audioTracks: [{ index: 0, id: "stream-0", label: "Audio 1", language: null, codec: "aac", channels: 2 }]
    },
    mediaInfoProvenance: {
      source: "ffprobe" as const,
      sourceVersion: null,
      probedAt: "2026-04-30T00:00:00.000Z",
      importedFrom: "fixture.mkv"
    },
    raw: {}
  };
}

class MemoryScanRunRepository implements ScanRunRepository {
  readonly finishes: Array<Parameters<ScanRunRepository["finishRun"]>[0]> = [];

  async startRun(): Promise<ImportScanRun> {
    return {
      id: "scan-run-1",
      trigger: "manual",
      status: "running",
      scope: "imports",
      filesSeen: 0,
      filesAdded: 0,
      filesChanged: 0,
      filesDeleted: 0,
      candidatesCreated: 0,
      candidatesUpdated: 0,
      errorMessage: null,
      startedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
      finishedAt: null,
      createdAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString()
    };
  }

  async finishRun(input: Parameters<ScanRunRepository["finishRun"]>[0]): Promise<void> {
    this.finishes.push(input);
  }
}

function createImportFile(overrides: Partial<ImportFile> = {}): ImportFile {
  return {
    id: "import-file-1",
    lastSeenScanRunId: "scan-run-1",
    rootKind: "imports_pending",
    relativePath: "周杰伦/七里香.mp4",
    sizeBytes: 10,
    mtimeMs: 1777536000000,
    quickHash: "quick-hash",
    probeStatus: "probed",
    probePayload: {},
    durationMs: 180000,
    lastScannedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    deletedAt: null,
    createdAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    ...overrides
  };
}

function createCandidate(): ImportCandidate {
  return {
    id: "candidate-1",
    status: "pending",
    title: "七里香",
    normalizedTitle: "七里香",
    titlePinyin: "",
    titleInitials: "",
    artistId: null,
    artistName: "周杰伦",
    language: "mandarin",
    genre: [],
    tags: [],
    aliases: [],
    searchHints: [],
    releaseYear: null,
    canonicalDurationMs: null,
    defaultCandidateFileId: null,
    sameVersionConfirmed: false,
    conflictSongId: null,
    reviewNotes: null,
    candidateMeta: {},
    createdAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString()
  };
}
