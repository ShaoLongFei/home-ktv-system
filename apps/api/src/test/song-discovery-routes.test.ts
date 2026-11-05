import Fastify from "fastify";
import type { QueueEntry, Room, SongDiscoveryResponse, SongSearchIndexedResult } from "@home-ktv/domain";
import { describe, expect, it, vi } from "vitest";
import type { SongCoverRepository } from "../modules/covers/song-cover-repository.js";
import type { SongCoverLookupKey } from "../modules/covers/types.js";
import type { KtvIndexReadRepository, SearchKtvIndexedSongsInput } from "../modules/ktv-index/ktv-index-read-repository.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import { registerSongDiscoveryRoutes } from "../routes/song-discovery.js";

const now = "2026-05-28T10:00:00.000Z";
type FakeCoverEntry = string | { imageUrl: string; thumbnailImageUrl?: string };

describe("song discovery routes", () => {
  it("returns ROOM_NOT_FOUND for missing rooms", async () => {
    const { server } = await createHarness({ room: null });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/missing/songs/discovery"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: "ROOM_NOT_FOUND" });
  });

  it("returns weighted NAS recommendations plus artist and genre modules", async () => {
    const ktvIndex = new FakeKtvIndexReadRepository([
      createIndexedResult({
        indexedSongId: "ktv-song-hot",
        indexedAssetId: "ktv-asset-hot",
        title: "热门歌",
        artistName: "歌手A",
        styleTags: ["流行"],
        queueState: "queued"
      }),
      createIndexedResult({
        indexedSongId: "ktv-song-rock",
        indexedAssetId: "ktv-asset-rock",
        title: "摇滚歌",
        artistName: "歌手B",
        styleTags: ["摇滚"]
      })
    ]);
    const { server, queueEntries } = await createHarness({
      ktvIndex,
      queueEntries: [createQueueEntry({ songId: "ktv-song-hot", assetId: "ktv-asset-hot" })],
      playCounts: { "ktv-song-hot": 8, "ktv-song-rock": 2 },
      coverEntries: {
        "nas:ktv-song-hot": {
          imageUrl: "https://cover.example/hot.jpg",
          thumbnailImageUrl: "https://cover.example/thumbs/hot.jpg"
        }
      }
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/discovery?seed=nas&limit=2"
    });

    expect(response.statusCode).toBe(200);
    expect(ktvIndex.searchCalls).toEqual([
      {
        query: "",
        limit: 500,
        shuffle: true,
        versionsPerSong: 1,
        queuedIndexedAssetIds: ["ktv-asset-hot"],
        unreadableIndexedAssetIds: []
      }
    ]);
    expect(queueEntries.countCalls).toEqual([["ktv-song-hot", "ktv-song-rock"]]);

    const body = response.json<SongDiscoveryResponse>();
    expect(body.seed).toBe("nas");
    expect(body.recommended).toHaveLength(2);
    expect(body.recommended).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "nas",
          songId: "ktv-song-hot",
          title: "热门歌",
          artistName: "歌手A",
          genre: ["流行"],
          queueState: "queued",
          playCount: 8,
          coverImageUrl: "https://cover.example/hot.jpg",
          coverThumbnailUrl: "https://cover.example/thumbs/hot.jpg",
          versions: [
            expect.objectContaining({
              assetId: "ktv-asset-hot",
              queueState: "queued",
              sourceLabel: "NAS曲库"
            })
          ]
        })
      ])
    );
    expect(body.artists).toEqual([
      expect.objectContaining({ artistName: "歌手A", songCount: 1 }),
      expect.objectContaining({ artistName: "歌手B", songCount: 1 })
    ]);
    expect(body.genres).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ genre: "流行", songCount: 1 }),
        expect.objectContaining({ genre: "摇滚", songCount: 1 })
      ])
    );
  });

  it("builds artist and genre modules from the full catalog instead of the recommendation sample", async () => {
    const ktvIndex = new FakeKtvIndexReadRepository([
      createIndexedResult({
        indexedSongId: "ktv-song-recommended",
        indexedAssetId: "ktv-asset-recommended",
        title: "推荐样本歌",
        artistName: "样本歌手",
        styleTags: ["样本风格"]
      })
    ]);
    const listDiscoveryArtists = vi.fn(async () => [
      { artistId: "artist-b", artistName: "歌手B", songCount: 7, playCount: 0 },
      { artistId: "artist-c", artistName: "歌手C", songCount: 3, playCount: 0 },
      { artistId: "artist-a", artistName: "歌手A", songCount: 12, playCount: 4 }
    ]);
    const listDiscoveryGenres = vi.fn(async () => [
      { genre: "摇滚", songCount: 45, playCount: 1 },
      { genre: "流行", songCount: 120, playCount: 8 }
    ]);
    Object.assign(ktvIndex, { listDiscoveryArtists, listDiscoveryGenres });

    const { server } = await createHarness({ ktvIndex });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/discovery?seed=full-catalog&limit=1"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<SongDiscoveryResponse>();
    expect(body.recommended).toHaveLength(1);
    expect(body.artists).toEqual([
      { artistId: "artist-a", artistName: "歌手A", songCount: 12, songs: [] },
      { artistId: "artist-b", artistName: "歌手B", songCount: 7, songs: [] },
      { artistId: "artist-c", artistName: "歌手C", songCount: 3, songs: [] }
    ]);
    expect(body.genres).toEqual([
      { genre: "流行", songCount: 120, songs: [] },
      { genre: "摇滚", songCount: 45, songs: [] }
    ]);
    expect(listDiscoveryArtists).toHaveBeenCalledTimes(1);
    expect(listDiscoveryGenres).toHaveBeenCalledTimes(1);
  });

  it("sorts fallback artist and genre modules by song count before play count", async () => {
    const ktvIndex = new FakeKtvIndexReadRepository([
      createIndexedResult({
        indexedSongId: "ktv-song-pop-1",
        indexedAssetId: "ktv-asset-pop-1",
        title: "低热度流行一",
        artistName: "多歌歌手",
        styleTags: ["流行"]
      }),
      createIndexedResult({
        indexedSongId: "ktv-song-pop-2",
        indexedAssetId: "ktv-asset-pop-2",
        title: "低热度流行二",
        artistName: "多歌歌手",
        styleTags: ["流行"]
      }),
      createIndexedResult({
        indexedSongId: "ktv-song-rock-1",
        indexedAssetId: "ktv-asset-rock-1",
        title: "高热度摇滚",
        artistName: "热门歌手",
        styleTags: ["摇滚"]
      })
    ]);
    const { server } = await createHarness({
      ktvIndex,
      playCounts: {
        "ktv-song-pop-1": 1,
        "ktv-song-pop-2": 1,
        "ktv-song-rock-1": 20
      }
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/discovery?seed=fallback-sort&limit=3"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<SongDiscoveryResponse>();
    expect(body.artists.map((artist) => artist.artistName)).toEqual(["多歌歌手", "热门歌手"]);
    expect(body.genres.map((genre) => genre.genre)).toEqual(["流行", "摇滚"]);
  });

  it("loads discovery songs for one artist on demand", async () => {
    const ktvIndex = new FakeKtvIndexReadRepository([]);
    const listIndexedSongsByArtist = vi.fn(async () => [
      createIndexedResult({
        indexedSongId: "ktv-song-artist-detail",
        indexedAssetId: "ktv-asset-artist-detail",
        title: "歌手详情歌",
        artistName: "歌手A",
        styleTags: ["流行"]
      })
    ]);
    Object.assign(ktvIndex, { listIndexedSongsByArtist });

    const { server, queueEntries } = await createHarness({
      ktvIndex,
      playCounts: { "ktv-song-artist-detail": 5 }
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/discovery/artists/artist-a/songs?offset=2&limit=2"
    });

    expect(response.statusCode).toBe(200);
    expect(listIndexedSongsByArtist).toHaveBeenCalledWith({
      artistId: "artist-a",
      limit: 2,
      offset: 2,
      queuedIndexedAssetIds: [],
      unreadableIndexedAssetIds: []
    });
    expect(queueEntries.countCalls).toEqual([["ktv-song-artist-detail"]]);
    expect(response.json()).toMatchObject({
      songs: [
        {
          songId: "ktv-song-artist-detail",
          title: "歌手详情歌",
          artistName: "歌手A",
          playCount: 5,
          versions: [
            expect.objectContaining({
              assetId: "ktv-asset-artist-detail"
            })
          ]
        }
      ],
      nextOffset: null
    });
  });

  it("serves ige8 singers and music styles as discovery modules", async () => {
    const { server } = await createHarness({
      onlineDiscovery: createOnlineDiscovery()
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/discovery?seed=online&limit=3"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      artists: [
        { artistId: "1066", artistName: "周杰伦", songCount: 0 },
        { artistId: "211", artistName: "刀郎", songCount: 0 }
      ],
      genres: [{ genre: "流行", songCount: 0 }, { genre: "摇滚", songCount: 0 }]
    });
  });

  it("returns online songs for an ige8 singer and marks them queueable", async () => {
    const { server } = await createHarness({
      onlineDiscovery: createOnlineDiscovery()
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/discovery/artists/1066/songs?limit=2&offset=0"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      songs: [
        { source: "online", providerSongNumber: "20039643", title: "晴天", artistName: "周杰伦" }
      ],
      nextOffset: null
    });
  });

  it("returns online songs for a music style", async () => {
    const { server } = await createHarness({
      onlineDiscovery: createOnlineDiscovery()
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/discovery/genres/songs?genre=%E6%B5%81%E8%A1%8C&limit=2"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().songs[0]).toMatchObject({
      source: "online",
      providerSongNumber: "20039643",
      genre: ["流行"]
    });
  });

  it("returns empty discovery modules when NAS search is unavailable", async () => {
    const { server } = await createHarness();

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/discovery?seed=empty&limit=3"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      seed: "empty",
      recommended: [],
      artists: [],
      genres: []
    });
  });
});

