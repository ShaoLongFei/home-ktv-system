import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HOT_SONGS_NORMALIZE_HELP,
  parseNormalizeSourcesArgs,
  runNormalizeSourcesCli
} from "../normalize-cli.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);
const sourceRowsPath = resolve(
  repoRoot,
  ".planning/reports/hot-songs/phase-12-fixture-all/source-rows.json"
);
const sourceReportPath = resolve(
  repoRoot,
  ".planning/reports/hot-songs/phase-12-fixture-all/source-report.json"
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseNormalizeSourcesArgs", () => {
  it("parses normalization input and output paths", () => {
    const args = parseNormalizeSourcesArgs([
      "--source-rows",
      ".planning/reports/hot-songs/phase-12-fixture-all/source-rows.json",
      "--source-report",
      ".planning/reports/hot-songs/phase-12-fixture-all/source-report.json",
      "--out",
      ".planning/reports/hot-songs/phase-13-fixture-candidates"
    ]);

    expect(args).toEqual({
      sourceRowsPath:
        ".planning/reports/hot-songs/phase-12-fixture-all/source-rows.json",
      sourceReportPath:
        ".planning/reports/hot-songs/phase-12-fixture-all/source-report.json",
      outDir: ".planning/reports/hot-songs/phase-13-fixture-candidates",
      help: false
    });
  });

  it("accepts pnpm separator and exposes hot-songs:normalize help", () => {
    const args = parseNormalizeSourcesArgs([
      "--",
      "--source-rows",
      "source-rows.json",
      "--out",
      "candidate-output"
    ]);

    expect(args.sourceRowsPath).toBe("source-rows.json");
    expect(args.outDir).toBe("candidate-output");
    expect(HOT_SONGS_NORMALIZE_HELP).toContain("hot-songs:normalize");
  });
});

describe("runNormalizeSourcesCli", () => {
  it("writes a candidate snapshot from Phase 12 fixture source rows", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "hot-songs-normalize-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const exitCode = await runNormalizeSourcesCli([
        "--source-rows",
        sourceRowsPath,
        "--source-report",
        sourceReportPath,
        "--out",
        outDir
      ]);
      const snapshot = JSON.parse(
        await readFile(join(outDir, "candidate-snapshot.json"), "utf8")
      ) as {
        schemaVersion: string;
        generatedAt: string;
        sourceRowCount: number;
        candidateCount: number;
        candidates: Array<{
          displayTitle: string;
          displayArtists: string[];
          candidateId: string;
          warnings: string[];
          evidence: unknown[];
        }>;
        sourceStatuses: unknown[];
      };

      const houLai = snapshot.candidates.find(
        (candidate) => candidate.displayTitle === "后来"
      );
      const live = snapshot.candidates.find((candidate) =>
        candidate.displayTitle.includes("同手同脚")
      );

      expect(exitCode).toBe(0);
      expect(snapshot.schemaVersion).toBe("hot-songs.candidate-snapshot.v1");
      expect(snapshot.generatedAt).toBe("2026-05-10T06:26:28.264Z");
      expect(snapshot.sourceRowCount).toBe(15);
      expect(snapshot.candidateCount).toBe(6);
      expect(snapshot.sourceStatuses).toHaveLength(5);
      expect(houLai?.displayArtists).toEqual(["刘若英"]);
      expect(houLai?.evidence).toHaveLength(5);
      expect(live?.warnings).toContain("variant-live");
      expect(snapshot.candidates.every((candidate) =>
        candidate.candidateId.startsWith("song_")
      )).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        "Candidate normalization complete: 6 candidates from 15 source rows"
      );
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  });

  it("filters unusable source rows when a source report is provided", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "hot-songs-normalize-"));
    const localSourceRowsPath = join(outDir, "source-rows.json");
    const localSourceReportPath = join(outDir, "source-report.json");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await writeFile(
      localSourceRowsPath,
      JSON.stringify(
        {
          schemaVersion: "hot-songs.source-rows.v1",
          generatedAt: "2026-05-10T00:00:00.000Z",
          rows: [
            {
              sourceId: "usable-source",
              sourceType: "support",
              provider: "qq_music",
              rank: 1,
              rawTitle: "星昼",
              rawArtists: ["周深"],
              sourceUrl: "https://example.com/a",
              sourcePublishedAt: "2026-05-10",
              collectedAt: "2026-05-10T00:00:00.000Z",
              warnings: []
            },
            {
              sourceId: "blocked-source",
              sourceType: "support",
              provider: "qq_music",
              rank: 2,
              rawTitle: "第二首",
              rawArtists: ["测试歌手"],
              sourceUrl: "https://example.com/b",
              sourcePublishedAt: "2026-05-10",
              collectedAt: "2026-05-10T00:00:00.000Z",
              warnings: []
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );
    await writeFile(
      localSourceReportPath,
      JSON.stringify(
        {
          schemaVersion: "hot-songs.source-report.v1",
          generatedAt: "2026-05-10T00:00:00.000Z",
          totalRows: 2,
          usableSourceCount: 1,
          statusCounts: {
            succeeded: 1,
            platform_cap: 0,
            failed_below_min_rows: 1,
            failed: 0,
            stale: 0,
            skipped: 0
          },
          sources: [
            {
              sourceId: "usable-source",
              status: "succeeded",
              usable: true,
              rowCount: 1,
              warnings: [],
              startedAt: "2026-05-10T00:00:00.000Z",
              finishedAt: "2026-05-10T00:00:00.000Z"
            },
            {
              sourceId: "blocked-source",
              status: "failed_below_min_rows",
              usable: false,
              rowCount: 1,
              warnings: ["row-count-below-minimum"],
              startedAt: "2026-05-10T00:00:00.000Z",
              finishedAt: "2026-05-10T00:00:00.000Z"
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    try {
      const exitCode = await runNormalizeSourcesCli([
        "--source-rows",
        localSourceRowsPath,
        "--source-report",
        localSourceReportPath,
        "--out",
        outDir
      ]);
      const snapshot = JSON.parse(
        await readFile(join(outDir, "candidate-snapshot.json"), "utf8")
      ) as {
        sourceRowCount: number;
        candidateCount: number;
        candidates: Array<{ sourceIds: string[] }>;
      };

      expect(exitCode).toBe(0);
      expect(snapshot.sourceRowCount).toBe(1);
      expect(snapshot.candidateCount).toBe(1);
      expect(snapshot.candidates[0]?.sourceIds).toEqual(["usable-source"]);
      expect(logSpy).toHaveBeenCalledWith(
        "Candidate normalization complete: 1 candidates from 1 source rows"
      );
    } finally {
      logSpy.mockRestore();
      await rm(outDir, { force: true, recursive: true });
    }
  });
});
