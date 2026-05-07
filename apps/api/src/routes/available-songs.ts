import type { FastifyInstance } from "fastify";
import type { AssetGateway } from "../modules/assets/asset-gateway.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import type { AdminCatalogSongRepository } from "../modules/catalog/repositories/song-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";

export interface AvailableSongsRouteDependencies {
  rooms: RoomRepository;
  songs: AdminCatalogSongRepository;
  assets: AssetRepository;
  assetGateway: AssetGateway;
}

export async function registerAvailableSongsRoutes(
  server: FastifyInstance,
  dependencies: AvailableSongsRouteDependencies
): Promise<void> {
  server.get<{ Params: { roomSlug: string } }>("/rooms/:roomSlug/available-songs", async (request, reply) => {
    const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
    if (!room) {
      await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
      return;
    }

    const records = await dependencies.songs.listFormalSongs({ status: "ready" });
    const songs = [];

    for (const record of records) {
      const defaultAsset = record.defaultAsset;
      if (!defaultAsset || record.song.status !== "ready" || defaultAsset.status !== "ready") {
        continue;
      }

      const counterparts = await dependencies.assets.findVerifiedSwitchCounterparts(defaultAsset);
      if (counterparts.length === 0) {
        continue;
      }

      songs.push({
        songId: record.song.id,
        title: record.song.title,
        artistName: record.song.artistName,
        language: record.song.language,
        defaultAssetId: defaultAsset.id,
        durationMs: defaultAsset.durationMs
      });
    }

    await reply.send({ songs });
  });
}