async function createHarness(input: {
  room?: Room | null;
  ktvIndex?: KtvIndexReadRepository;
  queueEntries?: readonly QueueEntry[];
  playCounts?: Record<string, number>;
  coverEntries?: Record<string, FakeCoverEntry>;
  onlineDiscovery?: {
    discoverySingers(limit: number): Promise<Array<{ singerId: string; singerName: string; mark: string; pictureUrl: string | null }>>;
    discoveryStyles(): Promise<string[]>;
    songsBySinger(input: { singerId: string; page: number; pageSize: number }): Promise<{
      candidates: Array<{
        provider: string;
        providerSongId: string;
        title: string;
        artistName: string;
        durationMs: number | null;
        language: string;
        coverUrl: string | null;
        sourceLabel: string;
        tags: readonly string[];
        metadata: Record<string, unknown>;
      }>;
      pageCount: number;
    }>;
    songsByStyle(input: { style: string; page: number; pageSize: number }): Promise<{
      candidates: Array<{
        provider: string;
        providerSongId: string;
        title: string;
        artistName: string;
        durationMs: number | null;
        language: string;
        coverUrl: string | null;
        sourceLabel: string;
        tags: readonly string[];
        metadata: Record<string, unknown>;
      }>;
      pageCount: number;
    }>;
  };
} = {}) {
  const server = Fastify();
  const queueEntries = new FakeQueueEntryRepository(input.queueEntries ?? [], input.playCounts ?? {});
  const songCovers = new FakeSongCovers(input.coverEntries ?? {});
  await registerSongDiscoveryRoutes(server, {
    rooms: new FakeRoomRepository(input.room === undefined ? createRoom() : input.room),
    queueEntries,
    ...(input.ktvIndex ? { ktvIndex: input.ktvIndex } : {}),
    songCovers,
    ...(input.onlineDiscovery ? { onlineDiscovery: input.onlineDiscovery } : {})
  });
  await server.ready();
  return { server, queueEntries, songCovers };
}

