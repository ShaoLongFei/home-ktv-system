import type { FastifyInstance } from "fastify";
import type { ApiConfig } from "../config.js";
import { buildRoomControlSnapshot } from "../modules/rooms/build-control-snapshot.js";
import {
  createControlSession,
  restoreControlSession,
  serializeControlSessionCookie
} from "../modules/controller/control-session-service.js";
import type { ControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import type { RoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import type { AssetGateway } from "../modules/assets/asset-gateway.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import type { SongRepository } from "../modules/catalog/repositories/song-repository.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { PlayerDeviceSessionRepository } from "../modules/player/register-player.js";

export interface ControlSessionRouteRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
  songs: SongRepository;
  pairingTokens: RoomPairingTokenRepository;
  controlSessions: ControlSessionRepository;
  deviceSessions: PlayerDeviceSessionRepository;
}

export interface ControlSessionRouteDependencies {
  config: ApiConfig;
  repositories: ControlSessionRouteRepositories;
  assetGateway: AssetGateway;
}

interface ControlSessionsBody {
  pairingToken?: string;
  deviceId?: string;
  deviceName?: string;
}

export async function registerControlSessionRoutes(
  server: FastifyInstance,
  dependencies: ControlSessionRouteDependencies
): Promise<void> {
  server.post<{ Params: { roomSlug: string }; Body: ControlSessionsBody }>(
    "/rooms/:roomSlug/control-sessions",
    async (request, reply) => {
      const body = request.body as ControlSessionsBody;
      const room = await dependencies.repositories.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      try {
        const controlSession = await createControlSession({
          room,
          pairingToken: requiredString(body.pairingToken, "pairingToken"),
          deviceId: requiredString(body.deviceId, "deviceId"),
          deviceName: body.deviceName ?? "Mobile Controller",
          pairingTokens: dependencies.repositories.pairingTokens,
          controlSessions: dependencies.repositories.controlSessions
        });
        const snapshot = await buildRoomControlSnapshot({
          roomSlug: room.slug,
          config: dependencies.config,
          repositories: dependencies.repositories,
          assetGateway: dependencies.assetGateway
        });

        reply.header("Set-Cookie", serializeControlSessionCookie({ session: { id: controlSession.id } }));
        await reply.send({ controlSession, snapshot });
      } catch (error) {
        if (error instanceof Error && error.message === "INVALID_PAIRING_TOKEN") {
          await reply.code(401).send({ code: "INVALID_PAIRING_TOKEN" });
          return;
        }

        throw error;
      }
    }
  );

  server.get<{ Params: { roomSlug: string }; Querystring: { deviceId: string } }>(
    "/rooms/:roomSlug/control-session",
    async (request, reply) => {
      const room = await dependencies.repositories.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const controlSession = await restoreControlSession({
        room,
        cookieHeader: request.headers.cookie,
        deviceId: requiredString(request.query.deviceId, "deviceId"),
        controlSessions: dependencies.repositories.controlSessions
      });
      if (!controlSession) {
        await reply.code(401).send({ code: "CONTROL_SESSION_REQUIRED" });
        return;
      }

      const snapshot = await buildRoomControlSnapshot({
        roomSlug: room.slug,
        config: dependencies.config,
        repositories: dependencies.repositories,
        assetGateway: dependencies.assetGateway
      });

      reply.header("Set-Cookie", serializeControlSessionCookie({ session: { id: controlSession.id } }));
      await reply.send({ controlSession, snapshot });
    }
  );
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${name}`);
  }

  return value;
}
