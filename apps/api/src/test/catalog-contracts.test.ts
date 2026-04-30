import type { QueryExecutor } from "../db/query-executor.js";
import type { ImportCandidateFileDetailRow, SongRow } from "../db/schema.js";
import { mapSongRow, PgSongRepository } from "../modules/catalog/repositories/song-repository.js";
import { mapImportCandidateFileDetailRow } from "../modules/ingest/repositories/import-candidate-repository.js";
import { describe, expect, it } from "vitest";

const now = new Date("2026-04-30T00:00:00.000Z");

describe("catalog repository contracts", () => {
  it("maps SongRow.status to Song.status", () => {
    expect(mapSongRow(createSongRow("review_required")).status).toBe("review_required");
  });

  it("selects the status column when loading songs by id", async () => {
    const queries: string[] = [];
    const db: QueryExecutor = {
      async query<TRow>(text: string, values?: readonly unknown[]) {
        queries.push(text);
        expect(values).toEqual(["song-main"]);
        return { rows: [] as TRow[] };
      }
    };

    await new PgSongRepository(db).findById("song-main");

    expect(queries[0]).toMatch(/\bstatus\b/);
  });

  it("maps joined import candidate file details without exposing absolute paths", () => {
    const detail = mapImportCandidateFileDetailRow(createCandidateFileDetailRow());

    expect(detail).toEqual({
      id: "candidate-file-1",
      candidateId: "candidate-1",
      importFileId: "import-file-1",
      selected: true,
      proposedVocalMode: "instrumental",
      proposedAssetKind: "video",
      roleConfidence: 0.92,
      probeDurationMs: 180123,
      probeSummary: { videoStreams: 1, audioStreams: 2 },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      rootKind: "imports_pending",
      relativePath: "jay/qilixiang.instrumental.mp4",
      sizeBytes: 123456789,
      mtimeMs: 1777536000000,
      quickHash: "quick-hash",
      probeStatus: "probed",
      probePayload: { format: { duration: "180.123" } },
      durationMs: 180123,
      fileCreatedAt: now.toISOString(),
      fileUpdatedAt: now.toISOString()
    });
  });
});

function createSongRow(status: string): SongRow {
  return {
    id: "song-main",
    title: "七里香",
    normalized_title: "七里香",
    title_pinyin: "qilixiang",
    title_initials: "qlx",
    artist_id: "artist-jay",
    artist_name: "周杰伦",
    language: "mandarin",
    status,
    genre: [],
    tags: [],
    aliases: [],
    search_hints: [],
    release_year: null,
    canonical_duration_ms: 180000,
    search_weight: 0,
    default_asset_id: "asset-instrumental",
    created_at: now,
    updated_at: now
  };
}

function createCandidateFileDetailRow(): ImportCandidateFileDetailRow {
  return {
    candidate_file_id: "candidate-file-1",
    candidate_id: "candidate-1",
    import_file_id: "import-file-1",
    selected: true,
    proposed_vocal_mode: "instrumental",
    proposed_asset_kind: "video",
    role_confidence: 0.92,
    probe_duration_ms: 180123,
    probe_summary: { videoStreams: 1, audioStreams: 2 },
    candidate_file_created_at: now,
    candidate_file_updated_at: now,
    root_kind: "imports_pending",
    relative_path: "jay/qilixiang.instrumental.mp4",
    size_bytes: 123456789,
    mtime_ms: 1777536000000,
    quick_hash: "quick-hash",
    probe_status: "probed",
    probe_payload: { format: { duration: "180.123" } },
    duration_ms: 180123,
    import_file_created_at: now,
    import_file_updated_at: now
  };
}