function createOnlineDiscovery() {
  const candidates = [
    {
      provider: "igeba",
      providerSongId: "20039643",
      title: "晴天",
      artistName: "周杰伦",
      durationMs: 269000,
      language: "mandarin",
      coverUrl: null,
      sourceLabel: "在线曲库",
      tags: [] as string[],
      metadata: {}
    }
  ];
  return {
    async discoverySingers() {
      return [
        { singerId: "1066", singerName: "周杰伦", mark: "港台男星", pictureUrl: null },
        { singerId: "211", singerName: "刀郎", mark: "大陆男星", pictureUrl: null }
      ];
    },
    async discoveryStyles() {
      return ["流行", "摇滚"];
    },
    async songsBySinger() {
      return { candidates, pageCount: 1 };
    },
    async songsByStyle() {
      return { candidates, pageCount: 1 };
    }
  };
}

class FakeRoomRepository implements RoomRepository {
  constructor(private readonly room: Room | null) {}

  async findById(roomId: string): Promise<Room | null> {
    return this.room?.id === roomId ? { ...this.room } : null;
  }

  async findBySlug(slug: string): Promise<Room | null> {
    return this.room?.slug === slug ? { ...this.room } : null;
  }
}

class FakeKtvIndexReadRepository implements KtvIndexReadRepository {
  readonly searchCalls: SearchKtvIndexedSongsInput[] = [];

  constructor(private readonly results: readonly SongSearchIndexedResult[]) {}

