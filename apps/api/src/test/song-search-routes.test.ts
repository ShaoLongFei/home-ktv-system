import Fastify from "fastify";
import type { QueueEntry, Room, SongSearchVersionOption } from "@home-ktv/domain";
import type {
  AdminCatalogSongRepository,
  SearchFormalSongsInput,
  SearchFormalSongRecord
} from "../modules/catalog/repositories/song-repository.js";
import type { CandidateTaskService } from "../modules/online/candidate-task-service.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import { registerSongSearchRoutes } from "../routes/song-search.js";
import { describe, expect, it, vi } from "vitest";

const now = new Date("2026-05-07T00:00:00.000Z").toISOString();

describe("song search routes", () => {
  it("returns ROOM_NOT_FOUND for missing rooms", async () => {
    const { server } = await createHarness({ room: null });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/missing/songs/search?q=七里香"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: "ROOM_NOT_FOUND" });
  });

  it("accepts an empty query and forwards default limit with queued song ids", async () => {
    const { server, songs } = await createHarness({
      queueEntries: [createQueueEntry({ songId: "song-qilixiang" })]
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search"
    });

    expect(response.statusCode).toBe(200);
    expect(songs.searchCalls[0]).toEqual({
      query: "",
      limit: 30,
      queuedSongIds: ["song-qilixiang"]
    });
  });

  it("forwards non-empty search params and returns local results plus disabled online placeholder", async () => {
    const { server, songs } = await createHarness({
      searchResults: [
        createSearchRecord({
          queueState: "queued",
          versions: [createVersion({ assetId: "asset-main", isRecommended: true })]
        })
      ],
      queueEntries: [createQueueEntry({ songId: "song-qilixiang" })]
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=%E4%B8%83%E9%87%8C%E9%A6%99&limit=20"
    });

    expect(response.statusCode).toBe(200);
    expect(songs.searchCalls[0]).toEqual({
      query: "七里香",
      limit: 20,
      queuedSongIds: ["song-qilixiang"]
    });
    expect(response.json()).toEqual({
      query: "七里香",
      local: [
        {
          songId: "song-qilixiang",
          title: "七里香",
          artistName: "周杰伦",
          language: "mandarin",
          matchReason: "title",
          queueState: "queued",
          versions: [
            {
              assetId: "asset-main",
              displayName: "本地版本",
              sourceType: "local",
              sourceLabel: "本地",
              durationMs: 180000,
              qualityLabel: "video / 180s",
              isRecommended: true
            }
          ]
        }
      ],
      online: {
        status: "disabled",
        message: "本地未入库，补歌功能后续可用",
        requestSupplement: {
          visible: false,
          label: "请求补歌"
        },
        candidates: []
      }
    });
  });

  it("returns online candidates below local results and exposes them when local search is empty", async () => {
    const online = new FakeCandidateTaskService([
      {
        provider: "demo-provider",
        providerCandidateId: "remote-qilixiang",
        title: "七里香",
        artistName: "周杰伦",
        sourceLabel: "Demo Provider",
        durationMs: 180000,
        candidateType: "mv",
        reliabilityLabel: "high",
        riskLabel: "normal",
        taskState: "discovered",
        taskId: "task-1"
      }
    ]);
    const localHarness = await createHarness({
      searchResults: [createSearchRecord()],
      online
    });
    const emptyHarness = await createHarness({ searchResults: [], online });

    const localResponse = await localHarness.server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=%E4%B8%83%E9%87%8C%E9%A6%99"
    });
    const emptyResponse = await emptyHarness.server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=%E6%B2%A1%E6%9C%89%E7%9A%84%E6%AD%8C"
    });

    expect(localResponse.statusCode).toBe(200);
    expect(localResponse.json().local).toHaveLength(1);
    expect(localResponse.json().online).toMatchObject({
      status: "available",
      requestSupplement: { visible: false, label: "请求补歌" },
      candidates: [
        {
          title: "七里香",
          artistName: "周杰伦",
          sourceLabel: "Demo Provider",
          durationMs: 180000,
          candidateType: "mv",
          reliabilityLabel: "high",
          riskLabel: "normal"
        }
      ]
    });
    expect(emptyResponse.json().local).toEqual([]);
    expect(emptyResponse.json().online.requestSupplement.visible).toBe(true);
    expect(emptyResponse.json().online.candidates).toHaveLength(1);
  });

  it("clamps limit to the Phase 4 maximum", async () => {
    const { server, songs } = await createHarness();

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=jay&limit=999"
    });

    expect(response.statusCode).toBe(200);
    expect(songs.searchCalls[0]?.limit).toBe(50);
  });
});

