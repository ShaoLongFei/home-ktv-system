export type EntityId = string;
export type RoomId = EntityId;
export type SongId = EntityId;
export type AssetId = EntityId;
export type QueueEntryId = EntityId;
export type DeviceSessionId = EntityId;
export type PlaybackEventId = EntityId;
export type SwitchFamily = string;

export const switchFamily = {
  none: null,
  main: "main"
} as const satisfies Record<string, SwitchFamily | null>;

export type Language = "mandarin" | "cantonese" | "other";
export type SongStatus = "ready" | "review_required" | "unavailable";
export type VocalMode = "original" | "instrumental" | "dual" | "unknown";
export type LyricMode = "hard_sub" | "soft_sub" | "external_lrc" | "none";
export type LyricQuality = "verified" | "usable" | "poor" | "unknown";
export type AssetStatus = "ready" | "caching" | "failed" | "unavailable" | "stale" | "promoted";
export type AssetSourceType = "local" | "online_cached" | "online_ephemeral";
export type AssetKind = "video" | "audio+lyrics" | "dual-track-video";
export type PlayerState = "idle" | "preparing" | "loading" | "playing" | "paused" | "recovering" | "error";
export type DeviceType = "tv" | "mobile";
export type SwitchQualityStatus = "verified" | "review_required" | "rejected" | "unknown";
export type RoomStatus = "active" | "inactive" | "maintenance";
export type QueueEntryStatus = "queued" | "preparing" | "loading" | "playing" | "played" | "skipped" | "failed";
export type ImportScanRunId = EntityId;
export type ImportFileId = EntityId;
export type ImportCandidateId = EntityId;
export type ImportCandidateFileId = EntityId;
export type SourceRecordId = EntityId;
export type ImportScanTrigger = "manual" | "scheduled" | "watcher";
export type ImportScanStatus = "queued" | "running" | "completed" | "failed";
export type ImportScanScope = "imports" | "songs" | "all";
export type ImportFileRootKind = "imports_pending" | "imports_needs_review" | "songs";
export type ImportFileProbeStatus = "pending" | "probed" | "failed" | "skipped" | "deleted";
export type ImportCandidateStatus =
  | "pending"
  | "held"
  | "review_required"
  | "conflict"
  | "approved"
  | "rejected_deleted"
  | "approval_failed";

export interface SongCapabilities {
  canSwitchVocalMode: boolean;
}

export interface Song {
  id: SongId;
  title: string;
  normalizedTitle: string;
  titlePinyin: string;
  titleInitials: string;
  artistId: EntityId;
  artistName: string;
  language: Language;
  status: SongStatus;
  genre: readonly string[];
  tags: readonly string[];
  aliases: readonly string[];
  searchHints: readonly string[];
  releaseYear: number | null;
  canonicalDurationMs: number | null;
  searchWeight: number;
  defaultAssetId: AssetId | null;
  capabilities: SongCapabilities;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: AssetId;
  songId: SongId;
  sourceType: AssetSourceType;
  assetKind: AssetKind;
  displayName: string;
  filePath: string;
  durationMs: number;
  lyricMode: LyricMode;
  vocalMode: VocalMode;
  status: AssetStatus;
  switchFamily: SwitchFamily | null;
  switchQualityStatus: SwitchQualityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: RoomId;
  slug: string;
  name: string;
  status: RoomStatus;
  defaultPlayerDeviceId: DeviceSessionId | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackOptions {
  preferredVocalMode: VocalMode | null;
  pitchSemitones: number;
  requireReadyAsset: boolean;
}

export interface QueueEntry {
  id: QueueEntryId;
  roomId: RoomId;
  songId: SongId;
  assetId: AssetId;
  requestedBy: string;
  queuePosition: number;
  status: QueueEntryStatus;
  priority: number;
  playbackOptions: PlaybackOptions;
  requestedAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface PlaybackSession {
  roomId: RoomId;
  currentQueueEntryId: QueueEntryId | null;
  nextQueueEntryId: QueueEntryId | null;
  activeAssetId: AssetId | null;
  targetVocalMode: VocalMode;
  playerState: PlayerState;
  playerPositionMs: number;
  mediaStartedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface DeviceSession {
  id: DeviceSessionId;
  roomId: RoomId;
  deviceType: DeviceType;
  deviceName: string;
  lastSeenAt: string | null;
  capabilities: Record<string, boolean | string | number>;
  pairingToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: PlaybackEventId;
  roomId: RoomId;
  queueEntryId: QueueEntryId | null;
  eventType: string;
  eventPayload: TPayload;
  createdAt: string;
}

export interface ImportScanRun {
  id: ImportScanRunId;
  trigger: ImportScanTrigger;
  status: ImportScanStatus;
  scope: ImportScanScope;
  filesSeen: number;
  filesAdded: number;
  filesChanged: number;
  filesDeleted: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportFile {
  id: ImportFileId;
  lastSeenScanRunId: ImportScanRunId | null;
  rootKind: ImportFileRootKind;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  quickHash: string | null;
  probeStatus: ImportFileProbeStatus;
  probePayload: Record<string, unknown>;
  durationMs: number | null;
  lastScannedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportCandidate {
  id: ImportCandidateId;
  status: ImportCandidateStatus;
  title: string;
  normalizedTitle: string;
  titlePinyin: string;
  titleInitials: string;
  artistId: EntityId | null;
  artistName: string;
  language: Language;
  genre: readonly string[];
  tags: readonly string[];
  aliases: readonly string[];
  searchHints: readonly string[];
  releaseYear: number | null;
  canonicalDurationMs: number | null;
  defaultCandidateFileId: ImportCandidateFileId | null;
  sameVersionConfirmed: boolean;
  conflictSongId: SongId | null;
  reviewNotes: string | null;
  candidateMeta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ImportCandidateFile {
  id: ImportCandidateFileId;
  candidateId: ImportCandidateId;
  importFileId: ImportFileId;
  selected: boolean;
  proposedVocalMode: VocalMode | null;
  proposedAssetKind: AssetKind | null;
  roleConfidence: number | null;
  probeDurationMs: number | null;
  probeSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ImportCandidateFileDetail extends ImportCandidateFile {
  rootKind: ImportFileRootKind;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  quickHash: string | null;
  probeStatus: ImportFileProbeStatus;
  probePayload: Record<string, unknown>;
  durationMs: number | null;
  fileCreatedAt: string;
  fileUpdatedAt: string;
}

export interface SourceRecord {
  id: SourceRecordId;
  assetId: AssetId;
  provider: string;
  providerItemId: string | null;
  sourceUri: string | null;
  importFileId: ImportFileId | null;
  rawMeta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