  async searchIndexedSongs(input: SearchKtvIndexedSongsInput): Promise<SongSearchIndexedResult[]> {
    this.searchCalls.push(input);
    const queued = new Set(input.queuedIndexedAssetIds ?? []);
    return this.results.map((result) => ({
      ...result,
      versions: result.versions.map((version) => ({
        ...version,
        queueState: queued.has(version.indexedAssetId) ? "queued" : version.queueState
      }))
    }));
  }

  async getDiagnostics(): Promise<never> {
    throw new Error("Not implemented");
  }

  async getAdminDashboard(): Promise<never> {
    throw new Error("Not implemented");
  }
}

class FakeQueueEntryRepository implements QueueEntryRepository {
  readonly countCalls: string[][] = [];

  constructor(
    private readonly queueEntries: readonly QueueEntry[],
    private readonly playCounts: Record<string, number>
  ) {}

  async listEffectiveQueue(): Promise<QueueEntry[]> {
    return this.queueEntries.map((entry) => ({ ...entry }));
  }

  async listGlobalSongRequestCounts(songIds: readonly string[]): Promise<Map<string, number>> {
    this.countCalls.push([...songIds]);
    return new Map(songIds.map((songId) => [songId, this.playCounts[songId] ?? 0]));
  }

  async findById(): Promise<QueueEntry | null> {
    return null;
  }

  async listUndoableRemoved(): Promise<QueueEntry[]> {
    return [];
  }

  async findCurrentForRoom(): Promise<QueueEntry | null> {
    return null;
  }

  async append(): Promise<never> {
    throw new Error("Not implemented");
  }

  async markRemoved(): Promise<QueueEntry | null> {
    return null;
  }

  async undoRemoved(): Promise<QueueEntry | null> {
    return null;
  }

  async renumberQueue(): Promise<QueueEntry[]> {
    return [];
  }

  async markCompleted(): Promise<QueueEntry | null> {
    return null;
  }
}

class FakeSongCovers implements Pick<SongCoverRepository, "findBySongKeys"> {
  readonly lookupCalls: SongCoverLookupKey[][] = [];

  constructor(private readonly entries: Record<string, FakeCoverEntry>) {}

  async findBySongKeys(keys: readonly SongCoverLookupKey[]) {
    this.lookupCalls.push([...keys]);
    return new Map(
      keys.flatMap((key) => {
        const entry = this.entries[`${key.source}:${key.sourceSongId}`];
        const cover = typeof entry === "string" ? { imageUrl: entry } : entry;
        return cover
          ? [
              [
                `${key.source}:${key.sourceSongId}`,
                {
                  source: key.source,
                  sourceSongId: key.sourceSongId,
                  imageUrl: cover.imageUrl,
                  ...(cover.thumbnailImageUrl ? { thumbnailImageUrl: cover.thumbnailImageUrl } : {})
                }
              ] as const
            ]
          : [];
      })
    );
  }
}

function createRoom(): Room {
  return {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: now,
    updatedAt: now
  };
}

function createQueueEntry(input: { songId: string; assetId: string }): QueueEntry {
  return {
    id: "queue-1",
    roomId: "living-room",
    source: {
      sourceType: "nas",
      songId: input.songId,
      assetId: input.assetId
    },
    songId: input.songId,
    assetId: input.assetId,
    requestedBy: "phone-1",
    queuePosition: 1,
    status: "queued",
    priority: 0,
    playbackOptions: {
      preferredVocalMode: "instrumental",
      pitchSemitones: 0,
      requireReadyAsset: true
    },
    requestedAt: now,
    startedAt: null,
    endedAt: null,
    removedAt: null,
    removedByControlSessionId: null,
    undoExpiresAt: null
  };
}

function createIndexedResult(input: {
  indexedSongId: string;
  indexedAssetId: string;
  title: string;
  artistName: string;
  styleTags: string[];
  queueState?: "queued" | "not_queued";
}): SongSearchIndexedResult {
  return {
    indexedSongId: input.indexedSongId,
    title: input.title,
    artistName: input.artistName,
    styleTags: input.styleTags,
    category: input.styleTags[0] ?? "其他",
    sourceLabel: "KTV索引",
    matchReason: "title",
    versions: [
      {
        indexedAssetId: input.indexedAssetId,
        displayName: `${input.title}.mkv`,
        sourceLabel: "KTV索引",
        extension: ".mkv",
        sizeBytes: 100,
        audioTrackCount: 2,
        styleTags: input.styleTags,
        category: input.styleTags[0] ?? "其他",
        queueState: input.queueState ?? "not_queued",
        canQueue: true,
        disabledLabel: null
      }
    ]
  };
}
