import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  Asset,
  CompatibilityReason,
  CompatibilityStatus,
  ImportCandidate,
  ImportCandidateFileDetail,
  ImportCandidateStatus,
  ImportFileRootKind,
  MediaInfoProvenance,
  MediaInfoSummary,
  PlaybackProfile,
  Song,
  TrackRoles
} from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import {
  CatalogAdmissionService,
  type CatalogAdmissionWriter
} from "../modules/catalog/admission-service.js";
import { resolveLibraryPaths } from "../modules/ingest/library-paths.js";
import { validateSongJsonConsistency } from "../modules/catalog/song-json-consistency-validator.js";

type PromotionInput = Parameters<CatalogAdmissionWriter["promoteApprovedCandidate"]>[0];
type PromotedAssetInput = PromotionInput["assets"][number];

describe("real MV admission regression", () => {
  it("real MV admission regression writes one song.json asset with reviewed trackRoles", async () => {
    const harness = await createAdmissionHarness({
      files: [
        createRealMvCandidateFile({
          trackRoles: createReviewedTrackRoles(),
          mediaInfoSummary: createRealMvMediaInfoSummary(),
          playbackProfile: createRealMvPlaybackProfile(),
          compatibilityStatus: "review_required",
          probeSummary: { realMv: { sidecars: { cover: { relativePath: "artist/title/title.jpg" } } } }
        })
      ]
    });
    await harness.writeImportFile("imports_pending", "artist/title/title.mkv", "real mv");
    await harness.writeImportFile("imports_pending", "artist/title/title.jpg", "cover image");

    const result = await harness.service.approveCandidate("candidate-1");

    expect(result.status).toBe("approved");
    const targetDirectory = path.join(harness.paths.songsRoot, "mandarin/artist/title");
    const songJsonText = await readFile(path.join(targetDirectory, "song.json"), "utf8");
    const songJson = JSON.parse(songJsonText) as {
      coverPath: string;
      assets: Array<{ id?: string; assetKind?: string; trackRoles?: TrackRoles }>;
    };
    expect(songJson.assets).toHaveLength(1);
    expect(songJson.coverPath).toBe("title.jpg");
    expect(songJson.assets[0]).toMatchObject({
      id: "asset-candidate-1-real-mv",
      assetKind: "dual-track-video",
      trackRoles: {
        instrumental: expect.objectContaining({ id: "0x1101" })
      }
    });
    await expectPathExists(path.join(targetDirectory, "title.jpg"));
    expect(songJsonText).not.toContain("asset-candidate-1-original");
    expect(songJsonText).not.toContain("asset-candidate-1-instrumental");
  });

  it("real MV readiness mapping does not leak unsupported media into formal catalog", async () => {
    const cases: Array<{
      compatibilityStatus: CompatibilityStatus;
      expectedSongStatus?: "ready" | "review_required";
      expectedAssetStatus?: "ready" | "promoted";
    }> = [
      { compatibilityStatus: "playable", expectedSongStatus: "ready", expectedAssetStatus: "ready" },
      { compatibilityStatus: "review_required", expectedSongStatus: "review_required", expectedAssetStatus: "promoted" },
      { compatibilityStatus: "unknown", expectedSongStatus: "review_required", expectedAssetStatus: "promoted" }
    ];

    for (const testCase of cases) {
      const harness = await createAdmissionHarness({
        files: [
          createRealMvCandidateFile({
            compatibilityStatus: testCase.compatibilityStatus,
            probeSummary: {}
          })
        ]
      });
      await harness.writeImportFile("imports_pending", "artist/title/title.mkv", "real mv");

      const result = await harness.service.approveCandidate("candidate-1");

      expect(result.status).toBe("approved");
      expect(harness.catalogWriter.promotions).toHaveLength(1);
      expect(harness.catalogWriter.promotions[0]).toMatchObject({
        songStatus: testCase.expectedSongStatus,
        assets: [
          expect.objectContaining({
            status: testCase.expectedAssetStatus,
            switchQualityStatus: "review_required"
          })
        ]
      });
    }

    const unsupportedHarness = await createAdmissionHarness({
      files: [
        createRealMvCandidateFile({
          compatibilityStatus: "unsupported",
          probeSummary: {}
        })
      ]
    });
    await unsupportedHarness.writeImportFile("imports_pending", "artist/title/title.mkv", "real mv");

    const unsupportedResult = await unsupportedHarness.service.approveCandidate("candidate-1");

    expect(unsupportedResult.status).toBe("review_required");
    expect(unsupportedResult.reason).toBe("real-mv-unsupported");
    expect(unsupportedHarness.importFiles.locations).toHaveLength(0);
    expect(unsupportedHarness.catalogWriter.promotions).toHaveLength(0);
    await expectPathExists(path.join(unsupportedHarness.paths.importsPendingRoot, "artist/title/title.mkv"));
  });

  it("real MV validator accepts the admitted single asset contract", async () => {
    const passedHarness = await createAdmissionHarness({
      files: [createRealMvCandidateFile({ trackRoles: createReviewedTrackRoles() })]
    });
    await passedHarness.writeImportFile("imports_pending", "artist/title/title.mkv", "real mv");
    await passedHarness.writeImportFile("imports_pending", "artist/title/title.jpg", "cover image");
    await passedHarness.service.approveCandidate("candidate-1");
    const passedPromotion = expectSinglePromotion(passedHarness.catalogWriter.promotions);
    const passedValidation = await validateSongJsonConsistency({
      songsRoot: passedHarness.paths.songsRoot,
      song: createSongFromPromotion(passedPromotion),
      assets: [createAssetFromPromotion(passedPromotion, passedPromotion.assets[0] as PromotedAssetInput)]
    });

    expect(passedValidation.status).toBe("passed");
    expect(passedValidation.issues.map((issue) => issue.code)).not.toContain("SWITCH_PAIR_NOT_VERIFIED");

    const reviewHarness = await createAdmissionHarness({
      files: [
        createRealMvCandidateFile({
          trackRoles: { ...createReviewedTrackRoles(), instrumental: null }
        })
      ]
    });
    await reviewHarness.writeImportFile("imports_pending", "artist/title/title.mkv", "real mv");
    await reviewHarness.writeImportFile("imports_pending", "artist/title/title.jpg", "cover image");
    await reviewHarness.service.approveCandidate("candidate-1");
    const reviewPromotion = expectSinglePromotion(reviewHarness.catalogWriter.promotions);
    const reviewValidation = await validateSongJsonConsistency({
      songsRoot: reviewHarness.paths.songsRoot,
      song: createSongFromPromotion(reviewPromotion),
      assets: [createAssetFromPromotion(reviewPromotion, reviewPromotion.assets[0] as PromotedAssetInput)]
    });

    expect(reviewValidation.status).toBe("review_required");
    expect(reviewValidation.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REAL_MV_TRACK_ROLES_MISSING" })])
    );
    expect(reviewValidation.issues.map((issue) => issue.code)).not.toContain("SWITCH_PAIR_NOT_VERIFIED");
  });

  it("keeps the real MV admission regression scoped to catalog review", async () => {
    const source = await readFile(new URL("./real-mv-admission-regression.test.ts", import.meta.url), "utf8");
    const forbidden = ["que" + "ue", "mob" + "ile", "tv-" + "player", "trans" + "cod", "Android " + "TV"];
    expect(source).not.toMatch(new RegExp(forbidden.join("|"), "i"));
  });
});

