import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { parseKugouRankHtmlRows } from "../adapters/kugou-rank-html.js";
import { parseNeteaseToplistHtmlRows } from "../adapters/netease-toplist-html.js";
import { parseQqToplistJsonRows, parseQqToplistRows } from "../adapters/qq-toplist.js";
import { parseTencentMusicYobangRows } from "../adapters/tencent-music-yobang.js";
import { runCollectSourcesCli } from "../cli.js";
import { SourceDefinitionSchema } from "../contracts.js";
import { buildSourceFetchHeaders } from "../fetch/http.js";

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

const kugouSegmentedSource = SourceDefinitionSchema.parse({
  id: "kugou-top500",
  name: "Kugou TOP500",
  provider: "kugou",
  sourceType: "support",
  sourceKind: "public_chart",
  adapter: "kugou_rank_html",
  weight: 70,
  urls: [
    "https://www.kugou.com/yy/rank/home/1-8888.html?from=rank",
    "https://www.kugou.com/yy/rank/home/2-8888.html?from=rank"
  ],
  expectedMinRows: 6,
  minRows: 6,
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

const qqHotJsonSource = SourceDefinitionSchema.parse({
  id: "qq-hot-toplist",
  name: "QQ Music 热歌榜",
  provider: "qq_music",
  sourceType: "support",
  sourceKind: "public_chart",
  adapter: "qq_toplist",
  weight: 45,
  url: "https://y.qq.com/n/ryqq/toplist/26",
  topId: 26,
  expectedMinRows: 3,
  staleAfterDays: 14
});

const tencentYobangSource = SourceDefinitionSchema.parse({
  id: "tencent-music-yobang",
  name: "腾讯音乐由你榜",
  provider: "qq_music",
  sourceType: "support",
  sourceKind: "public_chart",
  adapter: "tencent_music_yobang",
  weight: 80,
  url: "https://yobang.tencentmusic.com/chart/uni-chart/rankList/?shareFrom=qy",
  expectedMinRows: 2,
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
  it("configures the requested full chart sources independently", async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(repoRoot, "packages/hot-songs/config/sources.example.json"),
        "utf8"
      )
    ) as {
      sources: Array<{
        id: string;
        provider: string;
        targetRows: number;
        minRows: number;
      }>;
    };

    const sourceIds = manifest.sources.map((source) => source.id);
    expect(sourceIds).toEqual([
      "kugou-top500",
      "kugou-soaring",
      "kugou-hummingbird-pop",
      "kugou-douyin-hot",
      "kugou-kuaishou-hot",
      "kugou-mainland",
      "kugou-90s-hot",
      "kugou-00s-hot",
      "tencent-music-yobang",
      "qq-trend-toplist",
      "qq-soaring-toplist",
      "qq-hot-toplist",
      "qq-pop-index-toplist",
      "qq-collect-popularity-toplist",
      "qq-music-index-toplist",
      "qq-kge-toplist",
      "qq-mainland-toplist",
      "qq-internet-song-toplist",
      "qq-douyin-hot-toplist",
      "netease-hot-toplist",
      "netease-soaring-toplist",
      "netease-vip-hot-toplist"
    ]);

    expect(manifest.sources.filter((source) => source.provider === "kugou")).toHaveLength(8);
    expect(manifest.sources.filter((source) => source.provider === "qq_music")).toHaveLength(11);
    expect(manifest.sources.filter((source) => source.provider === "netease")).toHaveLength(3);
    expect(
      manifest.sources.every(
        (source) => source.targetRows === 500 && source.minRows === 400
      )
    ).toBe(true);
  });

  it("collects all configured chart sources offline and writes per-source artifacts", async () => {
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
        "Source collection complete: 3047 rows from 22 usable sources"
      );
      expect(errorSpy).not.toHaveBeenCalled();

      const report = JSON.parse(
        await readFile(resolve(absoluteOutDir, "source-report.json"), "utf8")
      ) as {
        sources: Array<{ sourceId: string; status: string; rowCount: number }>;
      };

      expect(report.sources).toHaveLength(22);
      expect(report.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceId: "kugou-top500",
            status: "succeeded",
            rowCount: 500
          }),
          expect.objectContaining({
            sourceId: "qq-hot-toplist",
            status: "platform_cap",
            rowCount: 300
          }),
          expect.objectContaining({
            sourceId: "netease-vip-hot-toplist",
            status: "platform_cap",
            rowCount: 10
          })
        ])
      );

      const perSource = JSON.parse(
        await readFile(
          resolve(absoluteOutDir, "sources", "kugou-top500.json"),
          "utf8"
        )
      ) as { schemaVersion: string; sourceId: string; rowCount: number };

      expect(perSource).toEqual(
        expect.objectContaining({
          schemaVersion: "hot-songs.source-file.v1",
          sourceId: "kugou-top500",
          rowCount: 500
        })
      );
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
  it("merges segmented Kugou ranking pages for one logical source", async () => {
    const html = await readFile(
      resolve(
        repoRoot,
        "packages/hot-songs/fixtures/html/kugou-rank-home.fixture.html"
      ),
      "utf8"
    );

    const rows = parseKugouRankHtmlRows(
      kugouSegmentedSource,
      [html, html],
      "2026-05-10T00:00:00.000Z"
    );

    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceId: "kugou-top500",
        rank: 1,
        rawTitle: "后来"
      })
    );
    expect(rows[3]).toEqual(
      expect.objectContaining({
        sourceId: "kugou-top500",
        rank: 4,
        rawTitle: "后来"
      })
    );
  });

  it("parses QQ public toplist JSON rows", () => {
    const rows = parseQqToplistJsonRows(
      qqHotJsonSource,
      {
        code: 0,
        date: "2026-05-10",
        cur_song_num: 2,
        songlist: [
          {
            Franking_value: "1",
            data: {
              songname: "Run Wild（向风而野）",
              singer: [{ name: "是晚星呀" }]
            }
          },
          {
            rank: 2,
            data: {
              name: "后来",
              singer: [{ name: "刘若英" }]
            }
          }
        ]
      },
      "2026-05-10T00:00:00.000Z"
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceId: "qq-hot-toplist",
        rank: 1,
        rawTitle: "Run Wild（向风而野）",
        rawArtists: ["是晚星呀"],
        sourcePublishedAt: "2026-05-10"
      })
    );
  });

  it("parses Tencent Music 由你榜 Next page data", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          issueStart: "2026-05-11 00:00:00",
          chartsList: [
            { rank: 1, songName: "星昼", singerName: "周深" },
            { rank: 2, trackNameShow: "Someone to Love", singerName: "严浩翔" }
          ]
        }
      }
    })}</script>`;

    const rows = parseTencentMusicYobangRows(
      tencentYobangSource,
      html,
      "2026-05-11T00:00:00.000Z"
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceId: "tencent-music-yobang",
        rank: 1,
        rawTitle: "星昼",
        rawArtists: ["周深"],
        sourcePublishedAt: "2026-05-11"
      })
    );
  });

  it("builds source fetch headers from cookie env names without exposing values", () => {
    const originalCookie = process.env.QQ_MUSIC_COOKIE;
    process.env.QQ_MUSIC_COOKIE = "uin=12345; qm_keyst=secret";

    try {
      const headers = buildSourceFetchHeaders(
        SourceDefinitionSchema.parse({
          id: "qq-cookie-source",
          name: "QQ Cookie Source",
          provider: "qq_music",
          sourceType: "support",
          sourceKind: "public_chart",
          adapter: "qq_toplist",
          weight: 50,
          url: "https://y.qq.com/n/ryqq/toplist/26",
          authCookieEnv: "QQ_MUSIC_COOKIE"
        })
      );

      expect(headers.cookie).toBe("uin=12345; qm_keyst=secret");
      expect(JSON.stringify(headers)).not.toContain("QQ_MUSIC_COOKIE");
    } finally {
      if (originalCookie === undefined) {
        delete process.env.QQ_MUSIC_COOKIE;
      } else {
        process.env.QQ_MUSIC_COOKIE = originalCookie;
      }
    }
  });

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
