export type EntityId = string;
export type RoomId = EntityId;
export type SongId = EntityId;
export type AssetId = EntityId;
export type QueueEntryId = EntityId;
export type DeviceSessionId = EntityId;
export type PlaybackEventId = EntityId;
export type ControlSessionId = EntityId;
export type ControlCommandId = EntityId;
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
export type QueueEntryStatus =
  | "queued"
  | "preparing"
  | "loading"
  | "playing"
  | "played"
  | "skipped"
  | "failed"
  | "removed";
export type ControlCommandType =
  | "add-queue-entry"
  | "delete-queue-entry"
  | "undo-delete-queue-entry"
  | "promote-queue-entry"
  | "skip-current"
  | "switch-vocal-mode"
  | "player-ended";
export type ControlCommandResultStatus = "accepted" | "duplicate" | "conflict" | "rejected";
export type ImportScanRunId = EntityId;
export type ImportFileId = EntityId;
export type ImportCandidateId = EntityId;
export type ImportCandidateFileId = EntityId;
export type SourceRecordId = EntityId;
export type OnlineCandidateTaskId = EntityId;
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
export const onlineCandidateTaskStates = [
  "discovered",
  "selected",
  "review_required",
  "fetching",
  "fetched",
  "ready",
  "failed",
  "stale",
  "promoted",
  "purged"
] as const;
export type OnlineCandidateTaskState = (typeof onlineCandidateTaskStates)[number];
export type OnlineCandidateType = "mv" | "karaoke" | "audio" | "unknown";
export type OnlineCandidateRiskLabel = "normal" | "risky" | "blocked";
export type OnlineCandidateReliabilityLabel = "high" | "medium" | "low" | "unknown";

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

export type SongSearchMatchReason =
  | "title"
  | "artist"
  | "normalized_title"
  | "alias"
  | "pinyin"
  | "initials"
  | "search_hint"
  | "default";
export type SongSearchQueueState = "not_queued" | "queued";

export interface SongSearchVersionOption {
  assetId: AssetId;
  displayName: string;
  sourceType: AssetSourceType;
  sourceLabel: string;
  durationMs: number;
  qualityLabel: string;
  isRecommended: boolean;
}

export interface SongSearchLocalResult {
  songId: SongId;
  title: string;
  artistName: string;
  language: Language;
  matchReason: SongSearchMatchReason;
  queueState: SongSearchQueueState;
  versions: SongSearchVersionOption[];
}

export interface OnlineCandidateCard {
  provider: string;
  providerCandidateId: string;
  title: string;
  artistName: string;
  sourceLabel: string;
  durationMs: number | null;
  candidateType: OnlineCandidateType;
  reliabilityLabel: OnlineCandidateReliabilityLabel;
  riskLabel: OnlineCandidateRiskLabel;
  taskState: OnlineCandidateTaskState;
  taskId: OnlineCandidateTaskId | null;
}

export interface SongSearchOnlineRequestSupplementEntry {
  visible: boolean;
  label: string;
}

export interface SongSearchOnlineResult {
  status: "disabled" | "available";
  message: string;
  requestSupplement: SongSearchOnlineRequestSupplementEntry;
  candidates: OnlineCandidateCard[];
}

export interface SongSearchResponse {
  query: string;
  local: SongSearchLocalResult[];
  online: SongSearchOnlineResult;
}

export interface OnlineCandidateTask {
  id: OnlineCandidateTaskId;
  roomId: RoomId;
  provider: string;
  providerCandidateId: string;
  title: string;
  artistName: string;
  sourceLabel: string;
  durationMs: number | null;
  candidateType: OnlineCandidateType;
  reliabilityLabel: OnlineCandidateReliabilityLabel;
  riskLabel: OnlineCandidateRiskLabel;
  status: OnlineCandidateTaskState;
  failureReason: string | null;
  recentEvent: Record<string, unknown>;
  providerPayload: Record<string, unknown>;
  readyAssetId: AssetId | null;
  createdAt: string;
  updatedAt: string;
  selectedAt: string | null;
  reviewRequiredAt: string | null;
  fetchingAt: string | null;
  fetchedAt: string | null;
  readyAt: string | null;
  failedAt: string | null;
  staleAt: string | null;
  promotedAt: string | null;
  purgedAt: string | null;
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
  removedAt: string | null;
  removedByControlSessionId: ControlSessionId | null;
  undoExpiresAt: string | null;
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

export interface RoomPairingToken {
  roomId: RoomId;
  tokenValue: string;
  tokenHash: string;
  tokenExpiresAt: string;
  rotatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ControlSession {
  id: ControlSessionId;
  roomId: RoomId;
  deviceId: string;
  deviceName: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
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
