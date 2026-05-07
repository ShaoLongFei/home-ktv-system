import type { FastifyInstance } from "fastify";
import type { ControlSession } from "@home-ktv/domain";
import type { ApiConfig } from "../config.js";
import type { AssetGateway } from "../modules/assets/asset-gateway.js";
import { restoreControlSession, touchControlSession } from "../modules/controller/control-session-service.js";
import type { ControlSnapshotRepositories } from "../modules/rooms/build-control-snapshot.js";
import { buildRoomControlSnapshot } from "../modules/rooms/build-control-snapshot.js";
import type {
  RoomSnapshotBroadcaster,
  RoomSnapshotConnection
} from "../modules/realtime/room-snapshot-broadcaster.js";

export const MOBILE_REALTIME_RENEW_INTERVAL_MS = 60 * 1000;
const PING_INTERVAL_MS = 30 * 1000;

interface RealtimeRouteDependencies {
  config: ApiConfig;
  repositories: ControlSnapshotRepositories;
  assetGateway: AssetGateway;
  broadcaster: RoomSnapshotBroadcaster;
}

interface RealtimeQuerystring {
  deviceId?: string;
  client?: "mobile" | "tv" | "admin";
}

export async function registerRealtimeRoutes(
  server: FastifyInstance,
  dependencies: RealtimeRouteDependencies
): Promise<void> {
  server.get<{ Params: { roomSlug: string }; Querystring: RealtimeQuerystring }>(
    "/rooms/:roomSlug/realtime",
    { websocket: true },
    async (connection, request) => {
      const socket = connection as RoomSnapshotConnection;
      const room = await dependencies.repositories.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        socket.close(1008, "ROOM_NOT_FOUND");
        return;
      }

      const client = request.query.client;
      if (client !== "mobile" && client !== "tv" && client !== "admin") {
        socket.close(1008, "INVALID_CLIENT");
        return;
      }

      const deviceId = request.query.deviceId;
      if (typeof deviceId !== "string" || deviceId.trim() === "") {
        socket.close(1008, "INVALID_DEVICE_ID");
        return;
      }

      let mobileSessionId: string | null = null;
      if (client === "mobile") {
        const controlSession = await restoreControlSession({
          room,
          cookieHeader: request.headers.cookie,
          deviceId,
          controlSessions: dependencies.repositories.controlSessions
        });
        if (!controlSession) {
          socket.close(1008, "CONTROL_SESSION_REQUIRED");
          return;
        }

        mobileSessionId = controlSession.id;
        await touchControlSession({
          session: { id: controlSession.id } as ControlSession,
          controlSessions: dependencies.repositories.controlSessions
        });
      }

      const snapshot = await buildRoomControlSnapshot({
        roomSlug: room.slug,
        config: dependencies.config,
        repositories: dependencies.repositories,
        assetGateway: dependencies.assetGateway
      });
      if (!snapshot) {
        socket.close(1008, "ROOM_NOT_FOUND");
        return;
      }

      dependencies.broadcaster.subscribe(room.slug, socket);

      let pingTimer: ReturnType<typeof setInterval> | null = null;
      let renewTimer: ReturnType<typeof setInterval> | null = null;
      const cleanup = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
        }
        if (renewTimer) {
          clearInterval(renewTimer);
        }
        dependencies.broadcaster.unsubscribe(room.slug, socket);
      };

      socket.on("close", cleanup);
      try {
        socket.send(JSON.stringify(toEnvelope(snapshot)));
      } catch {
        cleanup();
        return;
      }

      if (mobileSessionId) {
        renewTimer = setInterval(() => {
          void renewMobileSession({
            sessionId: mobileSessionId,
            connection: socket,
            controlSessions: dependencies.repositories.controlSessions
          });
        }, MOBILE_REALTIME_RENEW_INTERVAL_MS);
      }

      pingTimer = setInterval(() => {
        try {
          socket.send(JSON.stringify({ type: "ping", timestamp: new Date().toISOString() }));
        } catch {
          socket.close(1011, "PING_SEND_FAILED");
        }
      }, PING_INTERVAL_MS);
    }
  );
}

function toEnvelope(snapshot: NonNullable<Awaited<ReturnType<typeof buildRoomControlSnapshot>>>) {
  return {
    type: "room.control.snapshot.updated" as const,
    roomId: snapshot.roomId,
    version: snapshot.sessionVersion,
    timestamp: snapshot.generatedAt,
    payload: snapshot
  };
}

async function renewMobileSession(input: {
  sessionId: string;
  connection: RoomSnapshotConnection;
  controlSessions: ControlSnapshotRepositories["controlSessions"];
}): Promise<void> {
  const touched = await touchControlSession({
    session: { id: input.sessionId } as ControlSession,
    controlSessions: input.controlSessions
  });
  if (!touched) {
    input.connection.close(1008, "CONTROL_SESSION_REQUIRED");
  }
}
