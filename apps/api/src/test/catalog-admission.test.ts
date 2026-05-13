import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  CompatibilityReason,
  ImportCandidate,
  ImportCandidateFileDetail,
  ImportCandidateStatus,
  ImportFileRootKind,
  MediaInfoSummary,
  PlaybackProfile,
  TrackRoles,
  VocalMode
} from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import type { QueryExecutor } from "../db/query-executor.js";
import { schemaSql } from "../db/schema.js";
import {
  CatalogAdmissionError,
  CatalogAdmissionService,
  type CatalogAdmissionWriter,
  PgCatalogAdmissionWriter
} from "../modules/catalog/admission-service.js";
import { resolveLibraryPaths } from "../modules/ingest/library-paths.js";

describe("CatalogAdmissionService", () => {
  it("holds candidates by moving pending files into imports/needs-review", async () => {
    const harness = await createAdmissionHarness();
    await harness.writeImportFile("imports_pending", "周杰伦/七里香/original.mp4", "original");

    const result = await harness.service.holdCandidate("candidate-1");

    await expectPathExists(path.join(harness.paths.importsNeedsReviewRoot, "周杰伦/七里香/original.mp4"));
    expect(result.candidate.status).toBe("held");
    expect(harness.importFiles.locations[0]).toEqual({
      importFileId: "import-original",
      rootKind: "imports_needs_review",
      relativePath: "周杰伦/七里香/original.mp4"
    });
  });

  it("marks unproven or duration-delta-over-300ms pairs as review_required", async () => {
    const harness = await createAdmissionHarness({
      candidate: { sameVersionConfirmed: true },
      files: [
        createDetail({ id: "candidate-file-original", importFileId: "import-original", proposedVocalMode: "original", durationMs: 180000 }),
        createDetail({
          id: "candidate-file-instrumental",
          importFileId: "import-instrumental",
          proposedVocalMode: "instrumental",
          relativePath: "周杰伦/七里香/instrumental.mp4",
          durationMs: 180500
        })
      ]
    });

    const result = await harness.service.approveCandidate("candidate-1");

    expect(result.status).toBe("review_required");
    expect(result.reason).toBe("duration-delta-over-300ms");
    expect(harness.importCandidates.statusUpdates.at(-1)).toMatchObject({
      status: "review_required",
      reviewNotes: "duration-delta-over-300ms"
    });
  });

  it("detects formal directory conflicts before moving files", async () => {
    const harness = await createAdmissionHarness({
      candidate: { sameVersionConfirmed: true },
      files: [
        createDetail({ id: "candidate-file-original", importFileId: "import-original", proposedVocalMode: "original", durationMs: 180000 }),
        createDetail({
          id: "candidate-file-instrumental",
          importFileId: "import-instrumental",
          proposedVocalMode: "instrumental",
          relativePath: "周杰伦/七里香/instrumental.mp4",
          durationMs: 180100
        })
      ]
    });
    await mkdir(path.join(harness.paths.songsRoot, "mandarin/周杰伦/七里香"), { recursive: true });
    await harness.writeImportFile("imports_pending", "周杰伦/七里香/original.mp4", "original");

    await expect(harness.service.approveCandidate("candidate-1")).rejects.toMatchObject({
      code: "FORMAL_DIRECTORY_CONFLICT"
    });

    await expectPathExists(path.join(harness.paths.importsPendingRoot, "周杰伦/七里香/original.mp4"));
    expect(harness.importCandidates.statusUpdates.at(-1)).toMatchObject({
      status: "conflict",
      candidateMeta: expect.objectContaining({ conflictType: "formal_directory_exists" })
    });
  });

  it("supports create_version conflict resolution and writes song.json", async () => {
    const harness = await createAdmissionHarness({
      candidate: { sameVersionConfirmed: true },
      files: [
        createDetail({ id: "candidate-file-original", importFileId: "import-original", proposedVocalMode: "original", durationMs: 180000 }),
        createDetail({
          id: "candidate-file-instrumental",
          importFileId: "import-instrumental",
          proposedVocalMode: "instrumental",
          relativePath: "周杰伦/七里香/instrumental.mp4",
          durationMs: 180100
        })
      ]
    });
    await mkdir(path.join(harness.paths.songsRoot, "mandarin/周杰伦/七里香"), { recursive: true });
    await harness.writeImportFile("imports_pending", "周杰伦/七里香/original.mp4", "original");
    await harness.writeImportFile("imports_pending", "周杰伦/七里香/instrumental.mp4", "instrumental");

    const result = await harness.service.resolveCandidateConflict("candidate-1", {
      resolution: "create_version",
      versionSuffix: "live"
    });

    expect(result.status).toBe("approved");
    const songJson = JSON.parse(
      await readFile(path.join(harness.paths.songsRoot, "mandarin/周杰伦/七里香-live/song.json"), "utf8")
    ) as { title: string; assets: Array<{ vocalMode: VocalMode }> };
    expect(songJson).toMatchObject({
      title: "七里香",
      assets: expect.arrayContaining([
        expect.objectContaining({ vocalMode: "original" }),
        expect.objectContaining({ vocalMode: "instrumental" })
      ])
    });
  });

  it("reruns approval_failed promotions as repair instead of directory conflict", async () => {
    const harness = await createAdmissionHarness({
      candidate: {
        status: "approval_failed",
        sameVersionConfirmed: true,
        candidateMeta: { targetDirectory: "mandarin/周杰伦/七里香" }
      },
      files: [
        createDetail({
          id: "candidate-file-original",
          importFileId: "import-original",
          rootKind: "songs",
          relativePath: "mandarin/周杰伦/七里香/original.mp4",
          proposedVocalMode: "original",
          durationMs: 180000
        }),
        createDetail({
          id: "candidate-file-instrumental",
          importFileId: "import-instrumental",
          rootKind: "songs",
          relativePath: "mandarin/周杰伦/七里香/instrumental.mp4",
          proposedVocalMode: "instrumental",
          durationMs: 180100
        })
      ]
    });
    await mkdir(path.join(harness.paths.songsRoot, "mandarin/周杰伦/七里香"), { recursive: true });
    await writeFile(path.join(harness.paths.songsRoot, "mandarin/周杰伦/七里香/original.mp4"), "original");
    await writeFile(path.join(harness.paths.songsRoot, "mandarin/周杰伦/七里香/instrumental.mp4"), "instrumental");

    const result = await harness.service.approveCandidate("candidate-1");

    expect(result.status).toBe("approved");
    await expectPathExists(path.join(harness.paths.songsRoot, "mandarin/周杰伦/七里香/song.json"));
  });

  it("approves a single real MV candidate as one formal asset with reviewed trackRoles", async () => {
    const trackRoles = createRealMvTrackRoles();
    const harness = await createAdmissionHarness({
      files: [
        createDetail({
          id: "candidate-file-real-mv",
          importFileId: "import-real-mv",
          proposedVocalMode: "dual",
          proposedAssetKind: "dual-track-video",
          relativePath: "周杰伦/七里香/七里香.mkv",
          compatibilityStatus: "review_required",
          compatibilityReasons: [
            {
              code: "runtime-switch-unverified",
              severity: "warning",
              message: "Runtime audio track switching still needs verification.",
              source: "scanner"
            }
          ],
          mediaInfoSummary: createRealMvMediaInfoSummary(),
          mediaInfoProvenance: {
            source: "mediainfo",
            sourceVersion: "24.01",
            probedAt: "2026-05-13T00:00:00.000Z",
            importedFrom: "scanner"
          },
          trackRoles,
          playbackProfile: createRealMvPlaybackProfile(),
          probeSummary: { realMv: { sidecars: { cover: { relativePath: "周杰伦/七里香/cover.jpg" } } } }
        })
      ]
    });
    await harness.writeImportFile("imports_pending", "周杰伦/七里香/七里香.mkv", "real mv");
    await harness.writeImportFile("imports_pending", "周杰伦/七里香/cover.jpg", "cover image");

    const result = await harness.service.approveCandidate("candidate-1");

    expect(result.status).toBe("approved");
    expect(harness.catalogWriter.promotions).toHaveLength(1);
    expect(harness.catalogWriter.promotions[0]?.assets).toEqual([
      expect.objectContaining({
        assetId: "asset-candidate-1-real-mv",
        assetKind: "dual-track-video",
        vocalMode: "dual",
        status: "promoted",
        switchQualityStatus: "review_required",
        trackRoles: expect.objectContaining({
          instrumental: expect.objectContaining({ id: "0x1101" })
        })
      })
    ]);
    const targetDirectory = path.join(harness.paths.songsRoot, "mandarin/周杰伦/七里香");
    const songJson = JSON.parse(await readFile(path.join(targetDirectory, "song.json"), "utf8")) as {
      coverPath: string;
      assets: Array<{ id?: string; assetKind?: string; vocalMode?: string; trackRoles?: TrackRoles }>;
    };
    expect(songJson.coverPath).toBe("cover.jpg");
    expect(songJson.assets).toHaveLength(1);
    expect(songJson.assets[0]).toMatchObject({
      id: "asset-candidate-1-real-mv",
      assetKind: "dual-track-video",
      vocalMode: "dual",
      trackRoles: expect.objectContaining({
        instrumental: expect.objectContaining({ id: "0x1101" })
      })
    });
    expect(JSON.stringify(songJson)).not.toContain("asset-candidate-1-original");
    await expectPathExists(path.join(targetDirectory, "cover.jpg"));
  });

  it("maps playable real MV approval to ready without verifying switching", async () => {
    const harness = await createAdmissionHarness({
      files: [
        createDetail({
          id: "candidate-file-real-mv",
          importFileId: "import-real-mv",
          proposedVocalMode: "dual",
          proposedAssetKind: "dual-track-video",
          relativePath: "周杰伦/七里香/七里香.mkv",
          compatibilityStatus: "playable",
          mediaInfoSummary: createRealMvMediaInfoSummary(),
          trackRoles: createRealMvTrackRoles(),
          playbackProfile: createRealMvPlaybackProfile()
        })
      ]
    });
    await harness.writeImportFile("imports_pending", "周杰伦/七里香/七里香.mkv", "real mv");

    const result = await harness.service.approveCandidate("candidate-1");

    expect(result.status).toBe("approved");
    expect(harness.catalogWriter.promotions[0]).toMatchObject({
      songStatus: "ready",
      assets: [
        expect.objectContaining({
          status: "ready",
          switchQualityStatus: "review_required"
        })
      ]
    });
  });

  it("keeps unsupported real MV candidates visible for repair", async () => {
    const harness = await createAdmissionHarness({
      files: [
        createDetail({
          id: "candidate-file-real-mv",
          importFileId: "import-real-mv",
          proposedVocalMode: "dual",
          proposedAssetKind: "dual-track-video",
          relativePath: "周杰伦/七里香/七里香.mkv",
          compatibilityStatus: "unsupported",
          mediaInfoSummary: createRealMvMediaInfoSummary(),
          trackRoles: createRealMvTrackRoles(),
          playbackProfile: createRealMvPlaybackProfile()
        })
      ]
    });
    await harness.writeImportFile("imports_pending", "周杰伦/七里香/七里香.mkv", "real mv");

    const result = await harness.service.approveCandidate("candidate-1");

    expect(result.status).toBe("review_required");
    expect(result.reason).toBe("real-mv-unsupported");
    expect(harness.importFiles.locations).toHaveLength(0);
    expect(harness.catalogWriter.promotions).toHaveLength(0);
    await expectPathExists(path.join(harness.paths.importsPendingRoot, "周杰伦/七里香/七里香.mkv"));
  });

  it("requires targetSongId for merge_existing conflict resolution", async () => {
    const harness = await createAdmissionHarness();

    await expect(
      harness.service.resolveCandidateConflict("candidate-1", { resolution: "merge_existing" })
    ).rejects.toMatchObject({ code: "TARGET_SONG_REQUIRED" });
  });

  it("persists generated title and artist search keys when promoting formal songs", async () => {
    const queries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
    const db: QueryExecutor = {
      async query<TRow>(text: string, values?: readonly unknown[]) {
        queries.push({ text, values });
        return { rows: [] as TRow[] };
      }
    };

    await new PgCatalogAdmissionWriter(db).promoteApprovedCandidate({
      candidateId: "candidate-1",
      songId: "song-candidate-1",
      title: "七里香",
      artistName: "周杰伦",
      language: "mandarin",
      releaseYear: 2004,
      switchFamily: "candidate-candidate-1",
      defaultAssetId: "asset-candidate-1-instrumental",
      assets: [
        {
          assetId: "asset-candidate-1-instrumental",
          importFileId: "import-instrumental",
          filePath: "songs/mandarin/周杰伦/七里香/instrumental.mp4",
          vocalMode: "instrumental",
          durationMs: 180000
        }
      ]
    });

    const songWrite = queries[0];
    expect(songWrite?.text).toContain("artist_pinyin");
    expect(songWrite?.text).toContain("artist_initials");
    expect(songWrite?.values).toEqual(
      expect.arrayContaining(["qilixiang", "qlx", "zhoujielun", "zjl"])
    );
  });

  it("mirrors catalog search columns and indexes in migration and schemaSql", async () => {
    const migrationSql = await readFile(new URL("../db/migrations/0005_catalog_search.sql", import.meta.url), "utf8");

    for (const sql of [migrationSql, schemaSql]) {
      expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
      expect(sql).toContain("artist_pinyin");
      expect(sql).toContain("artist_initials");
      expect(sql).toContain("songs_normalized_title_trgm_idx");
      expect(sql).toContain("songs_artist_name_trgm_idx");
      expect(sql).toContain("songs_title_pinyin_trgm_idx");
      expect(sql).toContain("songs_title_initials_idx");
      expect(sql).toContain("songs_artist_pinyin_trgm_idx");
      expect(sql).toContain("songs_artist_initials_idx");
      expect(sql).toContain("songs_aliases_gin_idx");
      expect(sql).toContain("songs_search_hints_gin_idx");
      expect(sql).toContain("assets_queueable_search_idx");
    }
  });
});

