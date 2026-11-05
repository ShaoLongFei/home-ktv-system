import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiConfig } from "../config.js";
import type { MediaGateway } from "../modules/media/media-gateway.js";
import type { ControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import { restoreControlSession } from "../modules/controller/control-session-service.js";
import { restoreControllerAuth } from "../modules/controller/controller-auth-service.js";
import { buildRoomControlSnapshot, type ControlSnapshotRepositories } from "../modules/rooms/build-control-snapshot.js";
import { executeRoomCommand } from "../modules/playback/session-command-service.js";
import type { CommandExecutionResult } from "../modules/playback/session-command-service.js";
import type { RoomSessionCommandRepository } from "../modules/playback/repositories/room-session-command-repository.js";
import type { RoomSnapshotBroadcaster } from "../modules/realtime/room-snapshot-broadcaster.js";
import type { ControllerAuthRepository } from "../modules/controller/repositories/controller-auth-repository.js";

export interface ControlCommandsRouteRepositories extends ControlSnapshotRepositories {
  controlSessions: ControlSessionRepository;
  controllerAuth: ControllerAuthRepository;
  controlCommands: RoomSessionCommandRepository;
}

export interface ControlCommandsRouteDependencies {
  config: ApiConfig;
  repositories: ControlCommandsRouteRepositories;
  mediaGateway?: Pick<MediaGateway, "createPlaybackUrl">;
  broadcaster?: RoomSnapshotBroadcaster;
}

interface BaseCommandBody {
  commandId?: string;
  sessionVersion?: number;
  deviceId?: string;
}

interface AddQueueEntryBody extends BaseCommandBody {
  sourceType?: "nas" | "online";
  songId?: string;
  assetId?: string;
}

interface QueueEntryBody extends BaseCommandBody {
  queueEntryId?: string;
}

interface SkipCurrentBody extends BaseCommandBody {
  confirmSkip?: boolean;
}

interface SwitchVocalModeBody extends BaseCommandBody {
  playbackPositionMs?: number;
}

interface SetVolumeBody extends BaseCommandBody {
  volumePercent?: number;
}

type CommandType = Parameters<typeof executeRoomCommand>[0]["type"];

export async function registerControlCommandRoutes(
  server: FastifyInstance,
  dependencies: ControlCommandsRouteDependencies
): Promise<void> {
  server.post<{ Params: { roomSlug: string }; Body: AddQueueEntryBody }>(
    "/rooms/:roomSlug/commands/add-queue-entry",
    async (request, reply) => {
      const indexedAssetId = (request.body as Record<string, unknown>).indexedAssetId;
      if (hasText(indexedAssetId)) {
        await reply.code(400).send({ code: "INVALID_QUEUE_SOURCE", message: "点歌来源无效" });
        return;
      }

      await handleCommand(request, reply, dependencies, "add-queue-entry", {
        sourceType: request.body.sourceType,
        songId: request.body.songId,
        assetId: request.body.assetId
      });
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: QueueEntryBody }>(
    "/rooms/:roomSlug/commands/delete-queue-entry",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "delete-queue-entry", {
        queueEntryId: request.body.queueEntryId
      });
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: QueueEntryBody }>(
    "/rooms/:roomSlug/commands/undo-delete-queue-entry",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "undo-delete-queue-entry", {
        queueEntryId: request.body.queueEntryId
      });
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: QueueEntryBody }>(
    "/rooms/:roomSlug/commands/promote-queue-entry",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "promote-queue-entry", {
        queueEntryId: request.body.queueEntryId
      });
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: BaseCommandBody }>(
    "/rooms/:roomSlug/commands/shuffle-queue",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "shuffle-queue", {});
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: SkipCurrentBody }>(
    "/rooms/:roomSlug/commands/skip-current",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "skip-current", {
        confirmSkip: request.body.confirmSkip === true
      });
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: SwitchVocalModeBody }>(
    "/rooms/:roomSlug/commands/switch-vocal-mode",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "switch-vocal-mode", {
        playbackPositionMs: request.body.playbackPositionMs
      });
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: BaseCommandBody }>(
    "/rooms/:roomSlug/commands/replay-current",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "replay-current", {});
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: BaseCommandBody }>(
    "/rooms/:roomSlug/commands/toggle-pause",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "toggle-pause", {});
    }
  );

  server.post<{ Params: { roomSlug: string }; Body: SetVolumeBody }>(
    "/rooms/:roomSlug/commands/set-volume",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "set-volume", {
        volumePercent: request.body.volumePercent
      });
    }
  );
}

async function handleCommand(
  request: FastifyRequest<{ Params: { roomSlug: string }; Body: BaseCommandBody }>,
  reply: FastifyReply,
  dependencies: ControlCommandsRouteDependencies,
  type: CommandType,
  payload: Record<string, unknown>
): Promise<void> {
  const room = await dependencies.repositories.rooms.findBySlug(request.params.roomSlug);
  if (!room) {
    await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
    return;
  }

  const controlSession = await restoreControlSession({
    room,
    cookieHeader: request.headers.cookie,
    deviceId: requiredString(request.body.deviceId, "deviceId"),
    controlSessions: dependencies.repositories.controlSessions
  });
  if (!controlSession) {
    await reply.code(401).send({ code: "CONTROL_SESSION_REQUIRED" });
    return;
  }
  const controllerUser = await restoreControllerAuth({
    cookieHeader: request.headers.cookie,
    repository: dependencies.repositories.controllerAuth
  });
  if (!controllerUser) {
    await reply.code(401).send({ code: "AUTH_REQUIRED", message: null });
    return;
  }

  const result = await executeRoomCommand({
    commandId: requiredString(request.body.commandId, "commandId"),
    roomSlug: request.params.roomSlug,
    sessionVersion: requiredNumber(request.body.sessionVersion, "sessionVersion"),
    type,
    payload,
    controlSession,
    controllerUser,
    repositories: dependencies.repositories,
    ...(dependencies.mediaGateway ? { mediaGateway: dependencies.mediaGateway } : {}),
    config: dependencies.config
  });

  await sendCommandResult(request.params.roomSlug, reply, dependencies, result);
}

async function sendCommandResult(
  roomSlug: string,
  reply: FastifyReply,
  dependencies: Pick<ControlCommandsRouteDependencies, "broadcaster">,
  result: CommandExecutionResult
): Promise<void> {
  if (result.status === "accepted") {
    if (result.controlSessionCookie) {
      reply.header("Set-Cookie", result.controlSessionCookie);
    }
    dependencies.broadcaster?.broadcastRoomSnapshot(roomSlug, result.snapshot);
    await reply.send({
      status: result.status,
      commandId: result.commandId,
      sessionVersion: result.sessionVersion,
      snapshot: result.snapshot,
      ...(result.undo ? { undo: result.undo } : {})
    });
    return;
  }

  if (result.status === "duplicate") {
    await reply.send(result);
    return;
  }

  if (result.status === "conflict") {
    await reply.code(409).send({
      code: result.code,
      latestSessionVersion: result.latestSessionVersion,
      snapshot: result.snapshot
    });
    return;
  }

  await reply.code(result.code === "CONTROL_SESSION_REQUIRED" ? 401 : 400).send({
    code: result.code,
    message: result.message ?? null
  });
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function requiredNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}
