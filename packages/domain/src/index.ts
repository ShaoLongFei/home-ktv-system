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
