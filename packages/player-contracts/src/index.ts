import type {
  AssetId,
  ControlSessionId,
  QueueEntryId,
  QueueEntryStatus,
  PlaybackProfile,
  RoomId,
  SongSourceType,
  SongId,
  SwitchFamily,
  TrackRef,
  VocalMode
} from "@home-ktv/domain";
import type { PlayerTelemetryEventName } from "@home-ktv/protocol";

export const DEFAULT_ROOM_VOLUME_PERCENT = 50;

export interface QueueEntryPreview {
  queueEntryId: QueueEntryId;
  songTitle: string;
  artistName: string;
  requestedByUserPhone?: string | null;
  requestedByName?: string | null;
}

export interface PlaybackTarget {
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  sourceType: SongSourceType;
  songId: SongId;
  assetId: AssetId;
  currentQueueEntryPreview: QueueEntryPreview;
  playbackUrl: string;
  resumePositionMs: number;
  vocalMode: VocalMode;
  switchFamily: SwitchFamily | null;
  playbackProfile?: PlaybackProfile;
  selectedTrackRef?: TrackRef | null;
  nextQueueEntryPreview: QueueEntryPreview | null;
}

export interface SwitchTarget {
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  switchKind: "asset" | "audio_track";
  sourceType: SongSourceType;
  fromAssetId: AssetId;
  toAssetId: AssetId;
  playbackUrl: string;
  switchFamily: SwitchFamily;
  vocalMode: VocalMode;
  resumePositionMs: number;
  rollbackAssetId: AssetId;
  playbackProfile?: PlaybackProfile;
  selectedTrackRef?: TrackRef | null;
}

export interface PlayerTelemetryEvent {
  type: PlayerTelemetryEventName;
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  sourceType: SongSourceType;
  assetId: AssetId;
  switchFamily: SwitchFamily | null;
  vocalMode: VocalMode;
  resumePositionMs: number;
  rollbackAssetId: AssetId | null;
  playbackPositionMs: number;
  emittedAt: string;
}

export type PlayerTelemetryKind =
  | "loading"
  | "playing"
  | "ended"
  | "failed"
  | "switch_failed"
  | "recovery_fallback_start_over";

export interface PairingInfo {
  roomSlug: string;
  controllerUrl: string;
  qrPayload: string;
  token: string;
  tokenExpiresAt: string;
}

export interface ControlSessionInfo {
  id: ControlSessionId;
  roomId: RoomId;
  roomSlug: string;
  deviceId: string;
  deviceName: string;
  userPhone?: string | null;
  expiresAt: string;
  lastSeenAt: string;
}

export interface TvPresenceDevice {
  deviceId: string;
  deviceName: string;
  lastSeenAt: string;
}

export interface TvPresence {
  online: boolean;
  deviceName: string | null;
  lastSeenAt: string | null;
  onlineCount: number;
  devices: readonly TvPresenceDevice[];
  conflict: PlayerConflictState | null;
}

export interface ControllerPresenceSummary {
  onlineCount: number;
}

export interface RoomQueueEntryPreview {
  queueEntryId: QueueEntryId;
  sourceType: SongSourceType;
  songId: SongId;
  assetId: AssetId;
  songTitle: string;
  artistName: string;
  requestedBy: string;
  requestedByUserPhone?: string | null;
  requestedByName?: string | null;
  queuePosition: number;
  status: QueueEntryStatus;
  canPromote: boolean;
  canDelete: boolean;
  undoExpiresAt: string | null;
}

export interface PlayerConflictState {
  kind: "active-player-conflict";
  reason: "active-player-exists";
  roomId: RoomId;
  activeDeviceId: string;
  activeDeviceName: string;
  message: string;
}

export type PlaybackNoticeKind =
  | "loading"
  | "recovering"
  | "switch_failed_reverted"
  | "playback_failed_skipped"
  | "recovery_fallback_start_over";

export interface PlaybackNotice {
  kind: PlaybackNoticeKind;
  message: string;
}

export type RoomInteractionKind = "emoji" | "bullet" | "rainbow_praise" | "roast" | "blessing";

export interface RoomInteractionEvent {
  id: string;
  roomId: RoomId;
  roomSlug: string;
  kind: RoomInteractionKind;
  message: string;
  senderDeviceId: string;
  senderName: string;
  createdAt: string;
  expiresAt: string;
}

export interface RoomInteractionEnvelope {
  type: "room.interaction.created";
  roomId: RoomId;
  version: number;
  timestamp: string;
  payload: RoomInteractionEvent;
}

export type RoomSnapshotState = "idle" | "loading" | "playing" | "recovering" | "conflict" | "error";

export interface RoomSnapshot {
  type: "room.snapshot";
  roomId: RoomId;
  roomSlug: string;
  sessionVersion: number;
  state: RoomSnapshotState;
  volumePercent?: number;
  pairing: PairingInfo;
  currentTarget: PlaybackTarget | null;
  switchTarget: SwitchTarget | null;
  targetVocalMode?: VocalMode | null;
  /** 电视端据此暂停/继续。 */
  playbackPaused?: boolean;
  /** 值变化表示要求重唱（seek 0）。 */
  replayToken?: string;
  conflict: PlayerConflictState | null;
  notice: PlaybackNotice | null;
  generatedAt: string;
}

export interface RoomControlSnapshot {
  type: "room.control.snapshot";
  roomId: RoomId;
  roomSlug: string;
  sessionVersion: number;
  state: RoomSnapshotState;
  volumePercent?: number;
  pairing: PairingInfo;
  tvPresence: TvPresence;
  controllers: ControllerPresenceSummary;
  currentTarget: PlaybackTarget | null;
  switchTarget: SwitchTarget | null;
  targetVocalMode?: VocalMode | null;
  playbackPaused?: boolean;
  replayToken?: string;
  queue: readonly RoomQueueEntryPreview[];
  notice: PlaybackNotice | null;
  generatedAt: string;
}

export interface SwitchTransitionResult {
  status: "ready" | "unavailable";
  switchTarget: SwitchTarget | null;
  reason: "SWITCH_TARGET_NOT_AVAILABLE" | null;
}

export interface ReconnectRecoveryResult {
  status: "idle" | "resume_near_position" | "fallback_start_over";
  target: PlaybackTarget | null;
  notice: PlaybackNotice | null;
}
