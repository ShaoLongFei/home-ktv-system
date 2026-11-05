import type {
  AudioTrackSummary,
  CompatibilityReason,
  MediaInfoProvenance,
  MediaInfoSummary,
  TrackRef,
  TrackRoles
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../db/query-executor.js";
import {
  buildSingleFileAudioTrackPlaybackProfile,
  inferTrackRolesFromRealMv
} from "./real-mv-compatibility.js";
import type {
  PlayableMediaAsset,
  PlayableMediaLookup,
  PlayableMediaRepository,
  PlayableMediaStatus,
  PlayableMediaVariantPaths
} from "./playable-media-repository.js";

interface NasPlayableMediaRow {
  asset_id: string;
  song_id: string;
  file_path: string;
  file_name: string;
  extension: string;
  size_bytes: number | string | null;
  technical_status: string;
  technical_metadata: unknown;
  missing_at: Date | string | null;
  title: string;
  primary_artist_name: string;
}

export class NasPlayableMediaRepository implements PlayableMediaRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findPlayableBySource(source: PlayableMediaLookup): Promise<PlayableMediaAsset | null> {
    if (source.sourceType !== "nas") {
      return null;
    }

    const result = await this.db.query<NasPlayableMediaRow>(
      `SELECT s.id AS asset_id,
              s.id AS song_id,
              s.file_path,
              s.file_name,
              s.extension,
              s.size_bytes,
              s.technical_status,
              s.technical_metadata,
              s.missing_at,
              s.title,
              s.primary_artist_name
       FROM ktv_songs s
       WHERE s.id = $1
       LIMIT 1`,
      [source.assetId]
    );

    const row = result.rows[0];
    if (!row || row.missing_at !== null) {
      return null;
    }

    return mapNasPlayableMedia(row);
  }
}

function mapNasPlayableMedia(row: NasPlayableMediaRow): PlayableMediaAsset {
  const mediaInfo = readNasMediaInfo(row.technical_metadata, {
    fallbackFileSizeBytes: toNumber(row.size_bytes ?? 0),
    fallbackImportedFrom: row.file_path
  }) ?? defaultNasMediaInfo(row);
  const compatibilityReasons = compatibilityReasonsFor(row, mediaInfo.mediaInfoSummary);
  const status = statusFor(row, mediaInfo.mediaInfoSummary);
  const compatibilityStatus = status === "ready" ? "playable" : "unsupported";

  return {
    sourceType: "nas",
    songId: row.song_id,
    assetId: row.asset_id,
    title: row.title,
    artistName: row.primary_artist_name,
    displayName: row.file_name,
    filePath: row.file_path,
    status,
    durationMs: mediaInfo.mediaInfoSummary.durationMs ?? 0,
    compatibilityStatus,
    compatibilityReasons,
    mediaInfoSummary: mediaInfo.mediaInfoSummary,
    mediaInfoProvenance: mediaInfo.mediaInfoProvenance,
    trackRoles: inferTrackRolesWithOrderFallback(mediaInfo.mediaInfoSummary),
    playbackProfile: buildSingleFileAudioTrackPlaybackProfile(mediaInfo.mediaInfoSummary),
    ...(readVariantPaths(row.technical_metadata) ? { variantFilePaths: readVariantPaths(row.technical_metadata)! } : {})
  };
}

function statusFor(row: NasPlayableMediaRow, mediaInfoSummary: MediaInfoSummary): PlayableMediaStatus {
  if (row.technical_status === "failed") {
    return "failed";
  }
  return mediaInfoSummary.audioTracks.length > 0 ? "ready" : "unavailable";
}

function compatibilityReasonsFor(row: NasPlayableMediaRow, mediaInfoSummary: MediaInfoSummary): CompatibilityReason[] {
  const reasons: CompatibilityReason[] = [];
  if (row.technical_status === "failed") {
    reasons.push({
      code: "technical-probe-failed",
      severity: "error",
      message: "NAS asset technical probe failed",
      source: "probe"
    });
  }
  if (mediaInfoSummary.audioTracks.length === 0) {
    reasons.push({
      code: "missing-audio-tracks",
      severity: "error",
      message: "No audio tracks were detected",
      source: "probe"
    });
  }
  return reasons;
}

