import Fastify from "fastify";
import type { QueueEntry, Room, SongSearchIndexedResult } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import type { KtvIndexReadRepository } from "../modules/ktv-index/ktv-index-read-repository.js";
import type { OnlineCatalogCandidate } from "../modules/online/igeba/igeba-provider.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import { registerSongSearchRoutes } from "../routes/song-search.js";

const room: Room = {
  id: "living-room",
  slug: "living-room",
  name: "Living Room",
  status: "active",
  defaultPlayerDeviceId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function createHarness(
  onlineCatalog?: { search: (keyword: string, limit: number) => Promise<OnlineCatalogCandidate[]> },
  ktvIndex?: Pick<KtvIndexReadRepository, "searchIndexedSongs">
) {
  const server = Fastify();
  void registerSongSearchRoutes(server, {
    rooms: {
      findById: async (roomId) => (roomId === room.id ? room : null),
      findBySlug: async (slug) => (slug === room.slug ? room : null)
    } satisfies RoomRepository,
    queueEntries: {
      listEffectiveQueue: async () => [] as QueueEntry[]
    } as unknown as QueueEntryRepository,
    ...(onlineCatalog ? { onlineCatalog } : {}),
    ...(ktvIndex ? { ktvIndex } : {})
  });
  return { server };
}

describe("song search online merge", () => {
  it("keeps the online section disabled when no provider is configured", async () => {
    const { server } = createHarness();
    const response = await server.inject({ method: "GET", url: "/rooms/living-room/songs/search?q=孤勇者" });

    expect(response.statusCode).toBe(200);
    expect(response.json().online).toEqual({
      status: "disabled",
      message: "暂不启用线上补歌",
      requestSupplement: { visible: false, label: "请求补歌" },
      candidates: [],
      nextOffset: null
    });
    await server.close();
  });

  it("maps online catalog hits into candidate cards", async () => {
    const calls: Array<{ keyword: string; limit: number }> = [];
    const { server } = createHarness({
      search: async (keyword: string, limit: number) => {
        calls.push({ keyword, limit });
        return [
          {
            provider: "igeba",
            providerSongId: "20039643",
            title: "孤勇者",
            artistName: "陈奕迅",
            durationMs: 269000,
            language: "国语",
            coverUrl: "http://pub.amanktv.cn/uploads/images/20039643.jpg",
            sourceLabel: "在线曲库",
            tags: ["Movie", "原声"],
            metadata: {}
          },
          {
            provider: "igeba",
            providerSongId: "20039881",
            title: "孤勇者",
            artistName: "张韶涵/信",
            durationMs: 267000,
            language: "国语",
            coverUrl: null,
            sourceLabel: "在线曲库",
            tags: [],
            metadata: {}
          }
        ] as OnlineCatalogCandidate[];
      }
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=%E5%AD%A4%E5%8B%87%E8%80%85&limit=5"
    });

    const body = response.json();
    expect(calls).toEqual([{ keyword: "孤勇者", limit: 20 }]);
    expect(body.online.status).toBe("available");
    expect(body.online.message).toBe("找到 2 首在线曲库结果");
    expect(body.online.candidates[0]).toEqual({
      provider: "igeba",
      providerCandidateId: "20039643",
      title: "孤勇者",
      artistName: "陈奕迅",
      sourceLabel: "在线曲库",
      durationMs: 269000,
      candidateType: "mv",
      reliabilityLabel: "medium",
      riskLabel: "normal",
      taskState: "discovered",
      taskId: null
    });
    await server.close();
  });

  it("marks online candidates that already exist on NAS instead of dropping them", async () => {
    const { server } = createHarness(
      {
        search: async () => [
          onlineCandidate("20039643", "七里香", "周杰伦"),
          onlineCandidate("20039699", "孤勇者", "陈奕迅")
        ]
      },
      {
        searchIndexedSongs: async () => [
          indexedResult({
            assetId: "ktv-asset-qilixiang-main",
            title: "七里香",
            artistName: "周杰伦",
            queueState: "queued"
          })
        ]
      }
    );

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=%E4%B8%83%E9%87%8C%E9%A6%99"
    });

    const body = response.json();
    // NAS 命中不再把在线结果过滤掉，否则这首歌在搜索里会彻底消失
    expect(body.online.candidates).toHaveLength(2);
    expect(body.online.candidates[0]).toMatchObject({
      providerCandidateId: "20039643",
      title: "七里香",
      nasAssetId: "ktv-asset-qilixiang-main",
      nasQueueState: "queued"
    });
    expect(body.online.candidates[1]).not.toHaveProperty("nasAssetId");
    await server.close();
  });

  it("does not call the provider for empty queries", async () => {    let called = 0;
    const { server } = createHarness({
      search: async () => {
        called += 1;
        return [];
      }
    });

    await server.inject({ method: "GET", url: "/rooms/living-room/songs/search?q=" });
    expect(called).toBe(0);
    await server.close();
  });
});

function onlineCandidate(providerSongId: string, title: string, artistName: string): OnlineCatalogCandidate {
  return {
    provider: "igeba",
    providerSongId,
    title,
    artistName,
    durationMs: 269000,
    language: "国语",
    coverUrl: null,
    sourceLabel: "在线曲库",
    tags: [],
    metadata: {}
  };
}

function indexedResult(input: {
  assetId: string;
  title: string;
  artistName: string;
  queueState: SongSearchIndexedResult["versions"][number]["queueState"];
}): SongSearchIndexedResult {
  return {
    indexedSongId: `ktv-song-${input.assetId}`,
    title: input.title,
    artistName: input.artistName,
    category: "流行",
    sourceLabel: "NAS曲库",
    matchReason: "title",
    versions: [
      {
        indexedAssetId: input.assetId,
        displayName: `${input.title}.mkv`,
        sourceLabel: "NAS曲库",
        extension: ".mkv",
        sizeBytes: 734003200,
        audioTrackCount: 2,
        category: "流行",
        queueState: input.queueState,
        canQueue: true,
        disabledLabel: null
      }
    ]
  };
}
