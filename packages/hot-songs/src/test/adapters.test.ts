import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { parseKugouRankHtmlRows } from "../adapters/kugou-rank-html.js";
import { parseNeteaseToplistHtmlRows } from "../adapters/netease-toplist-html.js";
import { parseQqToplistRows } from "../adapters/qq-toplist.js";
import { runCollectSourcesCli } from "../cli.js";
import { SourceDefinitionSchema } from "../contracts.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

const qqKgeSource = SourceDefinitionSchema.parse({
  id: "qq-kge-toplist",
  name: "QQ Music K歌金曲榜",
  provider: "qq_music",
  sourceType: "ktv_first",
  sourceKind: "public_chart",
  adapter: "qq_toplist",
  weight: 100,
  url: "https://y.qq.com/n/ryqq/toplist/36",
  expectedMinRows: 3,
  staleAfterDays: 14
});

const kugouRankSource = SourceDefinitionSchema.parse({
  id: "kugou-rank-home",
  name: "Kugou 排行榜",
  provider: "kugou",
  sourceType: "support",
  sourceKind: "public_chart",
  adapter: "kugou_rank_html",
  weight: 40,
  url: "https://www.kugou.com/yy/rank/home",
  expectedMinRows: 3,
  staleAfterDays: 14
});

const neteaseToplistSource = SourceDefinitionSchema.parse({
  id: "netease-toplist",
  name: "NetEase 云音乐榜单",
  provider: "netease",
  sourceType: "support",
  sourceKind: "public_chart",
  adapter: "netease_toplist_html",
  weight: 35,
  url: "https://music.163.com/discover/toplist",
  expectedMinRows: 3,
  staleAfterDays: 14
});

describe("parseQqToplistRows", () => {
  it("parses QQ K歌金曲榜 fixture rows", async () => {
    const html = await readFile(
      resolve(
        repoRoot,
        "packages/hot-songs/fixtures/html/qq-kge-toplist.fixture.html"
      ),
      "utf8"
    );

    const rows = parseQqToplistRows(
      qqKgeSource,
      html,
      "2026-05-10T00:00:00.000Z"
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceId: "qq-kge-toplist",
        sourceType: "ktv_first",
        provider: "qq_music",
        rank: 1,
        rawTitle: "后来",
        rawArtists: ["刘若英"],
        sourceUrl: "https://y.qq.com/n/ryqq/toplist/36",
        sourcePublishedAt: "2026-05-10",
        collectedAt: "2026-05-10T00:00:00.000Z"
      })
    );
    expect(rows.map((row) => row.rawTitle)).toContain("Run Wild（向风而野）");
  });

  it("throws when QQ embedded toplist data is absent", () => {
    expect(() =>
      parseQqToplistRows(qqKgeSource, "<html></html>", "2026-05-10T00:00:00.000Z")
    ).toThrow("QQ toplist data not found");
  });
});

describe("fixture mode source collection", () => {
  it("collects all configured KTV-first and support sources offline", async () => {
    const outDir = `.planning/reports/hot-songs/adapters-fixture-${process.pid}-${Date.now()}`;
    const absoluteOutDir = resolve(repoRoot, outDir);
    const originalInitCwd = process.env.INIT_CWD;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    process.env.INIT_CWD = repoRoot;

    try {
      const exitCode = await runCollectSourcesCli([
        "--fixture",
        "--timeout-ms",
        "1",
        "--manifest",
        "packages/hot-songs/config/sources.example.json",
        "--out",
        outDir
      ]);

      expect(exitCode).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        "Source collection complete: 15 rows from 5 usable sources"
      );
      expect(errorSpy).not.toHaveBeenCalled();

      const report = JSON.parse(
        await readFile(resolve(absoluteOutDir, "source-report.json"), "utf8")
      ) as {
        sources: Array<{ sourceId: string; status: string }>;
      };

      for (const sourceId of [
        "qq-kge-toplist",
        "cavca-golden-mic-manual",
        "qq-hot-toplist",
        "kugou-rank-home",
        "netease-toplist"
      ]) {
        expect(report.sources).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ sourceId, status: "succeeded" })
          ])
        );
      }
    } finally {
      if (originalInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = originalInitCwd;
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
      await rm(absoluteOutDir, { recursive: true, force: true });
    }
  });
});

describe("support chart adapters", () => {
  it("parses Kugou ranking fixture rows", async () => {
    const html = await readFile(
      resolve(
        repoRoot,
        "packages/hot-songs/fixtures/html/kugou-rank-home.fixture.html"
      ),
      "utf8"
    );

    const rows = parseKugouRankHtmlRows(
      kugouRankSource,
      html,
      "2026-05-10T00:00:00.000Z"
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceId: "kugou-rank-home",
        sourceType: "support",
        provider: "kugou",
        rank: 1,
        rawTitle: "后来",
        rawArtists: ["刘若英"]
      })
    );
    expect(rows.map((row) => row.rawTitle)).toContain("Run Wild（向风而野）");
  });

  it("parses NetEase toplist fixture rows", async () => {
    const html = await readFile(
      resolve(
        repoRoot,
        "packages/hot-songs/fixtures/html/netease-toplist.fixture.html"
      ),
      "utf8"
    );

    const rows = parseNeteaseToplistHtmlRows(
      neteaseToplistSource,
      html,
      "2026-05-10T00:00:00.000Z"
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceId: "netease-toplist",
        sourceType: "support",
        provider: "netease",
        rank: 1,
        rawTitle: "后来",
        rawArtists: ["刘若英"]
      })
    );
    expect(rows.map((row) => row.rawTitle)).toContain("小幸运");
  });
});
