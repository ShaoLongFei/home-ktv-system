import Fastify from "fastify";
import type { Room } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import type { QueueEntry } from "@home-ktv/domain";
import type { OnlineAssetRecord } from "../modules/online/online-catalog-repository.js";
import type { OnlineImportService, RequestImportOptions } from "../modules/online/online-import-service.js";
import { registerOnlineCatalogRoutes } from "../routes/online-catalog.js";

const room: Room = {
  id: "living-room",
  slug: "living-room",
  name: "Living Room",
  status: "active",
  defaultPlayerDeviceId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function createAsset(overrides: Partial<OnlineAssetRecord> = {}): OnlineAssetRecord {
  return {
    id: "online-asset-1",
    songId: "online-song-1",
    provider: "igeba",
    providerAssetId: "20039643",
    mediaUrl: "",
    cachePath: "/media/online-cache/igeba/20039643.mkv",
    catalogSongId: null,
    status: "caching",
    durationMs: null,
    cacheBytes: null,
    audioTrackCount: null,
    errorReason: null,
    metadata: {},
    ...overrides
  };
}

function createHarness(importService: Partial<OnlineImportService> = {}) {
  const server = Fastify();
  const appended: Array<Record<string, unknown>> = [];
  const service = {
    status: async () => ({
      provider: "igeba",
      enabled: true,
      cacheDir: "/media/online-cache/igeba",
      pendingJobs: 0,
      activeJobs: 0,
      stats: { total: 1, ready: 1, caching: 0, failed: 0, unavailable: 0, bytes: 1024 }
    }),
    listAssets: async () => [createAsset({ status: "ready", cacheBytes: 1024 })],
    requestImport: async (input: { songNumber: string }, options: RequestImportOptions = {}) => {
      if (options.onReady) {
        const ready = createAsset({
          providerAssetId: input.songNumber,
          status: "ready",
          catalogSongId: `ktv-online-igeba-${input.songNumber}`
        });
        await options.onReady(ready);
        return { asset: ready, cached: true };
      }
      return { asset: createAsset({ providerAssetId: input.songNumber }), cached: false };
    },
    importByQuery: async () => [
      { asset: createAsset({ id: "online-asset-a", providerAssetId: "1" }), cached: false },
      { asset: createAsset({ id: "online-asset-b", providerAssetId: "2" }), cached: true }
    ],
    getAsset: async (assetId: string) =>
      assetId === "online-asset-1" ? createAsset({ status: "ready", cachePath: "/tmp/x.mkv" }) : null,
    ...importService
  } as unknown as OnlineImportService;

  void registerOnlineCatalogRoutes(server, {
    rooms: {
      findById: async (roomId) => (roomId === room.id ? room : null),
      findBySlug: async (slug) => (slug === room.slug ? room : null)
    },
    onlineImport: service,
    queueEntries: {
      listEffectiveQueue: async () => [] as QueueEntry[],
      append: async (input) => {
        appended.push(input as unknown as Record<string, unknown>);
        return { id: "queue-entry-1" } as QueueEntry;
      }
    }
  });
  return { server, appended };
}

describe("online catalog routes", () => {
  it("reports provider status and cache stats", async () => {
    const { server } = createHarness();
    const response = await server.inject({ method: "GET", url: "/admin/online/sources" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "igeba",
      enabled: true,
      stats: { ready: 1, bytes: 1024 }
    });
    await server.close();
  });

  it("imports a single song for a room and returns the pending playback url", async () => {
    const { server } = createHarness();
    const response = await server.inject({
      method: "POST",
      url: "/rooms/living-room/online/import",
      payload: { songNumber: "20039643", title: "孤勇者" }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      songNumber: "20039643",
      status: "caching",
      cached: false,
      playbackUrl: null
    });
    await server.close();
  });

  it("rejects imports without a song number", async () => {
    const { server } = createHarness();
    const response = await server.inject({
      method: "POST",
      url: "/rooms/living-room/online/import",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "ONLINE_SONG_NUMBER_REQUIRED" });
    await server.close();
  });

  it("supports batch import by keyword", async () => {
    const { server } = createHarness();
    const response = await server.inject({
      method: "POST",
      url: "/admin/online/import",
      payload: { query: "周杰伦", limit: 2 }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ queued: 2 });
    await server.close();
  });

  it("queues an already cached online song immediately", async () => {
    const { server, appended } = createHarness();
    const response = await server.inject({
      method: "POST",
      url: "/rooms/living-room/online/queue",
      payload: { songNumber: "20039643", requestedBy: "phone-1" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ queued: true, queueEntryId: "queue-entry-1" });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      roomId: "living-room",
      songId: "ktv-online-igeba-20039643",
      assetId: "ktv-online-igeba-20039643",
      requestedBy: "phone-1",
      queuePosition: 1,
      status: "queued"
    });
    await server.close();
  });

  it("returns 202 while the online song is still caching", async () => {
    const { server } = createHarness({
      requestImport: (async () => ({
        asset: createAsset({ status: "caching" }),
        cached: false
      })) as unknown as OnlineImportService["requestImport"]
    });

    const response = await server.inject({
      method: "POST",
      url: "/rooms/living-room/online/queue",
      payload: { songNumber: "20039643" }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ queued: false, queueEntryId: null, status: "caching" });
    await server.close();
  });

  it("returns 404 for unknown rooms and assets", async () => {
    const { server } = createHarness();

    const missingRoom = await server.inject({
      method: "GET",
      url: "/rooms/unknown/online/assets/online-asset-1"
    });
    expect(missingRoom.statusCode).toBe(404);
    expect(missingRoom.json()).toEqual({ code: "ROOM_NOT_FOUND" });

    const missingAsset = await server.inject({
      method: "GET",
      url: "/rooms/living-room/online/assets/missing"
    });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.json()).toEqual({ code: "ONLINE_ASSET_NOT_FOUND" });
    await server.close();
  });
});