async function createAdmissionHarness(input: {
  candidate?: Partial<ImportCandidate>;
  files?: ImportCandidateFileDetail[];
} = {}) {
  const mediaRoot = await import("node:fs/promises").then((fs) => fs.mkdtemp(path.join(tmpdir(), "home-ktv-admission-")));
  const paths = resolveLibraryPaths(mediaRoot);
  const candidate = createCandidate(input.candidate);
  const files = input.files ?? [createDetail({ id: "candidate-file-original", importFileId: "import-original" })];
  const importCandidates = new MemoryImportCandidateRepository(candidate, files);
  const importFiles = new MemoryImportFileRepository();
  const catalogWriter = new MemoryCatalogAdmissionWriter();
  const service = new CatalogAdmissionService({
    paths,
    importCandidates,
    importFiles,
    catalogWriter
  });

  return {
    paths,
    service,
    importCandidates,
    importFiles,
    catalogWriter,
    async writeImportFile(rootKind: ImportFileRootKind, relativePath: string, content: string) {
      const rootPath = rootKind === "imports_needs_review" ? paths.importsNeedsReviewRoot : paths.importsPendingRoot;
      const filePath = path.join(rootPath, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }
  };
}

class MemoryImportCandidateRepository {
  readonly statusUpdates: Array<{
    status: ImportCandidateStatus;
    candidateMeta?: Record<string, unknown>;
    reviewNotes?: string;
  }> = [];

  constructor(
    private candidate: ImportCandidate,
    private readonly files: ImportCandidateFileDetail[]
  ) {}

  async getCandidateWithFiles(): Promise<{ candidate: ImportCandidate; files: ImportCandidateFileDetail[] }> {
    return { candidate: this.candidate, files: this.files };
  }

  async updateCandidateStatus(
    _candidateId: string,
    input: { status: ImportCandidateStatus; candidateMeta?: Record<string, unknown>; reviewNotes?: string }
  ): Promise<{ candidate: ImportCandidate; files: ImportCandidateFileDetail[] }> {
    this.statusUpdates.push(input);
    this.candidate = {
      ...this.candidate,
      status: input.status,
      candidateMeta: input.candidateMeta ?? this.candidate.candidateMeta,
      reviewNotes: input.reviewNotes ?? this.candidate.reviewNotes
    };
    return { candidate: this.candidate, files: this.files };
  }
}

class MemoryImportFileRepository {
  readonly locations: Array<{ importFileId: string; rootKind: ImportFileRootKind; relativePath: string }> = [];

  async updateFileLocation(input: { importFileId: string; rootKind: ImportFileRootKind; relativePath: string }): Promise<void> {
    this.locations.push(input);
  }

  async markDeletedById(): Promise<void> {}
}

class MemoryCatalogAdmissionWriter implements CatalogAdmissionWriter {
  readonly promotions: Parameters<CatalogAdmissionWriter["promoteApprovedCandidate"]>[0][] = [];

  async promoteApprovedCandidate(input: Parameters<CatalogAdmissionWriter["promoteApprovedCandidate"]>[0]): Promise<void> {
    this.promotions.push(input);
  }
}

function createCandidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
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
    releaseYear: 2004,
    canonicalDurationMs: null,
    defaultCandidateFileId: null,
    sameVersionConfirmed: false,
    conflictSongId: null,
    reviewNotes: null,
    candidateMeta: {},
    createdAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    ...overrides
  };
}

