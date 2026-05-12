import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runFuseCli, parseFuseArgs, HOT_SONGS_FUSE_HELP } from "../fuse-cli.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseFuseArgs", () => {
  it("parses input, output and alias paths", () => {
    const args = parseFuseArgs([
      "--manifest",
      "packages/hot-songs/config/sources.example.json",
      "--candidate-snapshot",
      ".planning/reports/hot-songs/candidates/candidate-snapshot.json",
      "--aliases",
      ".planning/reports/hot-songs/fusion-aliases.json",
      "--out",
      ".planning/reports/hot-songs/fused"
    ]);

    expect(args).toEqual({
      manifestPath: "packages/hot-songs/config/sources.example.json",
      candidateSnapshotPath: ".planning/reports/hot-songs/candidates/candidate-snapshot.json",
      aliasesPath: ".planning/reports/hot-songs/fusion-aliases.json",
      outDir: ".planning/reports/hot-songs/fused",
      help: false
    });
  });

  it("accepts pnpm separator and exposes help", () => {
    const args = parseFuseArgs(["--", "--help"]);

    expect(args.help).toBe(true);
    expect(HOT_SONGS_FUSE_HELP).toContain("hot-songs:fuse");
  });
});

describe("runFuseCli", () => {
  it("writes ranked csv and audit artifacts", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "hot-songs-fuse-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const originalInitCwd = process.env.INIT_CWD;

    process.env.INIT_CWD = repoRoot;

    const manifestPath = join(outDir, "manifest.json");
    const candidateSnapshotPath = join(outDir, "candidate-snapshot.json");

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
            expectedMinRows: 400,
            staleAfterDays: 14,
            url: "https://y.qq.com/n/ryqq/toplist/26"
          }
        ]
      }),
      "utf8"
    );

    await writeFile(
      candidateSnapshotPath,
      JSON.stringify({
        schemaVersion: "hot-songs.candidate-snapshot.v1",
        generatedAt: "2026-05-11T00:00:00.000Z",
        sourceRowCount: 2,
        candidateCount: 2,
        candidates: [
          {
            candidateId: "song_a",
            songKey: "title:后来|artists:刘若英|variant:original",
            canonicalTitleKey: "后来",
            baseTitleKey: "后来",
            canonicalArtistKeys: ["刘若英"],
            variantSignature: "original",
            displayTitle: "后来",
            displayArtists: ["刘若英"],
            sourceIds: ["qq-hot-toplist"],
            sourceTypes: ["support"],
            warnings: [],
            evidence: [
              {
                sourceId: "qq-hot-toplist",
                sourceType: "support",
                provider: "qq_music",
                rank: 1,
                rawTitle: "后来",
                rawArtists: ["刘若英"],
                sourceUrl: "https://y.qq.com/n/ryqq/toplist/26",
                sourcePublishedAt: "2026-05-11",
                collectedAt: "2026-05-11T00:00:00.000Z",
                warnings: []
              }
            ]
          },
          {
            candidateId: "song_b",
            songKey: "title:小幸运|artists:田馥甄|variant:original",
            canonicalTitleKey: "小幸运",
            baseTitleKey: "小幸运",
            canonicalArtistKeys: ["田馥甄"],
            variantSignature: "original",
            displayTitle: "小幸运",
            displayArtists: ["田馥甄"],
            sourceIds: ["qq-hot-toplist"],
            sourceTypes: ["support"],
            warnings: [],
            evidence: [
              {
                sourceId: "qq-hot-toplist",
                sourceType: "support",
                provider: "qq_music",
                rank: 2,
                rawTitle: "小幸运",
                rawArtists: ["田馥甄"],
                sourceUrl: "https://y.qq.com/n/ryqq/toplist/26",
                sourcePublishedAt: "2026-05-11",
                collectedAt: "2026-05-11T00:00:00.000Z",
                warnings: []
              }
            ]
          }
        ]
      }),
      "utf8"
    );

    try {
      const exitCode = await runFuseCli([
        "--manifest",
        manifestPath,
        "--candidate-snapshot",
        candidateSnapshotPath,
        "--out",
        outDir
      ]);

      expect(exitCode).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        "Fusion complete: 2 ranked songs from 2 candidates"
      );

      const csv = await readFile(join(outDir, "ranked-songs.csv"), "utf8");
      const audit = JSON.parse(
        await readFile(join(outDir, "ranked-songs.audit.json"), "utf8")
      ) as {
        schemaVersion: string;
        rankedCount: number;
        nearDuplicates: unknown[];
      };
      const nearDuplicates = await readFile(
        join(outDir, "near-duplicates.csv"),
        "utf8"
      );

      expect(csv.split("\n")[0]).toBe("rank,title,artist,score");
      expect(csv).toContain("1,后来,刘若英,");
      expect(csv).toContain("2,小幸运,田馥甄,");
      expect(audit.schemaVersion).toBe("hot-songs.fusion-report.v1");
      expect(audit.rankedCount).toBe(2);
      expect(nearDuplicates.split("\n")[0]).toBe("left_title,right_title,artist,similarity,reason");
    } finally {
      if (originalInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = originalInitCwd;
      }

      logSpy.mockRestore();
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
