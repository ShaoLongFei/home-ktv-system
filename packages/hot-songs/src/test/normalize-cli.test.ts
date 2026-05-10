import { mkdtemp, readFile, rm } from "node:fs/promises";
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
});