function createRealMvTrackRoles(): TrackRoles {
  return {
    original: { index: 0, id: "0x1100", label: "Original" },
    instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
  };
}

function createRealMvMediaInfoSummary(): MediaInfoSummary {
  return {
    container: "matroska",
    durationMs: 180000,
    videoCodec: "h264",
    resolution: { width: 1920, height: 1080 },
    fileSizeBytes: 123456,
    audioTracks: [
      { index: 0, id: "0x1100", label: "Original", language: "zh", codec: "aac", channels: 2 },
      { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
    ]
  };
}

function createRealMvPlaybackProfile(): PlaybackProfile {
  return {
    kind: "single_file_audio_tracks",
    container: "matroska",
    videoCodec: "h264",
    audioCodecs: ["aac", "aac"],
    requiresAudioTrackSelection: true
  };
}

function createDetail(overrides: Partial<ImportCandidateFileDetail> = {}): ImportCandidateFileDetail {
  return {
    id: "candidate-file-1",
    candidateId: "candidate-1",
    importFileId: "import-file-1",
    selected: true,
    proposedVocalMode: "original",
    proposedAssetKind: "video",
    roleConfidence: 0.95,
    probeDurationMs: 180000,
    probeSummary: {},
    createdAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    rootKind: "imports_pending",
    relativePath: "周杰伦/七里香/original.mp4",
    sizeBytes: 123456,
    mtimeMs: 1777536000000,
    quickHash: "quick-hash",
    probeStatus: "probed",
    probePayload: {},
    durationMs: 180000,
    compatibilityStatus: "playable",
    compatibilityReasons: [] satisfies CompatibilityReason[],
    mediaInfoSummary: createRealMvMediaInfoSummary(),
    mediaInfoProvenance: { source: "unknown", sourceVersion: null, probedAt: null, importedFrom: null },
    trackRoles: { original: null, instrumental: null },
    playbackProfile: {
      kind: "separate_asset_pair",
      container: null,
      videoCodec: null,
      audioCodecs: [],
      requiresAudioTrackSelection: false
    },
    fileCreatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    fileUpdatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    ...overrides
  };
}

async function expectPathExists(filePath: string): Promise<void> {
  await expect(access(filePath)).resolves.toBeUndefined();
}
