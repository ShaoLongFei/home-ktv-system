import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiConfig } from "../config.js";
import type { AssetGateway } from "../modules/assets/asset-gateway.js";
import type { ControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import { restoreControlSession, serializeControlSessionCookie } from "../modules/controller/control-session-service.js";
import type { CandidateTaskService } from "../modules/online/candidate-task-service.js";
import { buildRoomControlSnapshot, type ControlSnapshotRepositories } from "../modules/rooms/build-control-snapshot.js";
import { executeRoomCommand } from "../modules/playback/session-command-service.js";
import type { RoomSessionCommandRepository } from "../modules/playback/repositories/room-session-command-repository.js";
import type { RoomSnapshotBroadcaster } from "../modules/realtime/room-snapshot-broadcaster.js";

export interface ControlCommandsRouteRepositories extends ControlSnapshotRepositories {
  controlSessions: ControlSessionRepository;
  controlCommands: RoomSessionCommandRepository;
}

export interface ControlCommandsRouteDependencies {
  config: ApiConfig;
  repositories: ControlCommandsRouteRepositories;
  assetGateway: AssetGateway;
  broadcaster?: RoomSnapshotBroadcaster;
  online?: Pick<CandidateTaskService, "listActiveForRoom" | "requestSupplement">;
}

interface BaseCommandBody {
  commandId?: string;
  sessionVersion?: number;
  deviceId?: string;
}

interface AddQueueEntryBody extends BaseCommandBody {
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

interface RequestSupplementBody extends BaseCommandBody {
  provider?: string;
  providerCandidateId?: string;
}

type CommandType = Parameters<typeof executeRoomCommand>[0]["type"];

export async function registerControlCommandRoutes(
  server: FastifyInstance,
  dependencies: ControlCommandsRouteDependencies
): Promise<void> {
  server.post<{ Params: { roomSlug: string }; Body: AddQueueEntryBody }>(
    "/rooms/:roomSlug/commands/add-queue-entry",
    async (request, reply) => {
      await handleCommand(request, reply, dependencies, "add-queue-entry", {
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

  server.post<{ Params: { roomSlug: string }; Body: RequestSupplementBody }>(
    "/rooms/:roomSlug/commands/request-supplement",
    async (request, reply) => {
      await handleRequestSupplement(request, reply, dependencies);
    }
  );
}

async function handleRequestSupplement(
  request: FastifyRequest<{ Params: { roomSlug: string }; Body: RequestSupplementBody }>,
  reply: FastifyReply,
  dependencies: ControlCommandsRouteDependencies
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

  const task = await dependencies.online?.requestSupplement({
    roomId: room.id,
    provider: requiredString(request.body.provider, "provider"),
    providerCandidateId: requiredString(request.body.providerCandidateId, "providerCandidateId")
  });
  if (!task) {
    await reply.code(404).send({ code: "ONLINE_CANDIDATE_NOT_FOUND" });
    return;
  }

  if (dependencies.broadcaster) {
    const snapshot = await buildRoomControlSnapshot({
      roomSlug: room.slug,
      config: dependencies.config,
      repositories: {
        ...dependencies.repositories,
        ...(dependencies.online ? { onlineTasks: dependencies.online } : {})
      },
      assetGateway: dependencies.assetGateway
    });
    if (snapshot) {
      dependencies.broadcaster.broadcastRoomSnapshot(room.slug, snapshot);
    }
  }

  reply.header("Set-Cookie", serializeControlSessionCookie({ session: { id: controlSession.id } }));
  await reply.send({
    status: "accepted",
    commandId: requiredString(request.body.commandId, "commandId"),
    sessionVersion: requiredNumber(request.body.sessionVersion, "sessionVersion"),
    task
  });
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

  const result = await executeRoomCommand({
    commandId: requiredString(request.body.commandId, "commandId"),
    roomSlug: request.params.roomSlug,
    sessionVersion: requiredNumber(request.body.sessionVersion, "sessionVersion"),
    type,
    payload,
    controlSession,
    repositories: dependencies.repositories,
    assetGateway: dependencies.assetGateway,
    config: dependencies.config
  });

  if (result.status === "accepted") {
    if (result.controlSessionCookie) {
      reply.header("Set-Cookie", result.controlSessionCookie);
    }
    dependencies.broadcaster?.broadcastRoomSnapshot(request.params.roomSlug, result.snapshot);
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

  await reply.code(400).send({
    code: result.code,
    message: result.message ?? null
  });
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
