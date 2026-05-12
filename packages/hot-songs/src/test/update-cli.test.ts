import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HOT_SONGS_UPDATE_HELP,
  parseUpdateArgs,
  runUpdateCli
} from "../update-cli.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseUpdateArgs", () => {
  it("parses full update options", () => {
    const args = parseUpdateArgs([
      "--manifest",
      "packages/hot-songs/config/sources.example.json",
      "--out",
      ".planning/reports/hot-songs/latest",
      "--timeout-ms",
      "2500",
      "--source",
      "qq-hot-toplist",
      "--source",
      "kugou-top500",
      "--aliases",
      ".planning/reports/hot-songs/aliases.json",
      "--source-rows",
      ".planning/reports/hot-songs/external/source-rows.json",
      "--source-report",
      ".planning/reports/hot-songs/external/source-report.json",
      "--fixture"
    ]);

    expect(args).toEqual({
      manifestPath: "packages/hot-songs/config/sources.example.json",
      outDir: ".planning/reports/hot-songs/latest",
      timeoutMs: 2500,
      sourceIds: ["qq-hot-toplist", "kugou-top500"],
      aliasesPath: ".planning/reports/hot-songs/aliases.json",
      sourceRowsPath: ".planning/reports/hot-songs/external/source-rows.json",
      sourceReportPath: ".planning/reports/hot-songs/external/source-report.json",
      fixture: true,
      help: false
    });
  });

  it("uses product defaults and exposes help", () => {
    const args = parseUpdateArgs(["--", "--help"]);

    expect(args.manifestPath).toBeUndefined();
    expect(args.outDir).toBeUndefined();
    expect(args.timeoutMs).toBe(10000);
    expect(args.sourceIds).toEqual([]);
    expect(args.fixture).toBe(false);
    expect(args.help).toBe(true);
    expect(HOT_SONGS_UPDATE_HELP).toContain("hot-songs:update");
  });
});

describe("runUpdateCli", () => {
  it("writes final ranking artifacts and logs the CSV path", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "hot-songs-update-cli-"));
    const manifestPath = join(outDir, "manifest.json");
    const sourceRowsPath = join(outDir, "source-rows-input.json");
    const sourceReportPath = join(outDir, "source-report-input.json");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const originalInitCwd = process.env.INIT_CWD;

    process.env.INIT_CWD = repoRoot;

    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: "hot-songs.source-manifest.v1",
        sources: [
          {
            id: "qq-hot-toplist",
            name: "QQ 音乐 热歌榜",
            provider: "qq_music",
            sourceType: "support",
            sourceKind: "public_chart",
            adapter: "qq_toplist",
            weight: 75,
            targetRows: 500,
            expectedMinRows: 1,
            staleAfterDays: 14,
            url: "https://y.qq.com/n/ryqq/toplist/26"
          }
        ]
      }),
      "utf8"
    );

    await writeFile(
      sourceRowsPath,
      JSON.stringify({
        schemaVersion: "hot-songs.source-rows.v1",
        generatedAt: "2026-05-12T00:00:00.000Z",
        rows: [
          {
            sourceId: "qq-hot-toplist",
            sourceType: "support",
            provider: "qq_music",
            rank: 1,
            rawTitle: "后来",
            rawArtists: ["刘若英"],
            sourceUrl: "https://y.qq.com/n/ryqq/toplist/26",
            sourcePublishedAt: "2026-05-12",
            collectedAt: "2026-05-12T00:00:00.000Z",
            warnings: []
          }
        ]
      }),
      "utf8"
    );

    await writeFile(
      sourceReportPath,
      JSON.stringify({
        schemaVersion: "hot-songs.source-report.v1",
        generatedAt: "2026-05-12T00:00:00.000Z",
        totalRows: 1,
        usableSourceCount: 1,
        statusCounts: {
          succeeded: 1,
          platform_cap: 0,
          failed_below_min_rows: 0,
          failed: 0,
          stale: 0,
          skipped: 0
        },
        sources: [
          {
            sourceId: "qq-hot-toplist",
            status: "succeeded",
            usable: true,
            rowCount: 1,
            warnings: [],
            startedAt: "2026-05-12T00:00:00.000Z",
            finishedAt: "2026-05-12T00:00:00.000Z"
          }
        ]
      }),
      "utf8"
    );

    try {
      const exitCode = await runUpdateCli([
        "--manifest",
        manifestPath,
        "--source-rows",
        sourceRowsPath,
        "--source-report",
        sourceReportPath,
        "--out",
        outDir
      ]);
      const csv = await readFile(join(outDir, "ranked-songs.csv"), "utf8");

      expect(exitCode).toBe(0);
      expect(csv).toContain("1,后来,刘若英,");
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Hot songs update complete:")
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(join(outDir, "ranked-songs.csv"))
      );
    } finally {
      if (originalInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = originalInitCwd;
      }

      logSpy.mockRestore();
      await rm(outDir, { force: true, recursive: true });
    }
  });
});
