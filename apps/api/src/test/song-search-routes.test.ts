import Fastify from "fastify";
import type { AssetId, QueueEntry, Room, SongId, SongSearchVersionOption, TrackRoles } from "@home-ktv/domain";
import type { QueryExecutor } from "../db/query-executor.js";
import type { AssetRow, SongRow } from "../db/schema.js";
import type {
  AdminCatalogSongRepository,
  SearchFormalSongsInput,
  SearchFormalSongRecord
} from "../modules/catalog/repositories/song-repository.js";
import { PgSongRepository } from "../modules/catalog/repositories/song-repository.js";
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
              isRecommended: true,
              queueState: "queueable",
              canQueue: true,
              disabledLabel: null
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

  it("returns ready playable real-MV songs as queueable search versions", async () => {
    const { server } = await createRepositoryHarness({
      rows: createRepositorySearchRows({
        song: createSongRow({
          id: "song-real-mv",
          title: "后来",
          normalized_title: "后来",
          title_pinyin: "houlai",
          title_initials: "hl",
          default_asset_id: "asset-real-mv"
        }),
        assets: [
          createRealMvAssetRow({
            id: "asset-real-mv",
            track_roles: createReviewedTrackRoles()
          })
        ]
      })
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=%E5%90%8E%E6%9D%A5"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().local[0]?.versions[0]).toMatchObject({
      assetId: "asset-real-mv",
      canQueue: true,
      queueState: "queueable",
      qualityLabel: expect.stringContaining("dual-track-video"),
      disabledLabel: null
    });
  });

  it("returns unsupported real-MV songs as preprocess-required disabled versions", async () => {
    const { server } = await createRepositoryHarness({
      rows: createRepositorySearchRows({
        song: createSongRow({
          id: "song-unsupported-real-mv",
          title: "不能播的歌",
          normalized_title: "不能播的歌",
          default_asset_id: "asset-unsupported-real-mv"
        }),
        assets: [
          createRealMvAssetRow({
            id: "asset-unsupported-real-mv",
            compatibility_status: "unsupported",
            track_roles: createReviewedTrackRoles()
          })
        ]
      })
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=%E4%B8%8D%E8%83%BD%E6%92%AD%E7%9A%84%E6%AD%8C"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().local[0]?.versions[0]).toMatchObject({
      assetId: "asset-unsupported-real-mv",
      canQueue: false,
      queueState: "needs_preprocess",
      disabledLabel: "需预处理"
    });
  });

  it("returns review-required real-MV songs missing instrumental roles as disabled versions", async () => {
    const { server } = await createRepositoryHarness({
      rows: createRepositorySearchRows({
        song: createSongRow({
          id: "song-missing-role-real-mv",
          title: "缺伴奏的歌",
          normalized_title: "缺伴奏的歌",
          default_asset_id: "asset-missing-role-real-mv"
        }),
        assets: [
          createRealMvAssetRow({
            id: "asset-missing-role-real-mv",
            compatibility_status: "review_required",
            switch_quality_status: "review_required",
            track_roles: {
              original: { index: 0, id: "track-original", label: "原声" },
              instrumental: null
            }
          })
        ]
      })
    });

    const response = await server.inject({
      method: "GET",
      url: "/rooms/living-room/songs/search?q=%E7%BC%BA%E4%BC%B4%E5%A5%8F%E7%9A%84%E6%AD%8C"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().local[0]?.versions[0]).toMatchObject({
      assetId: "asset-missing-role-real-mv",
      canQueue: false,
      queueState: "missing_track_role",
      disabledLabel: "缺少伴唱声轨"
    });
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

  await registerSongSearchRoutes(server, {
    rooms,
    songs,
    queueEntries,
    ...(input.online ? { online: input.online } : {})
  });

  return { server, rooms, songs, queueEntries };
}

async function createRepositoryHarness(input: { rows: RepositorySearchFixtureRow[] }) {
  const server = Fastify({ logger: false });
  const rooms = new FakeRoomRepository(createRoom());
  const songs = new PgSongRepository(new FakeRepositorySearchDb(input.rows));
  const queueEntries = new FakeQueueEntryRepository([]);

  await registerSongSearchRoutes(server, {
    rooms,
    songs,
    queueEntries
  });

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
    queueState: "queueable",
    canQueue: true,
    disabledLabel: null,
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

interface RepositorySearchFixtureRow extends SongRow {
  score: number;
  match_reason: string;
  asset_id: string;
  asset_source_type: string;
  asset_kind: string;
  asset_display_name: string;
  asset_duration_ms: number;
  asset_vocal_mode: string;
  asset_switch_family: string | null;
  asset_updated_at: Date;
  asset_status: string;
  asset_compatibility_status: string;
  asset_track_roles: TrackRoles;
  asset_playback_profile: AssetRow["playback_profile"];
  asset_switch_quality_status: string;
  family_quality_rank: number;
  family_newest_at: Date;
}

class FakeRepositorySearchDb implements QueryExecutor {
  constructor(private readonly rows: RepositorySearchFixtureRow[]) {}

  async query<TRow>(text: string): Promise<{ rows: TRow[] }> {
    if (text.includes("WHERE (artist_pinyin = '' OR artist_initials = '')")) {
      return { rows: [] };
    }
    if (text.includes("FROM songs s")) {
      return { rows: this.rows as TRow[] };
    }
    return { rows: [] };
  }
}

function createRepositorySearchRows(input: { song?: SongRow; assets?: AssetRow[] } = {}): RepositorySearchFixtureRow[] {
  const song = input.song ?? createSongRow();
  const assets = input.assets ?? [createRealMvAssetRow()];

  return assets.map((asset) => ({
    ...song,
    score: 800,
    match_reason: "normalized_title",
    asset_id: asset.id,
    asset_source_type: asset.source_type,
    asset_kind: asset.asset_kind,
    asset_display_name: asset.display_name,
    asset_duration_ms: asset.duration_ms,
    asset_vocal_mode: asset.vocal_mode,
    asset_switch_family: asset.switch_family,
    asset_updated_at: asset.updated_at,
    asset_status: asset.status,
    asset_compatibility_status: asset.compatibility_status,
    asset_track_roles: asset.track_roles,
    asset_playback_profile: asset.playback_profile,
    asset_switch_quality_status: asset.switch_quality_status,
    family_quality_rank: asset.asset_kind === "video" || asset.asset_kind === "dual-track-video" ? 2 : 1,
    family_newest_at: asset.updated_at
  }));
}

function createSongRow(input: Partial<SongRow> = {}): SongRow {
  return {
    id: "song-qilixiang" as SongId,
    title: "七里香",
    normalized_title: "七里香",
    title_pinyin: "qilixiang",
    title_initials: "qlx",
    artist_id: "artist-jay",
    artist_name: "周杰伦",
    artist_pinyin: "zhoujielun",
    artist_initials: "zjl",
    language: "mandarin",
    status: "ready",
    genre: [],
    tags: [],
    aliases: [],
    search_hints: [],
    release_year: 2004,
    canonical_duration_ms: 180000,
    search_weight: 10,
    default_asset_id: "asset-main" as AssetId,
    created_at: new Date(now),
    updated_at: new Date(now),
    ...input
  };
}

function createRealMvAssetRow(input: Partial<AssetRow> = {}): AssetRow {
  return {
    id: "asset-real-mv",
    song_id: "song-real-mv",
    source_type: "local",
    asset_kind: "dual-track-video",
    display_name: "真实 MV",
    file_path: "/media/real-mv.mkv",
    duration_ms: 180000,
    lyric_mode: "hard_sub",
    vocal_mode: "dual",
    status: "ready",
    switch_family: null,
    switch_quality_status: "verified",
    compatibility_status: "playable",
    compatibility_reasons: [],
    media_info_summary: {
      container: "matroska",
      durationMs: 180000,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 1024,
      audioTracks: []
    },
    media_info_provenance: {
      source: "ffprobe",
      sourceVersion: "8.1",
      probedAt: now,
      importedFrom: "/imports/real-mv.mkv"
    },
    track_roles: createReviewedTrackRoles(),
    playback_profile: {
      kind: "single_file_audio_tracks",
      container: "matroska",
      videoCodec: "h264",
      audioCodecs: ["aac", "aac"],
      requiresAudioTrackSelection: true
    },
    created_at: new Date(now),
    updated_at: new Date(now),
    ...input
  };
}

function createReviewedTrackRoles(): TrackRoles {
  return {
    original: { index: 0, id: "track-original", label: "原声" },
    instrumental: { index: 1, id: "track-instrumental", label: "伴唱" }
  };
}