async function createAdmissionHarness(input: { candidate?: Partial<ImportCandidate>; files?: ImportCandidateFileDetail[] } = {}) {
  const mediaRoot = await mkdtemp(path.join(tmpdir(), "home-ktv-real-mv-admission-"));
  const paths = resolveLibraryPaths(mediaRoot);
  const candidate = createCandidate(input.candidate);
  const importCandidates = new MemoryImportCandidateRepository(candidate, input.files ?? [createRealMvCandidateFile()]);
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
      const rootPath =
        rootKind === "imports_pending"
          ? paths.importsPendingRoot
          : rootKind === "imports_needs_review"
            ? paths.importsNeedsReviewRoot
            : paths.songsRoot;
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
  readonly promotions: PromotionInput[] = [];

  async promoteApprovedCandidate(input: PromotionInput): Promise<void> {
    this.promotions.push(input);
  }
}

function createCandidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    id: "candidate-1",
    status: "pending",
    title: "title",
    normalizedTitle: "title",
    titlePinyin: "",
    titleInitials: "",
    artistId: null,
    artistName: "artist",
    language: "mandarin",
    genre: [],
    tags: [],
    aliases: [],
    searchHints: [],
    releaseYear: null,
    canonicalDurationMs: null,
    defaultCandidateFileId: "candidate-file-real-mv",
    sameVersionConfirmed: false,
    conflictSongId: null,
    reviewNotes: null,
    candidateMeta: {},
    createdAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
    ...overrides
  };
}

