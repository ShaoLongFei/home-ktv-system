import path from "node:path";
import type { ImportScanScope } from "@home-ktv/domain";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { createScanScheduler, type ScanSchedulerWatcher } from "../modules/ingest/scan-scheduler.js";
import { resolveLibraryPaths } from "../modules/ingest/library-paths.js";

describe("scan scheduler", () => {
  it("exposes lifecycle methods and routes manual scans through the scanner", async () => {
    const harness = createSchedulerHarness();

    expect(harness.scheduler.start).toEqual(expect.any(Function));
    expect(harness.scheduler.close).toEqual(expect.any(Function));
    expect(harness.scheduler.enqueueManualScan).toEqual(expect.any(Function));

    await harness.scheduler.start();
    await harness.scheduler.enqueueManualScan("imports");
    await harness.scheduler.close();

    expect(harness.scanner.scan).toHaveBeenCalledWith({ trigger: "manual", scope: "imports" });
    expect(harness.chokidarImpl.watch).toHaveBeenCalledWith(
      [harness.paths.importsPendingRoot, harness.paths.importsNeedsReviewRoot, harness.paths.songsRoot],
      expect.objectContaining({
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
        atomic: true,
        depth: 5
      })
    );
    expect(harness.watcher.close).toHaveBeenCalledTimes(1);
    expect(harness.timers.clearInterval).toHaveBeenCalledWith("timer-1");
  });

  it("enqueues watcher add, change, and unlink events as lightweight all-scope scans", async () => {
    const harness = createSchedulerHarness();
    await harness.scheduler.start();

    const added = path.join(harness.paths.importsPendingRoot, "jay", "song.mp4");
    const changed = path.join(harness.paths.importsNeedsReviewRoot, "jay", "song.mkv");
    const deleted = path.join(harness.paths.songsRoot, "mandarin", "jay", "song", "song.json");

    await harness.watcher.emit("add", added);
    await harness.watcher.emit("change", changed);
    await harness.watcher.emit("unlink", deleted);

    expect(harness.scanner.scan).toHaveBeenNthCalledWith(1, { trigger: "watcher", scope: "all", pathHint: added });
    expect(harness.scanner.scan).toHaveBeenNthCalledWith(2, { trigger: "watcher", scope: "all", pathHint: changed });
    expect(harness.scanner.scan).toHaveBeenNthCalledWith(3, { trigger: "watcher", scope: "all", pathHint: deleted });
  });
});

describe("API scan scheduler startup", () => {
  it("starts the scheduler for Postgres runtime and closes it before ending the pool", async () => {
    const scheduler = {
      start: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      enqueueManualScan: vi.fn(async (_scope: ImportScanScope) => undefined)
    };
    const pool = createFakePool();
    const config = {
      corsAllowedOrigins: [],
      databaseUrl: "postgres://home-ktv",
      host: "127.0.0.1",
      mediaRoot: "/media/ktv",
      port: 4000,
      publicBaseUrl: "http://127.0.0.1:4000",
      roomSlug: "living-room",
      scanIntervalMinutes: 360
    };

    const server = await createServer(config, {
      poolFactory: () => pool,
      scanSchedulerFactory: () => scheduler
    });

    expect(scheduler.start).toHaveBeenCalledTimes(1);

    await server.close();

    expect(scheduler.close).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(scheduler.close.mock.invocationCallOrder[0]).toBeLessThan(pool.end.mock.invocationCallOrder[0] ?? 0);
  });
});

function createSchedulerHarness() {
  const paths = resolveLibraryPaths("/media/ktv");
  const scanner = {
    scan: vi.fn(async () => ({ filesSeen: 0, filesAdded: 0, filesChanged: 0, filesDeleted: 0, candidateCount: 0 }))
  };
  const watcher = new FakeWatcher();
  const chokidarImpl = {
    watch: vi.fn(() => watcher)
  };
  const timers = {
    setInterval: vi.fn(() => "timer-1"),
    clearInterval: vi.fn()
  };
  const scheduler = createScanScheduler({
    scanner,
    paths,
    scanIntervalMinutes: 30,
    chokidarImpl,
    timers
  });

  return { scheduler, scanner, watcher, chokidarImpl, timers, paths };
}

class FakeWatcher implements ScanSchedulerWatcher {
  readonly close = vi.fn(async () => undefined);
  private readonly handlers = new Map<string, Array<(pathHint: string) => unknown>>();

  on(eventName: "add" | "change" | "unlink", handler: (pathHint: string) => unknown): this {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
    return this;
  }

  async emit(eventName: "add" | "change" | "unlink", pathHint: string): Promise<void> {
    for (const handler of this.handlers.get(eventName) ?? []) {
      await handler(pathHint);
    }
  }
}

function createFakePool() {
  return {
    query: vi.fn(async () => ({ rows: [] })),
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn()
    })),
    end: vi.fn(async () => undefined)
  } as never;
}
