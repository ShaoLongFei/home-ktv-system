import { describe, expect, it, vi } from "vitest";
import type {
  CompatibilityReason,
  ImportCandidate,
  ImportFile,
  TrackRoles
} from "@home-ktv/domain";
import { CandidateBuilder } from "../modules/ingest/candidate-builder.js";
import { deriveRealMvAdmissionPolicy } from "../modules/ingest/real-mv-policy.js";
import type { ImportCandidateRepository } from "../modules/ingest/repositories/import-candidate-repository.js";

describe("deriveRealMvAdmissionPolicy", () => {
  it("returns a reserved review-first policy for a playable two-track fixture", () => {
    const policy = deriveRealMvAdmissionPolicy({
      title: "想你的夜",
      artistName: "关喆",
      compatibilityStatus: "playable",
      trackRoles: createTrackRoles(),
      scannerReasons: []
    });

    expect(policy).toEqual({
      mode: "review_first",
      reservedAutoAdmit: {
        reserved: true,
        eligible: true,
        reasons: []
      }
    });
  });

  it("marks unsupported fixtures ineligible with compatibility-not-playable", () => {
    const policy = deriveRealMvAdmissionPolicy({
      title: "想你的夜",
      artistName: "关喆",
      compatibilityStatus: "unsupported",
      trackRoles: createTrackRoles(),
      scannerReasons: []
    });

    expect(policy.reservedAutoAdmit).toEqual({
      reserved: true,
      eligible: false,
      reasons: ["compatibility-not-playable"]
    });
  });

  it("marks unmapped fixtures ineligible with missing track reasons", () => {
    const policy = deriveRealMvAdmissionPolicy({
      title: "想你的夜",
      artistName: "关喆",
      compatibilityStatus: "playable",
      trackRoles: { original: null, instrumental: null },
      scannerReasons: []
    });

    expect(policy.reservedAutoAdmit).toEqual({
      reserved: true,
      eligible: false,
      reasons: ["missing-original-track", "missing-instrumental-track"]
    });
  });

  it("marks scanner-reason fixtures ineligible with scanner-reasons-present", () => {
    const policy = deriveRealMvAdmissionPolicy({
      title: "想你的夜",
      artistName: "关喆",
      compatibilityStatus: "playable",
      trackRoles: createTrackRoles(),
      scannerReasons: [
        {
          code: "sidecar-json-invalid",
          severity: "warning",
          message: "invalid song.json",
          source: "scanner"
        } satisfies CompatibilityReason
      ]
    });

    expect(policy.reservedAutoAdmit).toEqual({
      reserved: true,
      eligible: false,
      reasons: ["scanner-reasons-present"]
    });
  });
});

describe("CandidateBuilder", () => {
  it("persists real MV admission policy metadata without changing candidate status", async () => {
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
        probePayload: {
          realMv: {
            mediaKind: "single_file_real_mv",
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
      status: "review_required",
      candidateMeta: {
        realMv: {
          admissionPolicy: {
            mode: "review_first",
            reservedAutoAdmit: {
              reserved: true,
              eligible: false,
              reasons: ["compatibility-not-playable"]
            }
          }
        }
      }
    });
    expect(capturedInput.candidate.status).toBe("review_required");
  });
});

function createTrackRoles(): TrackRoles {
  return {
    original: { index: 0, id: "0x1100", label: "Original vocal" },
    instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
  };
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