function readVariantPaths(metadata: unknown): PlayableMediaVariantPaths | null {
  const record = asRecord(metadata);
  const variants = record ? asRecord(record.onlineVariants) : null;
  const instrumental = variants ? variants.instrumental : null;
  if (typeof instrumental !== "string" || instrumental.trim().length === 0) {
    return null;
  }
  return { instrumental };
}

function readNasMediaInfo(
  metadata: unknown,
  fallback: { fallbackFileSizeBytes: number; fallbackImportedFrom: string }
): { mediaInfoSummary: MediaInfoSummary; mediaInfoProvenance: MediaInfoProvenance } | null {
  const metadataRecord = asRecord(metadata);
  if (!metadataRecord) {
    return null;
  }

  const summaryRecord = asRecord(metadataRecord.mediaInfoSummary) ?? metadataRecord;
  const audioTracks = readAudioTracks(summaryRecord.audioTracks);
  if (!audioTracks) {
    return null;
  }

  return {
    mediaInfoSummary: {
      container: readNullableString(summaryRecord.container),
      durationMs: readNullableNumber(summaryRecord.durationMs),
      videoCodec: readNullableString(summaryRecord.videoCodec),
      resolution: readResolution(summaryRecord.resolution),
      fileSizeBytes: readNumber(summaryRecord.fileSizeBytes) ?? fallback.fallbackFileSizeBytes,
      audioTracks
    },
    mediaInfoProvenance: readMediaInfoProvenance(metadataRecord.mediaInfoProvenance, fallback.fallbackImportedFrom)
  };
}

function defaultNasMediaInfo(row: NasPlayableMediaRow): {
  mediaInfoSummary: MediaInfoSummary;
  mediaInfoProvenance: MediaInfoProvenance;
} {
  return {
    mediaInfoSummary: {
      container: normalizeExtension(row.extension),
      durationMs: null,
      videoCodec: null,
      resolution: null,
      fileSizeBytes: toNumber(row.size_bytes ?? 0),
      audioTracks: []
    },
    mediaInfoProvenance: {
      source: "unknown",
      sourceVersion: null,
      probedAt: null,
      importedFrom: row.file_path
    }
  };
}

function inferTrackRolesWithOrderFallback(summary: MediaInfoSummary): TrackRoles {
  const inferred = inferTrackRolesFromRealMv({ mediaInfoSummary: summary });
  return {
    original: inferred.original ?? toTrackRef(summary.audioTracks[0]),
    instrumental: inferred.instrumental ?? toTrackRef(summary.audioTracks[1])
  };
}

function readAudioTracks(value: unknown): AudioTrackSummary[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((track, index) => readAudioTrack(track, index))
    .filter((track): track is AudioTrackSummary => track !== null);
}

function readAudioTrack(value: unknown, fallbackIndex: number): AudioTrackSummary | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const trackIndex = readNumber(record.index) ?? fallbackIndex + 1;
  return {
    index: trackIndex,
    id: readString(record.id) ?? `stream-${trackIndex}`,
    label: readString(record.label) ?? `Audio ${trackIndex}`,
    language: readNullableString(record.language),
    codec: readNullableString(record.codec),
    channels: readNullableNumber(record.channels)
  };
}

function readMediaInfoProvenance(value: unknown, fallbackImportedFrom: string): MediaInfoProvenance {
  const record = asRecord(value);
  return {
    source: readProvenanceSource(record?.source),
    sourceVersion: readNullableString(record?.sourceVersion),
    probedAt: readNullableString(record?.probedAt),
    importedFrom: readNullableString(record?.importedFrom) ?? fallbackImportedFrom
  };
}

function readProvenanceSource(value: unknown): MediaInfoProvenance["source"] {
  return value === "ffprobe" || value === "mediainfo" || value === "manual" || value === "unknown"
    ? value
    : "unknown";
}

function readResolution(value: unknown): MediaInfoSummary["resolution"] {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const width = readNumber(record.width);
  const height = readNumber(record.height);
  return width !== null && height !== null ? { width, height } : null;
}

function toTrackRef(track: AudioTrackSummary | undefined): TrackRef | null {
  return track ? { index: track.index, id: track.id, label: track.label } : null;
}

function normalizeExtension(extension: string): string | null {
  const value = extension.replace(/^\./u, "").trim().toLowerCase();
  return value.length > 0 ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : readString(value);
}

function readNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : readNumber(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
