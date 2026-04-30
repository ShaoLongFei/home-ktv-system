import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  ImportCandidate,
  ImportCandidateFileDetail,
  ImportCandidateStatus,
  ImportFileRootKind,
  VocalMode
} from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import { CatalogAdmissionError, CatalogAdmissionService } from "../modules/catalog/admission-service.js";
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

  it("requires targetSongId for merge_existing conflict resolution", async () => {
    const harness = await createAdmissionHarness();

    await expect(
      harness.service.resolveCandidateConflict("candidate-1", { resolution: "merge_existing" })
    ).rejects.toMatchObject({ code: "TARGET_SONG_REQUIRED" });
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
  const service = new CatalogAdmissionService({
    paths,
    importCandidates,
    importFiles,
    catalogWriter: { promoteApprovedCandidate: async () => undefined }
  });

  return {
    paths,
    service,
    importCandidates,
    importFiles,
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
    fileCreatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    fileUpdatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    ...overrides
  };
}

async function expectPathExists(filePath: string): Promise<void> {
  await expect(access(filePath)).resolves.toBeUndefined();
}
