import type { FastifyInstance } from "fastify";
import type { ApiConfig } from "../config.js";
import { refreshPairingToken } from "../modules/rooms/pairing-token-service.js";
import type { RoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";

export interface AdminRoomsRouteDependencies {
  config: ApiConfig;
  rooms: RoomRepository;
  pairingTokens: RoomPairingTokenRepository;
}

export async function registerAdminRoomsRoutes(
  server: FastifyInstance,
  dependencies: AdminRoomsRouteDependencies
): Promise<void> {
  server.post<{ Params: { roomSlug: string } }>("/admin/rooms/:roomSlug/pairing-token/refresh", async (request, reply) => {
    const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
    if (!room) {
      return reply.code(404).send({ error: "ROOM_NOT_FOUND" });
    }

    const pairing = await refreshPairingToken({
      room,
      publicBaseUrl: dependencies.config.publicBaseUrl,
      repository: dependencies.pairingTokens
    });

    return { pairing };
  });
}
