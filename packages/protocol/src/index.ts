import type { RoomId } from "@home-ktv/domain";

export const playerCommandNames = {
  bootstrap: "player.bootstrap",
  heartbeat: "player.heartbeat"
} as const;

export const playerTelemetryEventNames = {
  loading: "player.telemetry.loading",
  playing: "player.telemetry.playing",
  ended: "player.telemetry.ended",
  failed: "player.telemetry.failed"
} as const;

export const roomEventNames = {
  snapshotUpdated: "room.snapshot.updated"
} as const;

export const protocolMessageNames = {
  ...playerCommandNames,
  ...playerTelemetryEventNames,
  ...roomEventNames
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
