import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Readable } from "node:stream";

import {
  createProviderSearchers,
  createCacheKey,
  handleRequest,
  runJsonlSidecar,
  selectBestMetadata,
} from "./music_metadata_sidecar.mjs";

test("createCacheKey collapses equivalent queries", () => {
  assert.equal(
    createCacheKey("searchCandidates", {
      provider: "kugou",
      title: " 夜曲 (Live版) ",
      artist: "周杰伦",
      limit: 8,
    }),
    createCacheKey("searchCandidates", {
      provider: "kugou",
      title: "夜曲",
      artist: " 周杰伦 ",
      limit: 8,
    }),
  );
});

test("handleRequest returns normalized candidates from provider searchers", async () => {
  const calls = [];
  const response = await handleRequest(
    {
      id: "1",
      command: "searchCandidates",
      input: {
        provider: "qq",
        title: "夜曲",
        artist: "周杰伦",
        limit: 5,
      },
    },
    {
      cache: new Map(),
      searchers: {
        qq: async (input) => {
          calls.push(input);
          return [
            {
              provider: "qq",
              providerSongId: "001",
              title: "夜曲",
            artistNames: ["周杰伦"],
            albumName: "十一月的萧邦",
            imageUrl: "https://example.com/cover.jpg",
            language: "国语",
            genreName: "流行",
            tags: ["华语流行"],
            categories: ["热门"],
            description: "电视剧主题曲",
          },
        ];
      },
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(response.id, "1");
  assert.equal(response.ok, true);
  assert.equal(response.result.provider, "qq");
  assert.equal(response.result.candidates.length, 1);
  assert.equal(response.result.candidates[0].title, "夜曲");
  assert.equal(response.result.candidates[0].language, "国语");
  assert.equal(response.result.candidates[0].genreName, "流行");
  assert.deepEqual(response.result.candidates[0].tags, ["华语流行"]);
  assert.deepEqual(response.result.candidates[0].categories, ["热门"]);
  assert.equal(response.result.candidates[0].description, "电视剧主题曲");
});

test("handleRequest reuses cache for repeated logical searches", async () => {
  let callCount = 0;
  const context = {
    cache: new Map(),
    searchers: {
      kuwo: async () => {
        callCount += 1;
        return [
          {
            provider: "kuwo",
            providerSongId: "kw-1",
            title: "江南",
            artistNames: ["林俊杰"],
            albumName: "第二天堂",
            imageUrl: "https://example.com/jn.jpg",
          },
        ];
      },
    },
  };

  await handleRequest(
    {
      id: "1",
      command: "searchCandidates",
      input: { provider: "kuwo", title: "江南", artist: "林俊杰", limit: 8 },
    },
    context,
  );
  await handleRequest(
    {
      id: "2",
      command: "searchCandidates",
      input: { provider: "kuwo", title: " 江南 ", artist: "林俊杰 ", limit: 8 },
    },
    context,
  );

  assert.equal(callCount, 1);
});

test("runJsonlSidecar handles requests concurrently up to the configured limit", async () => {
  let active = 0;
  let maxActive = 0;
  const output = new PassThrough();
  const chunks = [];
  output.on("data", (chunk) => chunks.push(chunk.toString("utf-8")));

  const input = Readable.from(
    Array.from({ length: 6 }, (_, index) =>
      JSON.stringify({
        id: String(index + 1),
        command: "searchCandidates",
        input: {
          provider: "qq",
          title: `歌${index + 1}`,
          artist: "歌手",
          limit: 3,
        },
      }) + "\n",
    ),
  );

  await runJsonlSidecar({
    input,
    output,
    maxConcurrency: 3,
    searchers: {
      qq: async (request) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return [
          {
            provider: "qq",
            providerSongId: request.title,
            title: request.title,
            artistNames: [request.artist],
            albumName: "专辑",
            imageUrl: "https://example.com/cover.jpg",
          },
        ];
      },
    },
  });

  const responses = chunks
    .join("")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(responses.length, 6);
  assert.ok(maxActive >= 2);
  assert.ok(maxActive <= 3);
});

test("selectBestMetadata prefers strict title+artist match over title-only match", () => {
  const result = selectBestMetadata(
    { title: "夜之光", artist: "花姐" },
    [
      {
        provider: "spotify",
        providerSongId: "title-only",
        title: "夜之光",
        artistNames: ["其他歌手"],
        albumName: "夜之光",
        imageUrl: "https://example.com/title.jpg",
      },
      {
        provider: "netease",
        providerSongId: "strict",
        title: "夜之光",
        artistNames: ["花姐"],
        albumName: "夜之光",
        imageUrl: "https://example.com/strict.jpg",
      },
    ],
  );

  assert.equal(result?.providerSongId, "strict");
  assert.equal(result?.matchMode, "title_artist");
});

test("handleRequest rejects unsupported commands", async () => {
  const response = await handleRequest(
    { id: "1", command: "nope", input: {} },
    { cache: new Map(), searchers: {} },
  );

  assert.equal(response.ok, false);
  assert.match(response.error.message, /unsupported command/i);
});

test("playlistEvidence combines normalized playlist rows and skips failed providers", async () => {
  const response = await handleRequest(
    {
      id: "1",
      command: "playlistEvidence",
      input: {
        providers: ["netease", "kugou"],
        title: "海阔天空",
        limit: 10,
      },
    },
    {
      cache: new Map(),
      searchers: {},
      playlistSearchers: {
        netease: async () => [
          {
            provider: "netease",
            source: "netease_simi_playlist",
            playlistId: "nt-1",
            name: "粤语经典老歌",
            description: "Beyond 与港乐摇滚",
            tags: ["粤语", "摇滚"],
            playCount: 10000,
            subscribedCount: 200,
            trackCount: 80,
            containsTitle: true,
            official: false,
            weight: 2,
          },
        ],
        kugou: async () => {
          throw new Error("HTTP 502");
        },
      },
    },
  );

  assert.equal(response.ok, true);
  assert.equal(response.result.evidence.length, 1);
  assert.equal(response.result.evidence[0].provider, "netease");
  assert.equal(response.result.evidence[0].name, "粤语经典老歌");
  assert.deepEqual(response.result.evidence[0].tags, ["粤语", "摇滚"]);
  assert.equal(response.result.evidence[0].weight, 2);
  assert.match(response.result.providerErrors.kugou, /HTTP 502/);
});

test("bestMetadata skips failed providers and keeps later matches", async () => {
  const response = await handleRequest(
    {
      id: "1",
      command: "bestMetadata",
      input: {
        providers: ["netease", "tencent"],
        title: "夜之光",
        artist: "花姐",
        limit: 5,
      },
    },
    {
      cache: new Map(),
      searchers: {
        netease: async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:4300");
        },
        tencent: async () => [
          {
            provider: "tencent",
            providerSongId: "strict",
            title: "夜之光",
            artistNames: ["花姐"],
            albumName: "夜之光",
            imageUrl: "https://example.com/strict.jpg",
          },
        ],
      },
    },
  );

  assert.equal(response.ok, true);
  assert.equal(response.result.candidate?.providerSongId, "strict");
  assert.match(response.result.providerErrors.netease, /ECONNREFUSED/i);
});

test("bestMetadata returns all normalized candidates for classification aggregation", async () => {
  const response = await handleRequest(
    {
      id: "1",
      command: "bestMetadata",
      input: {
        providers: ["netease", "kugou"],
        title: "Lemon",
        artist: "",
        limit: 5,
      },
    },
    {
      cache: new Map(),
      searchers: {
        netease: async () => [
          {
            provider: "netease",
            providerSongId: "nt-1",
            title: "Lemon",
            artistNames: ["米津玄師"],
            albumName: "Lemon",
            imageUrl: "",
          },
        ],
        kugou: async () => [
          {
            provider: "kugou",
            providerSongId: "kg-1",
            title: "Lemon",
            artistNames: ["米津玄師"],
            albumName: "Lemon",
            imageUrl: "",
            language: "日语",
            description: "《非自然死亡》电视剧主题曲",
          },
        ],
      },
    },
  );

  assert.equal(response.ok, true);
  assert.equal(response.result.candidates.length, 2);
  assert.equal(response.result.candidates[1].language, "日语");
  assert.equal(response.result.candidates[1].description, "《非自然死亡》电视剧主题曲");
});

test("netease provider falls back to song detail when search row misses image", async () => {
  const calls = [];
  const searchers = createProviderSearchers({
    neteaseBaseUrl: "http://127.0.0.1:4300",
    fetchJson: async (url, { query }) => {
      calls.push({ url, query });
      if (url.endsWith("/cloudsearch")) {
        return {
          result: {
            songs: [
              {
                id: 1,
                name: "夜曲",
                ar: [{ name: "周杰伦" }],
                al: { name: "十一月的萧邦", picUrl: "" },
              },
            ],
          },
        };
      }
      return {
        songs: [
          {
            id: 1,
            name: "夜曲",
            ar: [{ name: "周杰伦" }],
            al: { name: "十一月的萧邦", picUrl: "https://example.com/netease.jpg" },
          },
        ],
      };
    },
  });

  const rows = await searchers.netease({ title: "夜曲", artist: "周杰伦", limit: 3 });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://127.0.0.1:4300/cloudsearch");
  assert.equal(calls[1].url, "http://127.0.0.1:4300/song/detail");
  assert.equal(rows[0].imageUrl, "https://example.com/netease.jpg");
});

test("tencent provider derives image url from album mid", async () => {
  const searchers = createProviderSearchers({
    fetchJson: async () => ({
      data: {
        song: {
          list: [
            {
              mid: "song-mid",
              name: "江南",
              singer: [{ name: "林俊杰" }],
              album: { title: "第二天堂", mid: "album-mid" },
            },
          ],
        },
      },
    }),
  });

  const rows = await searchers.tencent({ title: "江南", artist: "林俊杰", limit: 3 });

  assert.equal(rows[0].providerSongId, "song-mid");
  assert.equal(rows[0].imageUrl, "https://y.gtimg.cn/music/photo_new/T002R300x300M000album-mid.jpg?max_age=2592000");
});

test("kuwo provider uses detail image when search row has no picture", async () => {
  const calls = [];
  const searchers = createProviderSearchers({
    fetchJson: async (url, { query }) => {
      calls.push({ url, query });
      if (url.includes("searchMusicBykeyWord")) {
        return {
          data: {
            list: [
              {
                rid: "100",
                name: "晴天",
                artist: "周杰伦",
                album: "叶惠美",
                pic: "",
              },
            ],
          },
        };
      }
      return {
        data: {
          pic: "https://example.com/kuwo.jpg",
        },
      };
    },
  });

  const rows = await searchers.kuwo({ title: "晴天", artist: "周杰伦", limit: 3 });

  assert.equal(calls.length, 2);
  assert.equal(rows[0].imageUrl, "https://example.com/kuwo.jpg");
});

test("kugou provider fills image from detail fallback", async () => {
  const calls = [];
  const searchers = createProviderSearchers({
    fetchJson: async (url, { query }) => {
      calls.push({ url, query });
      if (url.includes("/api/v3/search/song")) {
        return {
          data: {
            info: [
              {
                hash: "hash-1",
                filename: "Beyond - 海阔天空",
                songName: "海阔天空",
                album_name: "乐与怒",
              },
            ],
          },
        };
      }
      return {
        imgUrl: "http://imge.kugou.com/stdmusic/{size}/cover.jpg",
      };
    },
  });

  const rows = await searchers.kugou({ title: "海阔天空", artist: "Beyond", limit: 3 });

  assert.equal(calls.length, 2);
  assert.equal(rows[0].imageUrl, "http://imge.kugou.com/stdmusic/400/cover.jpg");
});

test("kugou provider exposes language and topic classification fields", async () => {
  const searchers = createProviderSearchers({
    fetchJson: async () => ({
      data: {
        info: [
          {
            hash: "kg-1",
            songName: "Lemon",
            authors: [{ author_name: "米津玄師" }],
            album_name: "Lemon",
            album_img: "http://imge.kugou.com/stdmusic/{size}/cover.jpg",
            topic: "《非自然死亡》电视剧主题曲",
            trans_param: { language: "日语" },
          },
        ],
      },
    }),
  });

  const rows = await searchers.kugou({ title: "Lemon", artist: "", limit: 1 });

  assert.equal(rows[0].language, "日语");
  assert.equal(rows[0].description, "《非自然死亡》电视剧主题曲");
});

test("tencent provider maps language code and description fields", async () => {
  const searchers = createProviderSearchers({
    fetchJson: async () => ({
      data: {
        song: {
          list: [
            {
              mid: "qq-1",
              name: "Lemon",
              singer: [{ name: "米津玄師" }],
              album: { title: "Lemon", mid: "alb-1", subtitle: "日剧原声" },
              language: 3,
              genre: 0,
              desc: "《Unnatural》日剧主题曲",
              subtitle: "《Unnatural》日剧主题曲",
            },
          ],
        },
      },
    }),
  });

  const rows = await searchers.tencent({ title: "Lemon", artist: "", limit: 1 });

  assert.equal(rows[0].language, "日语");
  assert.equal(rows[0].description, "《Unnatural》日剧主题曲 日剧原声");
});
