import type { FastifyInstance } from "fastify";
import type { RoomId } from "@home-ktv/domain";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import type { OnlineImportService } from "../modules/online/online-import-service.js";

export interface OnlineCatalogRouteDependencies {
  rooms: RoomRepository;
  onlineImport: OnlineImportService;
  queueEntries: Pick<QueueEntryRepository, "listEffectiveQueue" | "append">;
}

interface ImportBody {
  songNumber?: unknown;
  title?: unknown;
  artistName?: unknown;
  query?: unknown;
  limit?: unknown;
  requestedBy?: unknown;
  requestedByName?: unknown;
  requestedByUserPhone?: unknown;
  packageType?: unknown;
  packageId?: unknown;
}

interface AssetsQuery {
  limit?: string | number;
}

export async function registerOnlineCatalogRoutes(
  server: FastifyInstance,
  dependencies: OnlineCatalogRouteDependencies
): Promise<void> {
  server.get("/admin/online/sources", async (_request, reply) => {
    await reply.send(await dependencies.onlineImport.status());
  });

  server.get<{ Querystring: AssetsQuery }>("/admin/online/assets", async (request, reply) => {
    const limit = parseLimit(request.query.limit, 50, 200);
    const assets = await dependencies.onlineImport.listAssets(limit);
    await reply.send({ assets });
  });

  server.post<{ Params: { assetId: string } }>("/admin/online/assets/:assetId/evict", async (request, reply) => {
    const asset = await dependencies.onlineImport.evict(request.params.assetId);
    if (!asset) {
      await reply.code(404).send({ code: "ONLINE_ASSET_NOT_FOUND" });
      return;
    }
    await reply.send({
      assetId: asset.id,
      status: asset.status,
      evicted: true
    });
  });

  server.post("/admin/online/prune", async (_request, reply) => {
    const result = await dependencies.onlineImport.pruneExpired();
    await reply.send(result);
  });

  server.get("/admin/online/discovery", async (_request, reply) => {
    try {
      const discovery = await dependencies.onlineImport.discovery();
      await reply.send(discovery);
    } catch (error) {
      await reply.code(502).send({
        code: "ONLINE_DISCOVERY_FAILED",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  server.post<{ Body: ImportBody }>("/admin/online/import", async (request, reply) => {
    const body = request.body ?? {};
    const limit = parseLimit(body.limit, 10, 50);

    const packageId = typeof body.packageId === "string" ? body.packageId.trim() : "";
    if (packageId) {
      const packageType = parseLimit(body.packageType, 3, 10);
      const results = await dependencies.onlineImport.importByPackage({ packageType, packageId, limit });
      await reply.code(202).send({
        queued: results.length,
        items: results.map(toImportResponse)
      });
      return;
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (query) {
      const results = await dependencies.onlineImport.importByQuery(query, limit);
      await reply.code(202).send({
        queued: results.length,
        items: results.map(toImportResponse)
      });
      return;
    }

    const songNumber = typeof body.songNumber === "string" ? body.songNumber.trim() : "";
    if (!songNumber) {
      await reply.code(400).send({ code: "ONLINE_SONG_NUMBER_REQUIRED" });
      return;
    }

    const result = await dependencies.onlineImport.requestImport({
      songNumber,
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.artistName === "string" ? { artistName: body.artistName } : {})
    });
    await reply.code(result.cached ? 200 : 202).send(toImportResponse(result));
  });

  server.post<{ Params: { roomSlug: string }; Body: ImportBody }>(
    "/rooms/:roomSlug/online/import",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const body = request.body ?? {};
      const songNumber = typeof body.songNumber === "string" ? body.songNumber.trim() : "";
      if (!songNumber) {
        await reply.code(400).send({ code: "ONLINE_SONG_NUMBER_REQUIRED" });
        return;
      }

      const result = await dependencies.onlineImport.requestImport({
        songNumber,
        ...(typeof body.title === "string" ? { title: body.title } : {}),
        ...(typeof body.artistName === "string" ? { artistName: body.artistName } : {})
      });
      await reply.code(result.cached ? 200 : 202).send({
        ...toImportResponse(result),
        playbackUrl: result.asset.status === "ready"
          ? `/media/online/${encodeURIComponent(result.asset.id)}`
          : null
      });
    }
  );

  /**
   * 点歌即排队：未缓存的先进入准备，缓存就绪后自动入队。
   * 已缓存时同步入队并返回 queueEntryId。
   */
  server.post<{ Params: { roomSlug: string }; Body: ImportBody }>(
    "/rooms/:roomSlug/online/queue",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const body = request.body ?? {};
      const songNumber = typeof body.songNumber === "string" ? body.songNumber.trim() : "";
      if (!songNumber) {
        await reply.code(400).send({ code: "ONLINE_SONG_NUMBER_REQUIRED" });
        return;
      }

      const requestedBy = typeof body.requestedBy === "string" && body.requestedBy.trim()
        ? body.requestedBy.trim()
        : "controller";

      let queueEntryId: string | null = null;
      const result = await dependencies.onlineImport.requestImport(
        {
          songNumber,
          ...(typeof body.title === "string" ? { title: body.title } : {}),
          ...(typeof body.artistName === "string" ? { artistName: body.artistName } : {})
        },
        {
          onReady: async (asset) => {
            if (!asset.catalogSongId) {
              throw new Error(`online asset ${asset.id} has no catalog song id`);
            }
            queueEntryId = await appendToQueue(dependencies.queueEntries, {
              roomId: room.id,
              catalogSongId: asset.catalogSongId,
              requestedBy,
              requestedByName: typeof body.requestedByName === "string" ? body.requestedByName : null,
              requestedByUserPhone: typeof body.requestedByUserPhone === "string" ? body.requestedByUserPhone : null
            });
          }
        }
      );

      const statusCode = queueEntryId ? 200 : 202;
      await reply.code(statusCode).send({
        assetId: result.asset.id,
        songNumber,
        status: result.asset.status,
        cached: result.cached,
        queued: queueEntryId !== null,
        queueEntryId
      });
    }
  );

  server.get<{ Params: { roomSlug: string; assetId: string } }>(
    "/rooms/:roomSlug/online/assets/:assetId",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const asset = await dependencies.onlineImport.getAsset(request.params.assetId);
      if (!asset) {
        await reply.code(404).send({ code: "ONLINE_ASSET_NOT_FOUND" });
        return;
      }

      await reply.send({
        asset: {
          id: asset.id,
          provider: asset.provider,
          providerAssetId: asset.providerAssetId,
          status: asset.status,
          catalogSongId: asset.catalogSongId,
          durationMs: asset.durationMs,
          cacheBytes: asset.cacheBytes,
          audioTrackCount: asset.audioTrackCount,
          errorReason: asset.errorReason
        },
        playbackUrl: asset.status === "ready" ? `/media/online/${encodeURIComponent(asset.id)}` : null
      });
    }
  );
}

async function appendToQueue(
  queueEntries: Pick<QueueEntryRepository, "listEffectiveQueue" | "append">,
  input: {
    roomId: RoomId;
    catalogSongId: string;
    requestedBy: string;
    requestedByName: string | null;
    requestedByUserPhone: string | null;
  }
): Promise<string> {
  const queue = await queueEntries.listEffectiveQueue(input.roomId);
  const existing = queue.find(
    (entry) => (entry.source?.assetId ?? entry.assetId) === input.catalogSongId
  );
  if (existing) {
    return existing.id;
  }
  const entry = await queueEntries.append({
    roomId: input.roomId,
    songId: input.catalogSongId,
    assetId: input.catalogSongId,
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedByUserPhone: input.requestedByUserPhone,
    queuePosition: queue.length + 1,
    status: "queued"
  });
  return entry.id;
}

function toImportResponse(result: {
  asset: { id: string; status: string; provider: string; providerAssetId: string };
  cached: boolean;
}) {
  return {
    assetId: result.asset.id,
    provider: result.asset.provider,
    songNumber: result.asset.providerAssetId,
    status: result.asset.status,
    cached: result.cached
  };
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value ?? ""), 10);
  return Math.min(max, Math.max(1, Number.isFinite(parsed) ? parsed : fallback));
}
