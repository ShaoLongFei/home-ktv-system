import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OnlineCatalogProvider } from "../modules/online/igeba/igeba-provider.js";
import { InMemoryOnlineCatalogPromoter } from "../modules/online/online-catalog-promoter.js";
import { InMemoryOnlineCatalogRepository } from "../modules/online/online-catalog-repository.js";
import { OnlineImportService } from "../modules/online/online-import-service.js";

function createProvider(overrides: Partial<OnlineCatalogProvider> = {}): OnlineCatalogProvider {
  return {
    id: "igeba",
    sourceLabel: "在线曲库",
    health: () => ({ ok: true, lastError: null, lastSuccessAt: null, cooldownUntil: null }),
    search: async () => [],
    resolve: async (songNumber) => ({
      songNumber,
      fileName: `${songNumber}.mkv`,
      fileUrl: "http://file.local/g8file.php?path=/x.mkv&rid=1",
      sizeBytes: 9,
      voiceChannel: "0",
      rightsCode: 0,
      attempts: 1
    }),
    download: async (_songNumber, targetPath) => {
      await writeFile(targetPath, "012345678");
      return { bytes: 9, songNumber: _songNumber };
    },
    ...overrides
  };
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

describe("OnlineImportService", () => {
  let cacheDir = "";

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "online-import-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("downloads, probes and marks the asset ready", async () => {
    const repository = new InMemoryOnlineCatalogRepository();
    const promoter = new InMemoryOnlineCatalogPromoter();
    const service = new OnlineImportService({
      provider: createProvider(),
      repository,
      promoter,
      cacheDir,
      logger: silentLogger,
      probeMedia: async () => ({ durationMs: 269000, audioTrackCount: 2 })
    });

    const queued = await service.requestImport({ songNumber: "20039643", title: "孤勇者", artistName: "陈奕迅" });
    expect(queued.cached).toBe(false);
    expect(queued.asset.status).toBe("caching");

    await service.whenIdle();

    const asset = await service.getAsset(queued.asset.id);
    expect(asset?.status).toBe("ready");
    expect(asset?.cachePath).toBe(join(cacheDir, "20039643.mkv"));
    expect(asset?.cacheBytes).toBe(9);
    expect(asset?.audioTrackCount).toBe(2);
    expect(asset?.catalogSongId).toBe("ktv-online-igeba-20039643");
    expect(promoter.promoted[0]).toMatchObject({
      provider: "igeba",
      providerSongId: "20039643",
      title: "孤勇者",
      artistName: "陈奕迅",
      sizeBytes: 9
    });
    expect(await readFile(join(cacheDir, "20039643.mkv"), "utf8")).toBe("012345678");

    const again = await service.requestImport({ songNumber: "20039643" });
    expect(again.cached).toBe(true);

    const stats = await service.status();
    expect(stats.stats).toMatchObject({ total: 1, ready: 1, caching: 0 });
  });

  it("reuses an already cached file after a restart instead of downloading again", async () => {
    const repository = new InMemoryOnlineCatalogRepository();
    let downloads = 0;
    const service = new OnlineImportService({
      provider: createProvider({
        download: async () => {
          downloads += 1;
          throw new Error("should not download");
        }
      }),
      repository,
      cacheDir,
      logger: silentLogger,
      probeMedia: async () => ({ durationMs: 1000, audioTrackCount: 1 })
    });

    await writeFile(join(cacheDir, "20039643.mkv"), "012345678");
    const queued = await service.requestImport({ songNumber: "20039643" });
    await service.whenIdle();

    const asset = await service.getAsset(queued.asset.id);
    expect(downloads).toBe(0);
    expect(asset?.status).toBe("ready");
    expect(asset?.cacheBytes).toBe(9);
  });

  it("marks rights-less songs as unavailable instead of retrying forever", async () => {
    const repository = new InMemoryOnlineCatalogRepository();
    const service = new OnlineImportService({
      provider: createProvider({
        resolve: async () => {
          throw new Error("ige8 has no playable url for 20039643 (rights=3)");
        }
      }),
      repository,
      cacheDir,
      logger: silentLogger,
      probeMedia: async () => ({ durationMs: null, audioTrackCount: null })
    });

    const queued = await service.requestImport({ songNumber: "20039643" });
    await service.whenIdle();

    const asset = await service.getAsset(queued.asset.id);
    expect(asset?.status).toBe("unavailable");
    expect(asset?.errorReason).toContain("no playable url");
  });

  it("keeps search failures from breaking the local catalog", async () => {
    const repository = new InMemoryOnlineCatalogRepository();
    const service = new OnlineImportService({
      provider: createProvider({
        search: async () => {
          throw new Error("network down");
        }
      }),
      repository,
      cacheDir,
      logger: silentLogger
    });

    await expect(service.search("孤勇者", 10)).resolves.toEqual([]);
  });
});