function createRealMvCandidateFile(overrides: Partial<ImportCandidateFileDetail> = {}): ImportCandidateFileDetail {
  return {
    id: "candidate-file-real-mv",
    candidateId: "candidate-1",
    importFileId: "import-real-mv",
    selected: true,
    proposedVocalMode: "dual",
    proposedAssetKind: "dual-track-video",
    roleConfidence: 0.95,
    probeDurationMs: 180000,
    probeSummary: { realMv: { sidecars: { cover: { relativePath: "artist/title/title.jpg" } } } },
    createdAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
    rootKind: "imports_pending",
    relativePath: "artist/title/title.mkv",
    sizeBytes: 123456,
    mtimeMs: 1778640000000,
    quickHash: "quick-real-mv",
    probeStatus: "probed",
    probePayload: {},
    durationMs: 180000,
    compatibilityStatus: "review_required",
    compatibilityReasons: [
      {
        code: "runtime-switch-unverified",
        severity: "warning",
        message: "Audio track role confirmation is pending.",
        source: "scanner"
      }
    ] satisfies CompatibilityReason[],
    mediaInfoSummary: createRealMvMediaInfoSummary(),
    mediaInfoProvenance: createMediaInfoProvenance(),
    trackRoles: createReviewedTrackRoles(),
    playbackProfile: createRealMvPlaybackProfile(),
    fileCreatedAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
    fileUpdatedAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
    ...overrides
  };
}

function createReviewedTrackRoles(): TrackRoles {
  return {
    original: { index: 0, id: "0x1100", label: "Original vocal" },
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
      { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
      { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
    ]
  };
}

function createMediaInfoProvenance(): MediaInfoProvenance {
  return {
    source: "mediainfo",
    sourceVersion: "24.01",
    probedAt: "2026-05-13T00:00:00.000Z",
    importedFrom: "scanner"
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

function expectSinglePromotion(promotions: PromotionInput[]): PromotionInput {
  expect(promotions).toHaveLength(1);
  const promotion = promotions[0];
  expect(promotion?.assets).toHaveLength(1);
  return promotion as PromotionInput;
}

function createSongFromPromotion(promotion: PromotionInput): Song {
  return {
    id: promotion.songId,
    title: promotion.title,
    normalizedTitle: promotion.title.toLowerCase(),
    titlePinyin: "",
    titleInitials: "",
    artistId: `artist-${promotion.artistName}`,
    artistName: promotion.artistName,
    language: promotion.language,
    status: promotion.songStatus ?? "ready",
    genre: [],
    tags: [],
    aliases: [],
    searchHints: [],
    releaseYear: promotion.releaseYear,
    canonicalDurationMs: promotion.assets[0]?.durationMs ?? null,
    searchWeight: 0,
    defaultAssetId: promotion.defaultAssetId,
    capabilities: { canSwitchVocalMode: true },
    createdAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-13T00:00:00.000Z").toISOString()
  };
}

function createAssetFromPromotion(promotion: PromotionInput, asset: PromotedAssetInput): Asset {
  return {
    id: asset.assetId,
    songId: promotion.songId,
    sourceType: "local",
    assetKind: asset.assetKind ?? "video",
    displayName: `${promotion.title} ${asset.vocalMode}`,
    filePath: asset.filePath,
    durationMs: asset.durationMs,
    lyricMode: "none",
    vocalMode: asset.vocalMode,
    status: asset.status ?? "ready",
    switchFamily: asset.switchFamily === undefined ? promotion.switchFamily : asset.switchFamily,
    switchQualityStatus: asset.switchQualityStatus ?? "verified",
    compatibilityStatus: asset.compatibilityStatus ?? "playable",
    compatibilityReasons: asset.compatibilityReasons ?? [],
    mediaInfoSummary: asset.mediaInfoSummary ?? null,
    mediaInfoProvenance: asset.mediaInfoProvenance ?? null,
    trackRoles: asset.trackRoles ?? { original: null, instrumental: null },
    playbackProfile: asset.playbackProfile ?? createRealMvPlaybackProfile(),
    createdAt: new Date("2026-05-13T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-13T00:00:00.000Z").toISOString()
  };
}

async function expectPathExists(filePath: string): Promise<void> {
  await expect(access(filePath)).resolves.toBeUndefined();
}
