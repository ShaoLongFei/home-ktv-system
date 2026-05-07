import type { FastifyInstance } from "fastify";
import type { SongSearchResponse } from "@home-ktv/domain";
import type { AdminCatalogSongRepository } from "../modules/catalog/repositories/song-repository.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";

export interface SongSearchRouteDependencies {
  rooms: RoomRepository;
  songs: AdminCatalogSongRepository;
  queueEntries: QueueEntryRepository;
}

interface SongSearchQuery {
  q?: string;
  limit?: string | number;
}

export async function registerSongSearchRoutes(
  server: FastifyInstance,
  dependencies: SongSearchRouteDependencies
): Promise<void> {
  server.get<{ Params: { roomSlug: string }; Querystring: SongSearchQuery }>(
    "/rooms/:roomSlug/songs/search",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const query = String(request.query.q ?? "");
      const rawLimit = request.query.limit;
      const parsedLimit =
        typeof rawLimit === "number" ? Math.trunc(rawLimit) : Number.parseInt(String(rawLimit ?? ""), 10);
      const limit = Math.min(50, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 30));
      const queue = await dependencies.queueEntries.listEffectiveQueue(room.id);
      const queuedSongIds = queue.map((entry) => entry.songId);
      const records = await dependencies.songs.searchFormalSongs({ query, limit, queuedSongIds });

      const response: SongSearchResponse = {
        query,
        local: records.map((record) => ({
          songId: record.song.id,
          title: record.song.title,
          artistName: record.song.artistName,
          language: record.song.language,
          matchReason: record.matchReason,
          queueState: record.queueState,
          versions: record.versions
        })),
        online: {
          status: "disabled",
          message: "本地未入库，补歌功能后续可用",
          candidates: []
        }
      };

      await reply.send(response);
    }
  );
}
