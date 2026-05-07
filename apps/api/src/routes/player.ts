import type { FastifyInstance, FastifyReply } from "fastify";
import type { PlayerTelemetryKind } from "@home-ktv/player-contracts";
import type { ApiConfig } from "../config.js";
import type { AssetGateway } from "../modules/assets/asset-gateway.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import type { SongRepository } from "../modules/catalog/repositories/song-repository.js";
import { recordHeartbeat } from "../modules/player/heartbeat-service.js";
import type { PlayerDeviceSessionRepository } from "../modules/player/register-player.js";
import { registerPlayer } from "../modules/player/register-player.js";
import { ingestPlayerTelemetry } from "../modules/player/telemetry-service.js";
import { applyReconnectRecovery } from "../modules/playback/apply-reconnect-recovery.js";
import { applySwitchTransition } from "../modules/playback/apply-switch-transition.js";
import { handlePlayerEnded } from "../modules/playback/session-command-service.js";
import type { PlaybackEventRepository } from "../modules/playback/repositories/playback-event-repository.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import type { RoomSessionCommandRepository } from "../modules/playback/repositories/room-session-command-repository.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import type { ControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import type { RoomSnapshotBroadcaster } from "../modules/realtime/room-snapshot-broadcaster.js";
import { buildRoomControlSnapshot } from "../modules/rooms/build-control-snapshot.js";
import { buildRoomSnapshot } from "./room-snapshots.js";

const telemetryKinds = new Set<PlayerTelemetryKind>([
  "loading",
  "playing",
  "ended",
  "failed",
  "switch_failed",
  "recovery_fallback_start_over"
]);

export interface PlayerRouteRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository & {
    updatePlayerPosition: Parameters<typeof recordHeartbeat>[0]["playbackSessions"]["updatePlayerPosition"];
    updatePlaybackFacts: Parameters<typeof ingestPlayerTelemetry>[0]["playbackSessions"]["updatePlaybackFacts"];
  };
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
  songs: SongRepository;
  pairingTokens: RoomPairingTokenRepository;
  deviceSessions: PlayerDeviceSessionRepository;
  playbackEvents: PlaybackEventRepository;
  controlSessions: ControlSessionRepository;
  controlCommands: RoomSessionCommandRepository;
}

export interface PlayerRouteDependencies {
  config: ApiConfig;
  repositories: PlayerRouteRepositories;
  assetGateway: AssetGateway;
  broadcaster?: RoomSnapshotBroadcaster;
}

interface BootstrapBody {
  roomSlug?: string;
  deviceId?: string;
  deviceName?: string;
  appVersion?: string;
  capabilities?: Record<string, boolean | string | number>;
}

interface HeartbeatBody {
  roomSlug?: string;
  deviceId?: string;
  currentQueueEntryId?: string | null;
  playbackPositionMs?: number;
  health?: "ok" | "degraded" | "blocked";
}

interface TelemetryBody {
  roomSlug?: string;
  eventType?: PlayerTelemetryKind;
  deviceId?: string;
  sessionVersion?: number;
  queueEntryId?: string;
  assetId?: string;
  playbackPositionMs?: number;
  vocalMode?: "original" | "instrumental" | "dual" | "unknown";
  switchFamily?: string | null;
  rollbackAssetId?: string | null;
  message?: string;
  errorCode?: string;
  stage?: string;
}

interface SwitchTransitionBody {
  roomSlug?: string;
  playbackPositionMs?: number;
}

interface ReconnectRecoveryBody {
  roomSlug?: string;
  deviceId?: string;
}

