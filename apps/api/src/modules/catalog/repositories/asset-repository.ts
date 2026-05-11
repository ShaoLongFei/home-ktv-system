import type {
  Asset,
  AssetId,
  AssetKind,
  AssetSourceType,
  AssetStatus,
  CompatibilityReason,
  CompatibilityStatus,
  LyricMode,
  MediaInfoProvenance,
  MediaInfoSummary,
  PlaybackProfile,
  SongId,
  SwitchFamily,
  SwitchQualityStatus,
  TrackRef,
  TrackRoles,
  VocalMode
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { AssetRow } from "../../../db/schema.js";

export interface AssetRepository {
  findById(assetId: AssetId): Promise<Asset | null>;
  findVerifiedSwitchCounterparts(asset: Asset): Promise<Asset[]>;
}

export interface UpdateFormalAssetInput {
  status?: AssetStatus;
  vocalMode?: VocalMode;
  lyricMode?: LyricMode;
  switchFamily?: SwitchFamily | null;
  switchQualityStatus?: SwitchQualityStatus;
  durationMs?: number;
  compatibilityStatus?: CompatibilityStatus;
  compatibilityReasons?: readonly CompatibilityReason[];
  mediaInfoSummary?: MediaInfoSummary | null;
  mediaInfoProvenance?: MediaInfoProvenance | null;
  trackRoles?: TrackRoles;
  playbackProfile?: PlaybackProfile;
}

export interface AdminCatalogAssetRepository {
  findById(assetId: AssetId): Promise<Asset | null>;
  listBySongId(songId: SongId): Promise<Asset[]>;
  updateFormalAsset(assetId: AssetId, input: UpdateFormalAssetInput): Promise<Asset | null>;
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isTrackRef(value: unknown): value is TrackRef {
  return (
    isRecord(value) &&
    typeof value.index === "number" &&
    Number.isFinite(value.index) &&
    typeof value.id === "string" &&
    typeof value.label === "string"
  );
}

function normalizeTrackRef(value: unknown): TrackRef | null {
  return isTrackRef(value) ? { index: value.index, id: value.id, label: value.label } : null;
}

export function normalizeMediaInfoSummary(value: unknown): MediaInfoSummary {
  if (!isRecord(value)) {
    return defaultMediaInfoSummary();
  }

  const resolution = isRecord(value.resolution) &&
    typeof value.resolution.width === "number" &&
    typeof value.resolution.height === "number"
    ? { width: value.resolution.width, height: value.resolution.height }
    : null;
  const audioTracks = Array.isArray(value.audioTracks)
    ? value.audioTracks.map((track) => {
        if (!isTrackRef(track) || !isRecord(track)) {
          return null;
        }
        return {
          index: track.index,
          id: track.id,
          label: track.label,
          language: stringOrNull(track.language),
          codec: stringOrNull(track.codec),
          channels: numberOrNull(track.channels)
        };
      }).filter((track): track is MediaInfoSummary["audioTracks"][number] => track !== null)
    : [];

  return {
    container: stringOrNull(value.container),
    durationMs: numberOrNull(value.durationMs),
    videoCodec: stringOrNull(value.videoCodec),
    resolution,
    fileSizeBytes: typeof value.fileSizeBytes === "number" && Number.isFinite(value.fileSizeBytes) ? value.fileSizeBytes : 0,
    audioTracks
  };
}

export function normalizeMediaInfoProvenance(value: unknown): MediaInfoProvenance {
  if (!isRecord(value)) {
    return defaultMediaInfoProvenance();
  }
  const source = value.source === "ffprobe" || value.source === "mediainfo" || value.source === "manual" || value.source === "unknown"
    ? value.source
    : "unknown";
  return {
    source,
    sourceVersion: stringOrNull(value.sourceVersion),
    probedAt: stringOrNull(value.probedAt),
    importedFrom: stringOrNull(value.importedFrom)
  };
}

export function normalizeTrackRoles(value: unknown): TrackRoles {
  if (!isRecord(value)) {
    return defaultTrackRoles();
  }
  return {
    original: normalizeTrackRef(value.original),
    instrumental: normalizeTrackRef(value.instrumental)
  };
}

export function normalizePlaybackProfile(value: unknown): PlaybackProfile {
  if (!isRecord(value)) {
    return defaultPlaybackProfile();
  }
  const kind = value.kind === "single_file_audio_tracks" ? "single_file_audio_tracks" : "separate_asset_pair";
  const audioCodecs = Array.isArray(value.audioCodecs)
    ? value.audioCodecs.filter((codec): codec is string => typeof codec === "string")
    : [];
  return {
    kind,
    container: stringOrNull(value.container),
    videoCodec: stringOrNull(value.videoCodec),
    audioCodecs,
    requiresAudioTrackSelection: value.requiresAudioTrackSelection === true
  };
}

function defaultMediaInfoSummary(): MediaInfoSummary {
  return { container: null, durationMs: null, videoCodec: null, resolution: null, fileSizeBytes: 0, audioTracks: [] };
}

function defaultMediaInfoProvenance(): MediaInfoProvenance {
  return { source: "unknown", sourceVersion: null, probedAt: null, importedFrom: null };
}

function defaultTrackRoles(): TrackRoles {
  return { original: null, instrumental: null };
}

function defaultPlaybackProfile(): PlaybackProfile {
  return {
    kind: "separate_asset_pair",
    container: null,
    videoCodec: null,
    audioCodecs: [],
    requiresAudioTrackSelection: false
  };
}

function isCompatibilityReason(value: unknown): value is CompatibilityReason {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    (value.severity === "warning" || value.severity === "error") &&
    typeof value.message === "string" &&
    (value.source === "probe" || value.source === "runtime_spike" || value.source === "review" || value.source === "scanner")
  );
}

function normalizeCompatibilityReasons(value: unknown): CompatibilityReason[] {
  return Array.isArray(value) ? value.filter(isCompatibilityReason) : [];
}

export function mapAssetRow(row: AssetRow): Asset {
  return {
    id: row.id,
    songId: row.song_id as SongId,
    sourceType: row.source_type as AssetSourceType,
    assetKind: row.asset_kind as AssetKind,
    displayName: row.display_name,
    filePath: row.file_path,
    durationMs: row.duration_ms,
    lyricMode: row.lyric_mode as LyricMode,
    vocalMode: row.vocal_mode as VocalMode,
    status: row.status as AssetStatus,
    switchFamily: row.switch_family as SwitchFamily | null,
    switchQualityStatus: row.switch_quality_status as SwitchQualityStatus,
    compatibilityStatus: row.compatibility_status as CompatibilityStatus,
    compatibilityReasons: normalizeCompatibilityReasons(row.compatibility_reasons),
    mediaInfoSummary: normalizeMediaInfoSummary(row.media_info_summary),
    mediaInfoProvenance: normalizeMediaInfoProvenance(row.media_info_provenance),
    trackRoles: normalizeTrackRoles(row.track_roles),
    playbackProfile: normalizePlaybackProfile(row.playback_profile),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export class PgAssetRepository implements AssetRepository, AdminCatalogAssetRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findById(assetId: AssetId): Promise<Asset | null> {
    const result = await this.db.query<AssetRow>(
      `SELECT id, song_id, source_type, asset_kind, display_name, file_path, duration_ms,
              lyric_mode, vocal_mode, status, switch_family, switch_quality_status, compatibility_status, compatibility_reasons, media_info_summary, media_info_provenance, track_roles, playback_profile,
              created_at, updated_at
       FROM assets
       WHERE id = $1
       LIMIT 1`,
      [assetId]
    );

    const row = result.rows[0];
    return row ? mapAssetRow(row) : null;
  }

  async listBySongId(songId: SongId): Promise<Asset[]> {
    const result = await this.db.query<AssetRow>(
      `SELECT id, song_id, source_type, asset_kind, display_name, file_path, duration_ms,
              lyric_mode, vocal_mode, status, switch_family, switch_quality_status, compatibility_status, compatibility_reasons, media_info_summary, media_info_provenance, track_roles, playback_profile,
              created_at, updated_at
       FROM assets
       WHERE song_id = $1
       ORDER BY created_at ASC`,
      [songId]
    );

    return result.rows.map(mapAssetRow);
  }

  async updateFormalAsset(assetId: AssetId, input: UpdateFormalAssetInput): Promise<Asset | null> {
    const assignments: string[] = [];
    const values: unknown[] = [];

    if (input.status !== undefined) {
      values.push(input.status);
      assignments.push(`status = $${values.length}`);
    }
    if (input.vocalMode !== undefined) {
      values.push(input.vocalMode);
      assignments.push(`vocal_mode = $${values.length}`);
    }
    if (input.lyricMode !== undefined) {
      values.push(input.lyricMode);
      assignments.push(`lyric_mode = $${values.length}`);
    }
    if (input.switchFamily !== undefined) {
      values.push(input.switchFamily);
      assignments.push(`switch_family = $${values.length}`);
    }
    if (input.switchQualityStatus !== undefined) {
      values.push(input.switchQualityStatus);
      assignments.push(`switch_quality_status = $${values.length}`);
    }
    if (input.durationMs !== undefined) {
      values.push(input.durationMs);
      assignments.push(`duration_ms = $${values.length}`);
    }
    if (input.compatibilityStatus !== undefined) {
      values.push(input.compatibilityStatus);
      assignments.push(`compatibility_status = $${values.length}`);
    }
    if (input.compatibilityReasons !== undefined) {
      values.push(input.compatibilityReasons);
      assignments.push(`compatibility_reasons = $${values.length}::jsonb`);
    }
    if (input.mediaInfoSummary !== undefined) {
      values.push(input.mediaInfoSummary ?? defaultMediaInfoSummary());
      assignments.push(`media_info_summary = $${values.length}::jsonb`);
    }
    if (input.mediaInfoProvenance !== undefined) {
      values.push(input.mediaInfoProvenance ?? defaultMediaInfoProvenance());
      assignments.push(`media_info_provenance = $${values.length}::jsonb`);
    }
    if (input.trackRoles !== undefined) {
      values.push(input.trackRoles);
      assignments.push(`track_roles = $${values.length}::jsonb`);
    }
    if (input.playbackProfile !== undefined) {
      values.push(input.playbackProfile);
      assignments.push(`playback_profile = $${values.length}::jsonb`);
    }

    if (assignments.length > 0) {
      values.push(assetId);
      await this.db.query(
        `UPDATE assets
         SET ${assignments.join(", ")}, updated_at = now()
         WHERE id = $${values.length}`,
        values
      );
    }

    return this.findById(assetId);
  }

  async findVerifiedSwitchCounterparts(asset: Asset): Promise<Asset[]> {
    if (!asset.switchFamily) {
      return [];
    }

    const result = await this.db.query<AssetRow>(
      `SELECT id, song_id, source_type, asset_kind, display_name, file_path, duration_ms,
              lyric_mode, vocal_mode, status, switch_family, switch_quality_status, compatibility_status, compatibility_reasons, media_info_summary, media_info_provenance, track_roles, playback_profile,
              created_at, updated_at
       FROM assets
       WHERE song_id = $1
         AND switch_family = $2
         AND vocal_mode <> $3
         AND status = 'ready'
         AND switch_quality_status = 'verified'
       ORDER BY created_at ASC`,
      [asset.songId, asset.switchFamily, asset.vocalMode]
    );

    return result.rows.map(mapAssetRow);
  }
}
