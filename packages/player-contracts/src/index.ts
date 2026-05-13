import type {
  AssetId,
  ControlSessionId,
  QueueEntryId,
  QueueEntryStatus,
  PlaybackProfile,
  RoomId,
  SongId,
  SwitchFamily,
  TrackRef,
  VocalMode
} from "@home-ktv/domain";
import type { PlayerTelemetryEventName } from "@home-ktv/protocol";

export interface QueueEntryPreview {
  queueEntryId: QueueEntryId;
  songTitle: string;
  artistName: string;
}

export interface PlaybackTarget {
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
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
  expiresAt: string;
  lastSeenAt: string;
}

export interface TvPresence {
  online: boolean;
  deviceName: string | null;
  lastSeenAt: string | null;
  conflict: PlayerConflictState | null;
}

export interface ControllerPresenceSummary {
  onlineCount: number;
}

export interface RoomQueueEntryPreview {
  queueEntryId: QueueEntryId;
  songId: SongId;
  assetId: AssetId;
  songTitle: string;
  artistName: string;
  requestedBy: string;
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

export type RoomSnapshotState = "idle" | "loading" | "playing" | "recovering" | "conflict" | "error";

export interface RoomSnapshot {
  type: "room.snapshot";
  roomId: RoomId;
  roomSlug: string;
  sessionVersion: number;
  state: RoomSnapshotState;
  pairing: PairingInfo;
  currentTarget: PlaybackTarget | null;
  switchTarget: SwitchTarget | null;
  targetVocalMode?: VocalMode | null;
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
  pairing: PairingInfo;
  tvPresence: TvPresence;
  controllers: ControllerPresenceSummary;
  currentTarget: PlaybackTarget | null;
  switchTarget: SwitchTarget | null;
  targetVocalMode?: VocalMode | null;
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
