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
});

async function createAdminImportsHarness() {
  const server = Fastify({ logger: false });
  const candidate = createCandidate();
  const files = [createCandidateFileDetail()];
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

  await registerAdminImportRoutes(server, { importCandidates, scanScheduler });
  return { server, importCandidates, scanScheduler };
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
