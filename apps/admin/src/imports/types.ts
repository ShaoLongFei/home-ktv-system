export type ImportCandidateStatus = "pending" | "held" | "review_required" | "conflict";
export type Language = "mandarin" | "cantonese" | "other";
export type VocalMode = "original" | "instrumental" | "dual" | "unknown";
export type AssetKind = "video" | "audio+lyrics" | "dual-track-video";
export type ImportFileRootKind = "imports_pending" | "imports_needs_review" | "songs";
export type ProbeStatus = "pending" | "probed" | "failed" | "skipped" | "deleted";
export type CompatibilityStatus = "unknown" | "review_required" | "playable" | "unsupported";
export type CompatibilityReasonSeverity = "info" | "warning" | "error";
export type CompatibilityReasonSource = "scanner" | "probe" | "runtime" | "manual";

export interface CompatibilityReason {
  code: string;
  severity: CompatibilityReasonSeverity;
  message: string;
  source: CompatibilityReasonSource;
}

export interface TrackRef {
  index: number;
  id: string;
  label: string;
}

export interface TrackRoles {
  original: TrackRef | null;
  instrumental: TrackRef | null;
}

export interface MediaInfoSummary {
  container: string | null;
  durationMs: number | null;
  videoCodec: string | null;
  resolution: { width: number; height: number } | null;
  fileSizeBytes: number;
  audioTracks: ReadonlyArray<TrackRef & {
    language: string | null;
    codec: string | null;
    channels: number | null;
  }>;
}

export interface MediaInfoProvenance {
  source: "ffprobe" | "mediainfo" | "manual" | "unknown";
  sourceVersion: string | null;
  probedAt: string | null;
  importedFrom: string | null;
}

export interface PlaybackProfile {
  kind: "separate_asset_pair" | "single_file_audio_tracks";
  container: string | null;
  videoCodec: string | null;
  audioCodecs: readonly string[];
  requiresAudioTrackSelection: boolean;
}

export interface RealMvSidecarArtifact {
  relativePath: string;
  sizeBytes?: number;
  mtimeMs?: number;
  contentType?: string;
}

export interface RealMvPreview {
  groupKey?: string;
  mediaKind?: string;
  sidecarMetadata?: Record<string, unknown>;
  scannerReasons?: readonly CompatibilityReason[];
  metadataSources?: readonly Record<string, unknown>[];
  metadataConflicts?: readonly Record<string, unknown>[];
  sidecars?: {
    cover?: RealMvSidecarArtifact | null;
    songJson?: RealMvSidecarArtifact | null;
  };
}

export interface ImportCandidateFileDetail {
  candidateFileId: string;
  importFileId: string;
  selected: boolean;
  proposedVocalMode: VocalMode | null;
  proposedAssetKind: AssetKind | null;
  roleConfidence: number | null;
  probeDurationMs: number | null;
  probeSummary: Record<string, unknown>;
  compatibilityStatus?: CompatibilityStatus;
  compatibilityReasons?: readonly CompatibilityReason[];
  mediaInfoSummary?: MediaInfoSummary | null;
  mediaInfoProvenance?: MediaInfoProvenance | null;
  trackRoles?: TrackRoles;
  playbackProfile?: PlaybackProfile;
  realMv?: RealMvPreview;
  coverPreviewUrl?: string;
  rootKind: ImportFileRootKind;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  quickHash: string | null;
  probeStatus: ProbeStatus;
  probePayload: Record<string, unknown>;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportCandidate {
  id: string;
  status: ImportCandidateStatus;
  title: string;
  normalizedTitle: string;
  titlePinyin: string;
  titleInitials: string;
  artistId: string | null;
  artistName: string;
  language: Language;
  genre: readonly string[];
  tags: readonly string[];
  aliases: readonly string[];
  searchHints: readonly string[];
  releaseYear: number | null;
  canonicalDurationMs: number | null;
  defaultCandidateFileId: string | null;
  sameVersionConfirmed: boolean;
  conflictSongId: string | null;
  reviewNotes: string | null;
  candidateMeta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  files: ImportCandidateFileDetail[];
}

export interface ImportCandidateListResponse {
  candidates: ImportCandidate[];
}

export interface ImportCandidateDetailResponse {
  candidate: ImportCandidate;
}

export interface MetadataUpdateInput {
  title: string;
  artistName: string;
  language: Language;
  defaultVocalMode: VocalMode;
  sameVersionConfirmed: boolean;
  genre: string[];
  tags: string[];
  releaseYear: number | null;
  aliases: string[];
  searchHints: string[];
  files: Array<{
    candidateFileId: string;
    selected: boolean;
    proposedVocalMode: VocalMode;
    proposedAssetKind: AssetKind;
    trackRoles?: TrackRoles;
  }>;
}

export type ConflictResolution =
  | { resolution: "merge_existing"; targetSongId: string }
  | { resolution: "create_version"; versionSuffix: string };
