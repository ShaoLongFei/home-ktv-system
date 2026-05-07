import type { RoomId } from "@home-ktv/domain";

export const playerCommandNames = {
  bootstrap: "player.bootstrap",
  heartbeat: "player.heartbeat"
} as const;

export const playerTelemetryEventNames = {
  loading: "player.telemetry.loading",
  playing: "player.telemetry.playing",
  ended: "player.telemetry.ended",
  failed: "player.telemetry.failed",
  switchFailed: "player.telemetry.switch_failed",
  recoveryFallbackStartOver: "player.telemetry.recovery_fallback_start_over"
} as const;

export const controllerCommandNames = {
  addQueueEntry: "controller.command.add_queue_entry",
  deleteQueueEntry: "controller.command.delete_queue_entry",
  undoDeleteQueueEntry: "controller.command.undo_delete_queue_entry",
  promoteQueueEntry: "controller.command.promote_queue_entry",
  skipCurrent: "controller.command.skip_current",
  switchVocalMode: "controller.command.switch_vocal_mode"
} as const;

export const roomEventNames = {
  snapshotUpdated: "room.snapshot.updated",
  controlSnapshotUpdated: "room.control.snapshot.updated"
} as const;

export const protocolMessageNames = {
  ...playerCommandNames,
  ...playerTelemetryEventNames,
  ...controllerCommandNames,
  ...roomEventNames,
  "player.bootstrap": "player.bootstrap",
  "player.heartbeat": "player.heartbeat",
  "player.telemetry.loading": "player.telemetry.loading",
  "player.telemetry.playing": "player.telemetry.playing",
  "player.telemetry.ended": "player.telemetry.ended",
  "player.telemetry.failed": "player.telemetry.failed",
  "player.telemetry.switch_failed": "player.telemetry.switch_failed",
  "player.telemetry.recovery_fallback_start_over": "player.telemetry.recovery_fallback_start_over",
  "controller.command.add_queue_entry": "controller.command.add_queue_entry",
  "controller.command.delete_queue_entry": "controller.command.delete_queue_entry",
  "controller.command.undo_delete_queue_entry": "controller.command.undo_delete_queue_entry",
  "controller.command.promote_queue_entry": "controller.command.promote_queue_entry",
  "controller.command.skip_current": "controller.command.skip_current",
  "controller.command.switch_vocal_mode": "controller.command.switch_vocal_mode",
  "room.snapshot.updated": "room.snapshot.updated",
  "room.control.snapshot.updated": "room.control.snapshot.updated"
} as const;

export type PlayerCommandName = (typeof playerCommandNames)[keyof typeof playerCommandNames];
export type PlayerTelemetryEventName = (typeof playerTelemetryEventNames)[keyof typeof playerTelemetryEventNames];
export type RoomEventName = (typeof roomEventNames)[keyof typeof roomEventNames];
export type ProtocolMessageName = (typeof protocolMessageNames)[keyof typeof protocolMessageNames];

export interface ProtocolEnvelope<TType extends ProtocolMessageName, TPayload> {
  type: TType;
  roomId: RoomId;
  version: number;
  timestamp: string;
  payload: TPayload;
}

export interface PlayerBootstrapPayload {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  capabilities: Record<string, boolean | string | number>;
}

export interface PlayerHeartbeatPayload {
  deviceId: string;
  currentQueueEntryId: string | null;
  playbackPositionMs: number;
  health: "ok" | "degraded" | "blocked";
}

export interface PlayerTelemetryPayload {
  deviceId: string;
  queueEntryId: string;
  assetId: string;
  playbackPositionMs: number;
}

export interface PlayerFailedPayload extends PlayerTelemetryPayload {
  stage: "load" | "decode" | "network" | "runtime";
  errorCode: "VIDEO_LOAD_ERROR" | "VIDEO_DECODE_ERROR" | "MEDIA_NOT_READY" | "STREAM_URL_UNAVAILABLE";
  message: string;
}
