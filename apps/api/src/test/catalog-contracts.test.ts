import type { QueryExecutor } from "../db/query-executor.js";
import type { AssetRow, ImportCandidateFileDetailRow, SongRow } from "../db/schema.js";
import {
  mapAssetRow,
  normalizeMediaInfoSummary,
  normalizeTrackRoles,
  PgAssetRepository
} from "../modules/catalog/repositories/asset-repository.js";
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
      compatibilityStatus: "unknown",
      compatibilityReasons: [],
      mediaInfoSummary: {
        container: null,
        durationMs: null,
        videoCodec: null,
        resolution: null,
        fileSizeBytes: 0,
        audioTracks: []
      },
      mediaInfoProvenance: {
        source: "unknown",
        sourceVersion: null,
        probedAt: null,
        importedFrom: null
      },
      trackRoles: {
        original: null,
        instrumental: null
      },
      playbackProfile: {
        kind: "separate_asset_pair",
        container: null,
        videoCodec: null,
        audioCodecs: [],
        requiresAudioTrackSelection: false
      },
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

  it("maps a single real-MV asset with normalized media and track fields", () => {
    const asset = mapAssetRow(createRealMvAssetRow());

    expect(asset.displayName).toBe("七里香");
    expect(asset.assetKind).toBe("dual-track-video");
    expect(asset.compatibilityStatus).toBe("review_required");
    expect(asset.mediaInfoSummary).toMatchObject({
      container: "matroska,webm",
      fileSizeBytes: 104857600,
      audioTracks: expect.arrayContaining([
        expect.objectContaining({ index: 0, id: "0x1100", label: "Original vocal" }),
        expect.objectContaining({ index: 1, id: "0x1101", label: "Instrumental" })
      ])
    });
    expect(asset.trackRoles?.instrumental?.id).toBe("0x1101");
    expect(asset.playbackProfile).toMatchObject({
      kind: "single_file_audio_tracks",
      requiresAudioTrackSelection: true
    });
  });

  it("selects real-MV columns when loading assets", async () => {
    const queries: string[] = [];
    const db: QueryExecutor = {
      async query<TRow>(text: string) {
        queries.push(text);
        return { rows: [] as TRow[] };
      }
    };

    await new PgAssetRepository(db).findById("asset-real-mv");

    expect(queries[0]).toContain(
      "compatibility_status, compatibility_reasons, media_info_summary, media_info_provenance, track_roles, playback_profile"
    );
  });

  it("normalizes malformed real-MV JSONB values to shaped defaults", () => {
    expect(normalizeMediaInfoSummary({})).toEqual({
      container: null,
      durationMs: null,
      videoCodec: null,
      resolution: null,
      fileSizeBytes: 0,
      audioTracks: []
    });
    expect(normalizeTrackRoles({})).toEqual({ original: null, instrumental: null });
  });

  it("maps candidate file real-MV fields without treating probe payload as normalized media summary", () => {
    const detail = mapImportCandidateFileDetailRow({
      ...createCandidateFileDetailRow(),
      media_info_summary: {
        container: "matroska,webm",
        durationMs: 60000,
        videoCodec: "h264",
        resolution: { width: 1920, height: 1080 },
        fileSizeBytes: 104857600,
        audioTracks: [
          { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
          { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
        ]
      },
      track_roles: {
        original: { index: 0, id: "0x1100", label: "Original vocal" },
        instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
      }
    });

    expect(detail.mediaInfoSummary).not.toEqual(detail.probePayload);
    expect(detail.trackRoles?.instrumental?.label).toBe("Instrumental");
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
    artist_pinyin: "zhoujielun",
    artist_initials: "zjl",
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
    compatibility_status: "unknown",
    compatibility_reasons: [],
    media_info_summary: {
      container: null,
      durationMs: null,
      videoCodec: null,
      resolution: null,
      fileSizeBytes: 0,
      audioTracks: []
    },
    media_info_provenance: {
      source: "unknown",
      sourceVersion: null,
      probedAt: null,
      importedFrom: null
    },
    track_roles: {
      original: null,
      instrumental: null
    },
    playback_profile: {
      kind: "separate_asset_pair",
      container: null,
      videoCodec: null,
      audioCodecs: [],
      requiresAudioTrackSelection: false
    },
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

function createRealMvAssetRow(): AssetRow {
  return {
    id: "asset-real-mv",
    song_id: "song-real-mv",
    source_type: "local",
    asset_kind: "dual-track-video",
    display_name: "七里香",
    file_path: "jay/qilixiang.mkv",
    duration_ms: 60000,
    lyric_mode: "hard_sub",
    vocal_mode: "dual",
    status: "ready",
    switch_family: null,
    switch_quality_status: "review_required",
    compatibility_status: "review_required",
    compatibility_reasons: [{ code: "browser-track-switch-unknown", severity: "warning", message: "Track switch needs review", source: "review" }],
    media_info_summary: {
      container: "matroska,webm",
      durationMs: 60000,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 104857600,
      audioTracks: [
        { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
        { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
      ]
    },
    media_info_provenance: {
      source: "ffprobe",
      sourceVersion: "8.1",
      probedAt: "2026-05-11T00:00:00.000Z",
      importedFrom: "jay/qilixiang.mkv"
    },
    track_roles: {
      original: { index: 0, id: "0x1100", label: "Original vocal" },
      instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
    },
    playback_profile: {
      kind: "single_file_audio_tracks",
      container: "matroska,webm",
      videoCodec: "h264",
      audioCodecs: ["aac"],
      requiresAudioTrackSelection: true
    },
    created_at: now,
    updated_at: now
  };
}
