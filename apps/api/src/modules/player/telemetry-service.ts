import type { AssetId, PlaybackEvent, PlaybackSession, PlayerState, QueueEntryId, Room, VocalMode } from "@home-ktv/domain";
import type { PlayerTelemetryKind } from "@home-ktv/player-contracts";
import type { PlaybackEventRepository } from "../playback/repositories/playback-event-repository.js";

export interface TelemetryPlaybackSessionRepository {
  updatePlaybackFacts(input: {
    roomId: string;
    queueEntryId: QueueEntryId;
    activeAssetId: AssetId | null;
    playerState: PlayerState;
    playerPositionMs: number;
    targetVocalMode?: VocalMode;
  }): Promise<PlaybackSession | null>;
}

export interface PlayerTelemetryInput {
  eventType: PlayerTelemetryKind;
  room: Room;
  deviceId: string;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  assetId: AssetId;
  playbackPositionMs: number;
  vocalMode: VocalMode;
  switchFamily: string | null;
  rollbackAssetId: AssetId | null;
  message?: string | undefined;
  errorCode?: string | undefined;
  stage?: string | undefined;
  emittedAt?: string | undefined;
}

export interface IngestTelemetryInput {
  telemetry: PlayerTelemetryInput;
  playbackEvents: PlaybackEventRepository;
  playbackSessions: TelemetryPlaybackSessionRepository;
}

export interface IngestTelemetryResult {
  event: PlaybackEvent;
  session: PlaybackSession | null;
}

export async function ingestPlayerTelemetry(input: IngestTelemetryInput): Promise<IngestTelemetryResult> {
  const telemetry = input.telemetry;
  const event = await input.playbackEvents.append({
    roomId: telemetry.room.id,
    queueEntryId: telemetry.queueEntryId,
    eventType: telemetry.eventType,
    eventPayload: {
      deviceId: telemetry.deviceId,
      sessionVersion: telemetry.sessionVersion,
      assetId: telemetry.assetId,
      playbackPositionMs: telemetry.playbackPositionMs,
      vocalMode: telemetry.vocalMode,
      switchFamily: telemetry.switchFamily,
      rollbackAssetId: telemetry.rollbackAssetId,
      message: telemetry.message ?? null,
      errorCode: telemetry.errorCode ?? null,
      stage: telemetry.stage ?? null,
      emittedAt: telemetry.emittedAt ?? new Date().toISOString()
    }
  });

  const session = await input.playbackSessions.updatePlaybackFacts({
    roomId: telemetry.room.id,
    queueEntryId: telemetry.queueEntryId,
    activeAssetId: activeAssetForTelemetry(telemetry),
    playerState: playerStateForTelemetry(telemetry.eventType),
    playerPositionMs: positionForTelemetry(telemetry),
    targetVocalMode: telemetry.vocalMode
  });

  return { event, session };
}

function activeAssetForTelemetry(telemetry: PlayerTelemetryInput): AssetId | null {
  if (telemetry.eventType === "switch_failed") {
    return telemetry.rollbackAssetId ?? telemetry.assetId;
  }

  return telemetry.assetId;
}

function positionForTelemetry(telemetry: PlayerTelemetryInput): number {
  if (telemetry.eventType === "recovery_fallback_start_over") {
    return 0;
  }

  return Math.max(0, Math.trunc(telemetry.playbackPositionMs));
}

function playerStateForTelemetry(eventType: PlayerTelemetryKind): PlayerState {
  switch (eventType) {
    case "loading":
      return "loading";
    case "failed":
      return "error";
    case "ended":
      return "idle";
    case "recovery_fallback_start_over":
    case "playing":
    case "switch_failed":
      return "playing";
  }

  const exhaustive: never = eventType;
  return exhaustive;
}
