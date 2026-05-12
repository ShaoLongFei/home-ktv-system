import Fastify from "fastify";
import type {
  ImportCandidate,
  ImportCandidateFileDetail,
  ImportCandidateStatus,
  ImportScanScope
} from "@home-ktv/domain";
import { describe, expect, it, vi } from "vitest";
import { registerAdminImportRoutes } from "../routes/admin-imports.js";

describe("admin import review routes", () => {
  it("GET /admin/import-candidates returns grouped candidates with joined file details", async () => {
    const { server, importCandidates } = await createAdminImportsHarness();

    const response = await server.inject({
      method: "GET",
      url: "/admin/import-candidates?status=pending"
    });

    expect(response.statusCode).toBe(200);
    expect(importCandidates.listCandidates).toHaveBeenCalledWith({ statuses: ["pending"] });
    expect(response.json()).toMatchObject({
      candidates: [
        {
          id: "candidate-1",
          title: "七里香",
          files: [
            {
              candidateFileId: "candidate-file-1",
              rootKind: "imports_pending",
              relativePath: "周杰伦/七里香/original.mp4",
              probeStatus: "probed",
              durationMs: 180000
            }
          ]
        }
      ]
    });
  });

  it("serializes real MV file review fields without absolute paths", async () => {
    const realMvFile = createRealMvCandidateFileDetail();
    const { server } = await createAdminImportsHarness({ files: [realMvFile] });

    const response = await server.inject({
      method: "GET",
      url: "/admin/import-candidates/candidate-1"
    });

    expect(response.statusCode).toBe(200);
    const file = response.json().candidate.files[0];
    expect(file).toMatchObject({
      candidateFileId: "candidate-file-real-mv",
      compatibilityStatus: "review_required",
      compatibilityReasons: [expect.objectContaining({ code: "instrumental-track-unmapped" })],
      mediaInfoSummary: {
        container: "matroska,webm",
        durationMs: 60041,
        videoCodec: "h264",
        resolution: { width: 1920, height: 1080 },
        audioTracks: [
          expect.objectContaining({ index: 0, label: "Original vocal" }),
          expect.objectContaining({ index: 1, label: "Instrumental" })
        ]
      },
      mediaInfoProvenance: expect.objectContaining({ source: "ffprobe" }),
      trackRoles: {
        original: expect.objectContaining({ index: 0 }),
        instrumental: expect.objectContaining({ index: 1 })
      },
      playbackProfile: expect.objectContaining({ kind: "single_file_audio_tracks" }),
      realMv: {
        metadataSources: expect.arrayContaining([expect.objectContaining({ field: "title", source: "filename" })]),
        metadataConflicts: [expect.objectContaining({ field: "title" })],
        scannerReasons: [expect.objectContaining({ code: "sidecar-json-invalid" })],
        sidecars: {
          cover: expect.objectContaining({ relativePath: "关喆-想你的夜.jpg" })
        }
      },
      coverPreviewUrl: "/admin/import-candidates/candidate-1/files/candidate-file-real-mv/cover"
    });
    expect(JSON.stringify(response.json())).not.toContain("/tmp/home-ktv");
  });

  it("PATCH /admin/import-candidates/:candidateId saves D-07 metadata without moving files", async () => {
    const { server, importCandidates } = await createAdminImportsHarness();

    const response = await server.inject({
      method: "PATCH",
      url: "/admin/import-candidates/candidate-1",
      payload: {
        title: "七里香",
        artistName: "周杰伦",
        language: "mandarin",
        sameVersionConfirmed: true,
        genre: ["pop"],
        tags: ["ktv"],
        aliases: ["Qi Li Xiang"],
        searchHints: ["qlx"],
        releaseYear: 2004,
        files: [
          {
            candidateFileId: "candidate-file-1",
            selected: true,
            proposedVocalMode: "original",
            proposedAssetKind: "video"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(importCandidates.updateCandidateMetadata).toHaveBeenCalledWith(
      "candidate-1",
      expect.objectContaining({
        title: "七里香",
        artistName: "周杰伦",
        language: "mandarin",
        sameVersionConfirmed: true,
        releaseYear: 2004
      })
    );
    expect(response.json().candidate.files[0]).toMatchObject({
      rootKind: "imports_pending",
      relativePath: "周杰伦/七里香/original.mp4"
    });
  });

  it("POST /admin/imports/scan enqueues a manual scan and returns accepted", async () => {
    const { server, scanScheduler } = await createAdminImportsHarness();

    const response = await server.inject({
      method: "POST",
      url: "/admin/imports/scan",
      payload: { scope: "all" }
    });

    expect(response.statusCode).toBe(202);
    expect(scanScheduler.enqueueManualScan).toHaveBeenCalledWith("all");
    expect(response.json()).toEqual({ accepted: true, scope: "all" });
  });

  it("POST /admin/import-candidates/:candidateId/reject-delete requires confirmDelete", async () => {
    const { server, admissionService } = await createAdminImportsHarness();

    const missingConfirmation = await server.inject({
      method: "POST",
      url: "/admin/import-candidates/candidate-1/reject-delete",
      payload: {}
    });

    expect(missingConfirmation.statusCode).toBe(400);
    expect(missingConfirmation.json()).toMatchObject({ error: "DELETE_CONFIRMATION_REQUIRED" });
    expect(admissionService.rejectDeleteCandidate).not.toHaveBeenCalled();

    const confirmed = await server.inject({
      method: "POST",
      url: "/admin/import-candidates/candidate-1/reject-delete",
      payload: { confirmDelete: true }
    });

    expect(confirmed.statusCode).toBe(200);
    expect(admissionService.rejectDeleteCandidate).toHaveBeenCalledWith("candidate-1", { confirmDelete: true });
  });

  it("POST /admin/import-candidates/:candidateId/approve returns FORMAL_DIRECTORY_CONFLICT", async () => {
    const { server, admissionService } = await createAdminImportsHarness();
    admissionService.approveCandidate.mockRejectedValueOnce({
      code: "FORMAL_DIRECTORY_CONFLICT",
      candidateId: "candidate-1",
      status: "conflict",
      conflictMeta: { conflictType: "formal_directory_exists" }
    });

    const response = await server.inject({
      method: "POST",
      url: "/admin/import-candidates/candidate-1/approve",
      payload: {}
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "FORMAL_DIRECTORY_CONFLICT",
      candidateId: "candidate-1",
      status: "conflict"
    });
  });

  it("POST /admin/import-candidates/:candidateId/resolve-conflict calls explicit conflict resolution", async () => {
    const { server, admissionService } = await createAdminImportsHarness();

    const response = await server.inject({
      method: "POST",
      url: "/admin/import-candidates/candidate-1/resolve-conflict",
      payload: { resolution: "create_version", versionSuffix: "live" }
    });

    expect(response.statusCode).toBe(200);
    expect(admissionService.resolveCandidateConflict).toHaveBeenCalledWith("candidate-1", {
      resolution: "create_version",
      versionSuffix: "live"
    });
  });
});

async function createAdminImportsHarness(input: { candidate?: ImportCandidate; files?: ImportCandidateFileDetail[] } = {}) {
  const server = Fastify({ logger: false });
  const candidate = input.candidate ?? createCandidate();
  const files = input.files ?? [createCandidateFileDetail()];
  const importCandidates = {
    listCandidates: vi.fn(async (_filters: { statuses?: ImportCandidateStatus[] }) => [candidate]),
    getCandidateWithFiles: vi.fn(async (_candidateId: string) => ({ candidate, files })),
    updateCandidateMetadata: vi.fn(async (_candidateId: string, metadata: Record<string, unknown>) => ({
      candidate: { ...candidate, ...metadata },
      files
    }))
  };
  const scanScheduler = {
    enqueueManualScan: vi.fn(async (_scope: ImportScanScope) => undefined)
  };
  const admissionService = {
    holdCandidate: vi.fn(async (_candidateId: string) => ({ status: "review_required" as const, candidate, files })),
    rejectDeleteCandidate: vi.fn(async (_candidateId: string, _input: { confirmDelete: true }) => ({
      status: "rejected" as const,
      candidate,
      files
    })),
    approveCandidate: vi.fn(async (_candidateId: string) => ({ status: "approved" as const, candidate, files })),
    resolveCandidateConflict: vi.fn(async (_candidateId: string, _input: Record<string, unknown>) => ({
      status: "approved" as const,
      candidate,
      files
    }))
  };

  await registerAdminImportRoutes(server, { importCandidates, scanScheduler, admissionService });
  return { server, importCandidates, scanScheduler, admissionService };
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
    defaultCandidateFileId: "candidate-file-1",
    sameVersionConfirmed: false,
    conflictSongId: null,
    reviewNotes: null,
    candidateMeta: {},
    createdAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString()
  };
}

function createCandidateFileDetail(): ImportCandidateFileDetail {
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
    fileUpdatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString()
  };
}

function createRealMvCandidateFileDetail(): ImportCandidateFileDetail {
  return {
    ...createCandidateFileDetail(),
    id: "candidate-file-real-mv",
    importFileId: "import-file-real-mv",
    selected: true,
    proposedVocalMode: "dual",
    proposedAssetKind: "dual-track-video",
    roleConfidence: 0.95,
    probeDurationMs: 60041,
    probeSummary: {
      realMv: {
        metadataSources: [
          { field: "title", source: "filename" },
          { field: "artistName", source: "sidecar" }
        ],
        metadataConflicts: [
          { field: "title", values: [{ source: "filename", value: "想你的夜" }, { source: "sidecar", value: "想你的夜 Live" }] }
        ],
        scannerReasons: [
          {
            code: "sidecar-json-invalid",
            severity: "warning",
            message: "invalid JSON",
            source: "scanner"
          }
        ],
        sidecars: {
          cover: {
            relativePath: "关喆-想你的夜.jpg",
            sizeBytes: 10,
            mtimeMs: 1777536000000,
            contentType: "image/jpeg"
          }
        }
      }
    },
    compatibilityStatus: "review_required",
    compatibilityReasons: [
      {
        code: "instrumental-track-unmapped",
        severity: "warning",
        message: "No instrumental track was mapped",
        source: "scanner"
      }
    ],
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
    },
    mediaInfoProvenance: {
      source: "ffprobe",
      sourceVersion: "6.1",
      probedAt: "2026-05-12T00:00:00.000Z",
      importedFrom: "ffprobe-json"
    },
    trackRoles: {
      original: { index: 0, id: "0x1100", label: "Original vocal" },
      instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
    },
    playbackProfile: {
      kind: "single_file_audio_tracks",
      container: "matroska,webm",
      videoCodec: "h264",
      audioCodecs: ["aac"],
      requiresAudioTrackSelection: true
    },
    rootKind: "imports_pending",
    relativePath: "关喆-想你的夜.mkv",
    durationMs: 60041
  };
}