export async function registerPlayerRoutes(server: FastifyInstance, dependencies: PlayerRouteDependencies): Promise<void> {
  server.post("/player/bootstrap", async (request, reply) => {
    const body = request.body as BootstrapBody;
    const roomSlug = body.roomSlug ?? dependencies.config.roomSlug;
    const room = await dependencies.repositories.rooms.findBySlug(roomSlug);
    if (!room) {
      await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
      return;
    }

    const result = await registerPlayer({
      room,
      deviceId: requiredString(body.deviceId, "deviceId"),
      deviceName: body.deviceName ?? "TV Player",
      capabilities: body.capabilities ?? {},
      publicBaseUrl: dependencies.config.publicBaseUrl,
      repository: dependencies.repositories.deviceSessions,
      pairingTokens: dependencies.repositories.pairingTokens,
      ...(dependencies.config.controllerBaseUrl ? { controllerBaseUrl: dependencies.config.controllerBaseUrl } : {})
    });
    const snapshot = await buildRoomSnapshot({
      roomSlug,
      config: dependencies.config,
      repositories: dependencies.repositories,
      assetGateway: dependencies.assetGateway,
      conflict: result.conflict
    });

    await reply.send({
      status: result.status,
      deviceSession: result.deviceSession,
      pairing: result.pairing,
      snapshot
    });
  });

  server.post("/player/heartbeat", async (request, reply) => {
    const body = request.body as HeartbeatBody;
    const roomSlug = body.roomSlug ?? dependencies.config.roomSlug;
    const room = await dependencies.repositories.rooms.findBySlug(roomSlug);
    if (!room) {
      await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
      return;
    }

    const result = await recordHeartbeat({
      room,
      deviceId: requiredString(body.deviceId, "deviceId"),
      currentQueueEntryId: body.currentQueueEntryId ?? null,
      playbackPositionMs: body.playbackPositionMs ?? 0,
      health: body.health ?? "ok",
      deviceRepository: dependencies.repositories.deviceSessions,
      playbackSessions: dependencies.repositories.playbackSessions
    });
    const snapshot = await buildRoomSnapshot({
      roomSlug,
      config: dependencies.config,
      repositories: dependencies.repositories,
      assetGateway: dependencies.assetGateway,
      conflict: result.conflict
    });

    if (result.status === "ok") {
      await broadcastControlSnapshot(dependencies, roomSlug);
    }

    await reply.send({ status: result.status, snapshot });
  });

  server.post("/player/telemetry", async (request, reply) => {
    const body = request.body as TelemetryBody;
    const roomSlug = body.roomSlug ?? dependencies.config.roomSlug;
    const room = await dependencies.repositories.rooms.findBySlug(roomSlug);
    if (!room) {
      await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
      return;
    }

    const eventType = body.eventType;
    if (!eventType || !telemetryKinds.has(eventType)) {
      await reply.code(400).send({ code: "INVALID_TELEMETRY_EVENT" });
      return;
    }

    if (eventType === "ended") {
      const result = await handlePlayerEnded({
        roomSlug,
        deviceId: requiredString(body.deviceId, "deviceId"),
        queueEntryId: requiredString(body.queueEntryId, "queueEntryId"),
        assetId: requiredString(body.assetId, "assetId"),
        playbackPositionMs: body.playbackPositionMs ?? 0,
        sessionVersion: body.sessionVersion ?? 0,
        playbackEvents: dependencies.repositories.playbackEvents,
        repositories: dependencies.repositories,
        assetGateway: dependencies.assetGateway,
        config: dependencies.config
      });
      const snapshot = await buildRoomSnapshot({
        roomSlug,
        config: dependencies.config,
        repositories: dependencies.repositories,
        assetGateway: dependencies.assetGateway
      });

      if (result.snapshot) {
        dependencies.broadcaster?.broadcastRoomSnapshot(roomSlug, result.snapshot);
      }

      await reply.send({
        status: result.status === "accepted" ? "ok" : "error",
        snapshot
      });
      return;
    }

    await ingestPlayerTelemetry({
      telemetry: {
        eventType,
        room,
        deviceId: requiredString(body.deviceId, "deviceId"),
        sessionVersion: body.sessionVersion ?? 0,
        queueEntryId: requiredString(body.queueEntryId, "queueEntryId"),
        assetId: requiredString(body.assetId, "assetId"),
        playbackPositionMs: body.playbackPositionMs ?? 0,
        vocalMode: body.vocalMode ?? "unknown",
        switchFamily: body.switchFamily ?? null,
        rollbackAssetId: body.rollbackAssetId ?? null,
        message: body.message,
        errorCode: body.errorCode,
        stage: body.stage
      },
      playbackEvents: dependencies.repositories.playbackEvents,
      playbackSessions: dependencies.repositories.playbackSessions,
      queueEntries: dependencies.repositories.queueEntries
    });
    const snapshot = await buildRoomSnapshot({
      roomSlug,
      config: dependencies.config,
      repositories: dependencies.repositories,
      assetGateway: dependencies.assetGateway,
      notice: noticeFromTelemetry(eventType)
    });

    await broadcastControlSnapshot(dependencies, roomSlug);

    await reply.send({ status: "ok", snapshot });
  });

  server.post("/player/switch-transition", async (request, reply) => {
    const body = request.body as SwitchTransitionBody;
    await reply.send(
      await applySwitchTransition({
        roomSlug: body.roomSlug ?? dependencies.config.roomSlug,
        playbackPositionMs: body.playbackPositionMs,
        repositories: dependencies.repositories,
        assetGateway: dependencies.assetGateway
      })
    );
  });

  server.post("/player/reconnect-recovery", async (request, reply) => {
    const body = request.body as ReconnectRecoveryBody;
    const roomSlug = body.roomSlug ?? dependencies.config.roomSlug;
    const result = await applyReconnectRecovery({
      roomSlug,
      deviceId: requiredString(body.deviceId, "deviceId"),
      repositories: dependencies.repositories,
      assetGateway: dependencies.assetGateway
    });
    const snapshot = await buildRoomSnapshot({
      roomSlug,
      config: dependencies.config,
      repositories: dependencies.repositories,
      assetGateway: dependencies.assetGateway,
      notice: result.notice
    });

    await broadcastControlSnapshot(dependencies, roomSlug);

    await reply.send({ ...result, snapshot });
  });
}

function noticeFromTelemetry(eventType: PlayerTelemetryKind) {
  if (eventType === "switch_failed") {
    return {
      kind: "switch_failed_reverted" as const,
      message: "Vocal mode switch failed and playback returned to the previous version."
    };
  }

  if (eventType === "recovery_fallback_start_over") {
    return {
      kind: "recovery_fallback_start_over" as const,
      message: "Playback restarted this song from the beginning after reconnecting."
    };
  }

  return null;
}

function requiredString(value: string | undefined, fieldName: string): string {
  if (!value) {
    throw new Error(`Missing required field: ${fieldName}`);
  }

  return value;
}

async function broadcastControlSnapshot(dependencies: PlayerRouteDependencies, roomSlug: string): Promise<void> {
  if (!dependencies.broadcaster) {
    return;
  }

  const snapshot = await buildRoomControlSnapshot({
    roomSlug,
    config: dependencies.config,
    repositories: dependencies.repositories,
    assetGateway: dependencies.assetGateway
  });
  if (snapshot) {
    dependencies.broadcaster.broadcastRoomSnapshot(roomSlug, snapshot);
  }
}
