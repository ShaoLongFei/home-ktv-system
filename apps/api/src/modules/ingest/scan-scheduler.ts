import type { Stats } from "node:fs";
import { watch, type ChokidarOptions } from "chokidar";
import type { ImportScanScope } from "@home-ktv/domain";
import type { ImportScanner, ScanInput } from "./import-scanner.js";
import type { LibraryPaths } from "./library-paths.js";

export type ScanSchedulerWatcherEvent = "add" | "change" | "unlink";

export interface ScanSchedulerWatcher {
  on(eventName: ScanSchedulerWatcherEvent, handler: (pathHint: string) => unknown): ScanSchedulerWatcher;
  close(): Promise<void> | void;
}

export interface ScanSchedulerChokidar {
  watch(paths: string[], options: ChokidarOptions): ScanSchedulerWatcher;
}

export interface ScanSchedulerTimers {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(timer: unknown): void;
}

export interface ScanSchedulerOptions {
  scanner: Pick<ImportScanner, "scan">;
  paths: LibraryPaths;
  scanIntervalMinutes: number;
  chokidarImpl?: ScanSchedulerChokidar;
  timers?: ScanSchedulerTimers;
}

export interface ScanScheduler {
  start(): Promise<void>;
  close(): Promise<void>;
  enqueueManualScan(scope: ImportScanScope): Promise<void>;
}

const WATCHER_EVENTS: ScanSchedulerWatcherEvent[] = ["add", "change", "unlink"];
const defaultChokidarImpl: ScanSchedulerChokidar = {
  watch: (paths, options) => watch(paths, options)
};
const defaultTimers: ScanSchedulerTimers = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (timer) => clearInterval(timer as NodeJS.Timeout)
};

export function createScanScheduler(options: ScanSchedulerOptions): ScanScheduler {
  return new DefaultScanScheduler(options);
}

class DefaultScanScheduler implements ScanScheduler {
  private watcher: ScanSchedulerWatcher | null = null;
  private interval: unknown = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: ScanSchedulerOptions) {}

  async start(): Promise<void> {
    if (this.watcher) {
      return;
    }

    const chokidarImpl = this.options.chokidarImpl ?? defaultChokidarImpl;
    this.watcher = chokidarImpl.watch(
      [this.options.paths.importsPendingRoot, this.options.paths.importsNeedsReviewRoot, this.options.paths.songsRoot],
      {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
        atomic: true,
        depth: 5,
        ignored: (filePath, stats) => Boolean(stats?.isFile()) && !isSupportedScanPath(filePath, stats)
      }
    );

    for (const eventName of WATCHER_EVENTS) {
      this.watcher.on(eventName, (pathHint) => this.enqueueWatcherScan(pathHint));
    }

    const timers = this.options.timers ?? defaultTimers;
    this.interval = timers.setInterval(() => {
      const scheduled = this.enqueueScan({ trigger: "scheduled", scope: "all" });
      scheduled.catch(() => undefined);
    }, this.options.scanIntervalMinutes * 60_000);
  }

  async close(): Promise<void> {
    const timers = this.options.timers ?? defaultTimers;
    if (this.interval) {
      timers.clearInterval(this.interval);
      this.interval = null;
    }

    const watcher = this.watcher;
    this.watcher = null;
    if (watcher) {
      await watcher.close();
    }

    await this.queue.catch(() => undefined);
  }

  enqueueManualScan(scope: ImportScanScope): Promise<void> {
    return this.enqueueScan({ trigger: "manual", scope });
  }

  private enqueueWatcherScan(pathHint: string): Promise<void> {
    const task = this.enqueueScan({ trigger: "watcher", scope: "all", pathHint });
    task.catch(() => undefined);
    return task;
  }

  private enqueueScan(input: ScanInput): Promise<void> {
    const run = this.queue.then(
      () => this.options.scanner.scan(input),
      () => this.options.scanner.scan(input)
    );
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run.then(() => undefined);
  }
}

function isSupportedScanPath(filePath: string, stats?: Stats): boolean {
  if (stats && !stats.isFile()) {
    return true;
  }

  const lowerPath = filePath.toLocaleLowerCase();
  return (
    lowerPath.endsWith(".mp4") ||
    lowerPath.endsWith(".mkv") ||
    lowerPath.endsWith(".mov") ||
    lowerPath.endsWith(".webm") ||
    lowerPath.endsWith("/song.json")
  );
}
