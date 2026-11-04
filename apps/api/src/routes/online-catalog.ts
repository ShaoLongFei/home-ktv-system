import type { FastifyInstance } from "fastify";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import type { OnlineImportService } from "../modules/online/online-import-service.js";

export interface OnlineCatalogRouteDependencies {
  rooms: RoomRepository;
  onlineImport: OnlineImportService;
}

interface ImportBody {
  songNumber?: unknown;
  title?: unknown;
  artistName?: unknown;
  query?: unknown;
  limit?: unknown;
}

interface AssetsQuery {
  limit?: string | number;
}

export async function registerOnlineCatalogRoutes(
  server: FastifyInstance,
  dependencies: OnlineCatalogRouteDependencies
): Promise<void> {
  server.get("/admin/online/sources", async (_request, reply) => {
    const status = await dependencies.onlineImport.status();
    await reply.send({
      provider: status.provider,
      enabled: status.enabled,
      cacheDir: status.cacheDir,
      pendingJobs: status.pendingJobs,
      activeJobs: status.activeJobs,
      stats: status.stats
    });
  });

  server.get<{ Querystring: AssetsQuery }>("/admin/online/assets", async (request, reply) => {
    const limit = parseLimit(request.query.limit, 50, 200);
    const assets = await dependencies.onlineImport.listAssets(limit);
    await reply.send({ assets });
  });

  server.post<{ Body: ImportBody }>("/admin/online/import", async (request, reply) => {
    const body = request.body ?? {};
    const limit = parseLimit(body.limit, 10, 50);

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