async function createHarness(input: {
  room?: Room | null;
  searchResults?: SearchFormalSongRecord[];
  queueEntries?: QueueEntry[];
  online?: Pick<CandidateTaskService, "discoverCandidates">;
} = {}) {
  const server = Fastify({ logger: false });
  const rooms = new FakeRoomRepository(input.room === undefined ? createRoom() : input.room);
  const songs = new FakeSongRepository(input.searchResults ?? []);
  const queueEntries = new FakeQueueEntryRepository(input.queueEntries ?? []);

  await registerSongSearchRoutes(server, { rooms, songs, queueEntries, online: input.online });

  return { server, rooms, songs, queueEntries };
}

class FakeCandidateTaskService implements Pick<CandidateTaskService, "discoverCandidates"> {
  constructor(private readonly candidates: Awaited<ReturnType<CandidateTaskService["discoverCandidates"]>>) {}

  async discoverCandidates() {
    return this.candidates;
  }
}

class FakeRoomRepository implements RoomRepository {
  constructor(private readonly room: Room | null) {}

  async findById(roomId: string): Promise<Room | null> {
    return this.room?.id === roomId ? this.room : null;
  }

  async findBySlug(slug: string): Promise<Room | null> {
    return this.room?.slug === slug ? this.room : null;
  }
}

class FakeSongRepository implements AdminCatalogSongRepository {
  readonly searchFormalSongs = vi.fn(async (input: SearchFormalSongsInput) => {
    this.searchCalls.push(input);
    return this.results;
  });

  readonly searchCalls: SearchFormalSongsInput[] = [];

  constructor(private readonly results: SearchFormalSongRecord[]) {}

  async listFormalSongs() {
    return [];
  }

  async getFormalSongWithAssets() {
    return null;
  }

  async updateSongMetadata() {
    return null;
  }

  async updateDefaultAsset() {
    return null;
  }

  async updateSongStatus() {
    return null;
  }
}

class FakeQueueEntryRepository implements QueueEntryRepository {
  constructor(private readonly queueEntries: QueueEntry[]) {}

  async findById() {
    return null;
  }

  async listEffectiveQueue() {
    return this.queueEntries;
  }

  async listUndoableRemoved() {
    return [];
  }

  async findCurrentForRoom() {
    return null;
  }

  async append() {
    return this.queueEntries[0] ?? createQueueEntry({ songId: "song-qilixiang" });
  }

  async markRemoved() {
    return null;
  }

  async undoRemoved() {
    return null;
  }

  async renumberQueue() {
    return this.queueEntries;
  }

  async markCompleted() {
    return null;
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

function createSearchRecord(input: Partial<SearchFormalSongRecord> = {}): SearchFormalSongRecord {
  return {
    song: {
      id: "song-qilixiang",
      title: "七里香",
      normalizedTitle: "七里香",
      titlePinyin: "qilixiang",
      titleInitials: "qlx",
      artistId: "artist-jay",
      artistName: "周杰伦",
      language: "mandarin",
      status: "ready",
      genre: [],
      tags: [],
      aliases: [],
      searchHints: [],
      releaseYear: 2004,
      canonicalDurationMs: 180000,
      searchWeight: 10,
      defaultAssetId: "asset-main",
      capabilities: { canSwitchVocalMode: true },
      createdAt: now,
      updatedAt: now
    },
    matchReason: "title",
    score: 1000,
    queueState: "not_queued",
    versions: [createVersion()],
    ...input
  };
}

function createVersion(input: Partial<SongSearchVersionOption> = {}): SongSearchVersionOption {
  return {
    assetId: "asset-main",
    displayName: "本地版本",
    sourceType: "local",
    sourceLabel: "本地",
    durationMs: 180000,
    qualityLabel: "video / 180s",
    isRecommended: true,
    ...input
  };
}

function createQueueEntry(input: { songId: string }): QueueEntry {
  return {
    id: `queue-${input.songId}`,
    roomId: "living-room",
    songId: input.songId,
    assetId: "asset-main",
    requestedBy: "control-session",
    queuePosition: 1,
    status: "queued",
    priority: 0,
    playbackOptions: {
      preferredVocalMode: null,
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
