import { readFile } from "node:fs/promises";
import type {
  Asset,
  AssetId,
  DeviceSession,
  PlaybackEvent,
  PlaybackSession,
  PlayerState,
  QueueEntry,
  Room,
  Song,
  SongId,
  TrackRoles,
  VocalMode
} from "@home-ktv/domain";
import type { ControlSessionInfo } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import type { ApiConfig } from "../config.js";
import type { QueryExecutor } from "../db/query-executor.js";
import type { AssetRow, SongRow } from "../db/schema.js";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import { PgSongRepository } from "../modules/catalog/repositories/song-repository.js";
import type { SongRepository } from "../modules/catalog/repositories/song-repository.js";
import { InMemoryControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import { ingestPlayerTelemetry } from "../modules/player/telemetry-service.js";
import { buildPlaybackTarget } from "../modules/playback/build-playback-target.js";
import { buildSwitchTarget } from "../modules/playback/build-switch-target.js";
import type { CreatePlaybackEventInput } from "../modules/playback/repositories/playback-event-repository.js";
import { InMemoryQueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import type {
  InsertCommandAttemptInput,
  RoomSessionCommandRecord,
  UpdateCommandResultInput
} from "../modules/playback/repositories/room-session-command-repository.js";
import type { CommandRepositories, CommandExecutionResult } from "../modules/playback/session-command-service.js";
import { executeRoomCommand } from "../modules/playback/session-command-service.js";
import { InMemoryRoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";

const now = new Date("2026-05-13T00:00:00.000Z");
const nowIso = now.toISOString();

describe("real MV playback flow", () => {
  it("real MV playback flow searches queues and builds selected accompaniment target", async () => {
    const searchRepository = createSearchRepository({
      song: createSongRow({ id: "song-real-mv", title: "Real MV", normalized_title: "real mv", default_asset_id: "asset-real-mv" }),
      asset: createRealMvAssetRow()
    });
    const harness = createFlowHarness();

    const search = await searchRepository.searchFormalSongs({ query: "real mv", limit: 10, queuedSongIds: [] });
    expect(search[0]?.versions[0]).toMatchObject({
      assetId: "asset-real-mv",
      canQueue: true,
      queueState: "queueable",
      disabledLabel: null
    });

    const addResult = expectAccepted(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-real-mv",
        songId: "song-real-mv",
        assetId: "asset-real-mv"
      })
    );

    const queueEntry = addResult.snapshot.queue.find((entry) => entry.songId === "song-real-mv");
    expect(queueEntry).toBeDefined();
    await expect(harness.repositories.queueEntries.findById(queueEntry!.queueEntryId)).resolves.toMatchObject({
      playbackOptions: { preferredVocalMode: "instrumental" }
    });

    const playbackTarget = await buildPlaybackTarget({
      roomSlug: harness.room.slug,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway
    });
    expect(playbackTarget).toMatchObject({
      assetId: "asset-real-mv",
      vocalMode: "instrumental",
      selectedTrackRef: { id: "0x1101" }
    });
  });

  it("real MV playback flow builds same-asset switch target and commits original mode", async () => {
    const harness = createFlowHarness();
    const addResult = expectAccepted(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-real-mv",
        songId: "song-real-mv",
        assetId: "asset-real-mv"
      })
    );
    const queueEntryId = addResult.snapshot.currentTarget?.queueEntryId;
    if (!queueEntryId) {
      throw new Error("expected current real MV queue entry");
    }

    const switchTarget = await buildSwitchTarget({
      roomSlug: harness.room.slug,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway
    });

    expect(switchTarget).toMatchObject({
      switchKind: "audio_track",
      fromAssetId: "asset-real-mv",
      toAssetId: "asset-real-mv",
      vocalMode: "original",
      selectedTrackRef: { id: "0x1100" }
    });

    await ingestPlayerTelemetry({
      telemetry: {
        eventType: "playing",
        room: harness.room,
        deviceId: "tv-1",
        sessionVersion: harness.playbackSessions.session.version,
        queueEntryId,
        assetId: "asset-real-mv",
        playbackPositionMs: 32100,
        vocalMode: "original",
        switchFamily: switchTarget?.switchFamily ?? null,
        rollbackAssetId: "asset-real-mv",
        stage: "switch_committed",
        emittedAt: nowIso
      },
      playbackEvents: harness.playbackEvents,
      playbackSessions: harness.playbackSessions,
      queueEntries: harness.repositories.queueEntries
    });

    await expect(harness.repositories.queueEntries.findById(queueEntryId)).resolves.toMatchObject({
      playbackOptions: { preferredVocalMode: "original" }
    });
  });

  it("real MV playback flow leaves unsupported results visible but disabled", async () => {
    const searchRepository = createSearchRepository({
      song: createSongRow({
        id: "song-unsupported-real-mv",
        title: "Unsupported Real MV",
        normalized_title: "unsupported real mv",
        default_asset_id: "asset-unsupported-real-mv"
      }),
      asset: createRealMvAssetRow({
        id: "asset-unsupported-real-mv",
        song_id: "song-unsupported-real-mv",
        compatibility_status: "unsupported"
      })
    });
    const harness = createFlowHarness({
      song: createSong("song-unsupported-real-mv", "Unsupported Real MV", "Artist MV", "asset-unsupported-real-mv"),
      asset: createRealMvAsset({
        id: "asset-unsupported-real-mv",
        songId: "song-unsupported-real-mv",
        compatibilityStatus: "unsupported"
      })
    });

    const search = await searchRepository.searchFormalSongs({ query: "unsupported real mv", limit: 10, queuedSongIds: [] });
    expect(search[0]?.versions[0]).toMatchObject({
      assetId: "asset-unsupported-real-mv",
      canQueue: false,
      queueState: "needs_preprocess",
      disabledLabel: "需预处理"
    });

    const rejected = expectRejected(
      await executeAddQueueEntry(harness, {
        commandId: "command-add-unsupported-real-mv",
        songId: "song-unsupported-real-mv",
        assetId: "asset-unsupported-real-mv"
      })
    );
    expect(rejected.code).toBe("SONG_NOT_QUEUEABLE");
  });

  it("keeps the real MV playback flow regression scoped to playback contracts", async () => {
    const source = await readFile(new URL("./real-mv-playback-flow.test.ts", import.meta.url), "utf8");
    const sourceWithoutGuard = source
      .split("\n")
      .filter((line) => !line.includes("Android TV|transcod|OpenList|download"))
      .join("\n");
    expect(sourceWithoutGuard).not.toMatch(/Android TV|transcod|OpenList|download/i);
  });
});

function createSearchRepository(input: { song: SongRow; asset: AssetRow }): PgSongRepository {
  return new PgSongRepository(new FakeRepositorySearchDb(createRepositorySearchRows(input)));
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
  asset_track_roles: TrackRoles | null;
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

function createRepositorySearchRows(input: { song: SongRow; asset: AssetRow }): RepositorySearchFixtureRow[] {
  return [
    {
      ...input.song,
      score: 800,
      match_reason: "normalized_title",
      asset_id: input.asset.id,
      asset_source_type: input.asset.source_type,
      asset_kind: input.asset.asset_kind,
      asset_display_name: input.asset.display_name,
      asset_duration_ms: input.asset.duration_ms,
      asset_vocal_mode: input.asset.vocal_mode,
      asset_switch_family: input.asset.switch_family,
      asset_updated_at: input.asset.updated_at,
      asset_status: input.asset.status,
      asset_compatibility_status: input.asset.compatibility_status,
      asset_track_roles: input.asset.track_roles,
      asset_playback_profile: input.asset.playback_profile,
      asset_switch_quality_status: input.asset.switch_quality_status,
      family_quality_rank: input.asset.asset_kind === "dual-track-video" || input.asset.asset_kind === "video" ? 2 : 1,
      family_newest_at: input.asset.updated_at
    }
  ];
}

function createFlowHarness(input: { song?: Song; asset?: Asset } = {}) {
  const room = createRoom();
  const song = input.song ?? createSong("song-real-mv", "Real MV", "Artist MV", "asset-real-mv");
  const asset = input.asset ?? createRealMvAsset();
  const songs = new Map<string, Song>([[song.id, song]]);
  const assets = new Map<string, Asset>([[asset.id, asset]]);
  const playbackSessions = new FlowPlaybackSessionRepository({
    roomId: room.id,
    currentQueueEntryId: null,
    nextQueueEntryId: null,
    activeAssetId: null,
    targetVocalMode: "unknown",
    playerState: "idle",
    playerPositionMs: 0,
    mediaStartedAt: null,
    version: 1,
    updatedAt: nowIso
  });
  const queueEntries = new InMemoryQueueEntryRepository();
  const controlSessions = new InMemoryControlSessionRepository([
    {
      id: "control-session-1",
      roomId: room.id,
      deviceId: "phone-1",
      deviceName: "Mobile Controller",
      lastSeenAt: nowIso,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso
    }
  ]);
  const pairingTokens = new InMemoryRoomPairingTokenRepository([
    {
      roomId: room.id,
      tokenValue: "token-1",
      tokenHash: "hash-1",
      tokenExpiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      rotatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    }
  ]);
  const playbackEvents = new FlowPlaybackEventRepository();
  const assetRepository = new FlowAssetRepository(assets);
  const repositories: CommandRepositories = {
    rooms: new FlowRoomRepository(room),
    playbackSessions,
    queueEntries,
    assets: assetRepository,
    songs: new FlowSongRepository(songs),
    pairingTokens,
    controlSessions,
    controlCommands: new FlowCommandRepository(),
    deviceSessions: new FlowDeviceSessionRepository(),
    playbackEvents
  };
  const assetGateway = new AssetGateway({
    assetRepository,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: "/media-root" }),
    publicBaseUrl: "http://ktv.local"
  });

  return {
    room,
    repositories,
    playbackSessions,
    playbackEvents,
    assetGateway,
    config: createConfig(),
    controlSession: {
      id: "control-session-1",
      roomId: room.id,
      roomSlug: room.slug,
      deviceId: "phone-1",
      deviceName: "Mobile Controller",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      lastSeenAt: nowIso
    } satisfies ControlSessionInfo
  };
}

class FlowRoomRepository implements RoomRepository {
  constructor(private readonly room: Room) {}

  async findById(roomId: string): Promise<Room | null> {
    return roomId === this.room.id ? { ...this.room } : null;
  }

  async findBySlug(slug: string): Promise<Room | null> {
    return slug === this.room.slug ? { ...this.room } : null;
  }
}

class FlowSongRepository implements SongRepository {
  constructor(private readonly songs: Map<string, Song>) {}

  async findById(songId: string): Promise<Song | null> {
    const song = this.songs.get(songId);
    return song ? { ...song } : null;
  }
}

class FlowAssetRepository implements AssetRepository {
  constructor(private readonly assets: Map<string, Asset>) {}

  async findById(assetId: string): Promise<Asset | null> {
    const asset = this.assets.get(assetId);
    return asset ? cloneAsset(asset) : null;
  }

  async findVerifiedSwitchCounterparts(asset: Asset): Promise<Asset[]> {
    return [...this.assets.values()]
      .filter(
        (candidate) =>
          candidate.songId === asset.songId &&
          candidate.id !== asset.id &&
          candidate.switchFamily === asset.switchFamily &&
          candidate.vocalMode !== asset.vocalMode &&
          candidate.status === "ready" &&
          candidate.switchQualityStatus === "verified"
      )
      .map(cloneAsset);
  }
}

class FlowPlaybackSessionRepository implements PlaybackSessionRepository {
  constructor(public session: PlaybackSession) {}

  async findByRoomId(roomId: string): Promise<PlaybackSession | null> {
    return roomId === this.session.roomId ? { ...this.session } : null;
  }

  async startQueueEntry(input: Parameters<PlaybackSessionRepository["startQueueEntry"]>[0]): Promise<PlaybackSession | null> {
    if (input.roomId !== this.session.roomId) {
      return null;
    }
    this.session = {
      ...this.session,
      currentQueueEntryId: input.queueEntryId,
      activeAssetId: input.activeAssetId,
      targetVocalMode: input.targetVocalMode ?? this.session.targetVocalMode,
      playerState: input.playerState ?? "playing",
      playerPositionMs: input.playerPositionMs ?? 0,
      nextQueueEntryId: input.nextQueueEntryId ?? null,
      mediaStartedAt: input.mediaStartedAt?.toISOString() ?? null,
      version: this.session.version + 1,
      updatedAt: nowIso
    };
    return { ...this.session };
  }

  async setIdle(roomId: string): Promise<PlaybackSession | null> {
    if (roomId !== this.session.roomId) {
      return null;
    }
    this.session = {
      ...this.session,
      currentQueueEntryId: null,
      activeAssetId: null,
      nextQueueEntryId: null,
      playerState: "idle",
      playerPositionMs: 0,
      mediaStartedAt: null,
      version: this.session.version + 1,
      updatedAt: nowIso
    };
    return { ...this.session };
  }

  async requestSwitchTarget(input: Parameters<PlaybackSessionRepository["requestSwitchTarget"]>[0]): Promise<PlaybackSession | null> {
    if (input.roomId !== this.session.roomId) {
      return null;
    }
    this.session = {
      ...this.session,
      targetVocalMode: input.targetVocalMode,
      playerPositionMs: input.playerPositionMs ?? this.session.playerPositionMs,
      version: this.session.version + 1,
      updatedAt: nowIso
    };
    return { ...this.session };
  }

  async bumpVersion(roomId: string): Promise<PlaybackSession | null> {
    if (roomId !== this.session.roomId) {
      return null;
    }
    this.session = { ...this.session, version: this.session.version + 1, updatedAt: nowIso };
    return { ...this.session };
  }

  async updatePlaybackFacts(input: {
    roomId: string;
    queueEntryId: string;
    activeAssetId: string | null;
    playerState: PlayerState;
    playerPositionMs: number;
    targetVocalMode?: VocalMode;
  }): Promise<PlaybackSession | null> {
    if (input.roomId !== this.session.roomId || input.queueEntryId !== this.session.currentQueueEntryId) {
      return null;
    }
    this.session = {
      ...this.session,
      activeAssetId: input.activeAssetId ?? this.session.activeAssetId,
      targetVocalMode: input.targetVocalMode ?? this.session.targetVocalMode,
      playerState: input.playerState,
      playerPositionMs: input.playerPositionMs,
      version: this.session.version + 1,
      updatedAt: nowIso
    };
    return { ...this.session };
  }
}

class FlowCommandRepository {
  private readonly records = new Map<string, RoomSessionCommandRecord>();

  async findCommand(commandId: string): Promise<RoomSessionCommandRecord | null> {
    return this.records.get(commandId) ?? null;
  }

  async insertCommandAttempt(input: InsertCommandAttemptInput): Promise<RoomSessionCommandRecord> {
    const record: RoomSessionCommandRecord = {
      commandId: input.commandId,
      roomId: input.roomId,
      controlSessionId: input.controlSessionId,
      sessionVersion: input.sessionVersion,
      type: input.type,
      payload: input.payload,
      resultStatus: input.resultStatus,
      resultPayload: input.resultPayload ?? {},
      createdAt: nowIso
    };
    this.records.set(input.commandId, record);
    return { ...record };
  }

  async updateCommandResult(input: UpdateCommandResultInput): Promise<RoomSessionCommandRecord | null> {
    const existing = this.records.get(input.commandId);
    if (!existing) {
      return null;
    }
    const updated: RoomSessionCommandRecord = {
      ...existing,
      resultStatus: input.resultStatus,
      resultPayload: input.resultPayload ?? {}
    };
    this.records.set(input.commandId, updated);
    return { ...updated };
  }
}

class FlowPlaybackEventRepository {
  private readonly events: PlaybackEvent[] = [];

  async append<TPayload extends Record<string, unknown>>(
    input: CreatePlaybackEventInput<TPayload>
  ): Promise<PlaybackEvent<TPayload>> {
    const event: PlaybackEvent<TPayload> = {
      id: `event-${this.events.length + 1}`,
      roomId: input.roomId,
      queueEntryId: input.queueEntryId,
      eventType: input.eventType,
      eventPayload: input.eventPayload,
      createdAt: nowIso
    };
    this.events.push(event as PlaybackEvent);
    return event;
  }

  async listRecentByRoom(roomId: string): Promise<PlaybackEvent[]> {
    return this.events.filter((event) => event.roomId === roomId);
  }
}

class FlowDeviceSessionRepository {
  async findActiveTvPlayer(): Promise<DeviceSession | null> {
    return null;
  }

  async upsertTvPlayer(): Promise<DeviceSession> {
    return createDeviceSession();
  }

  async updateTvHeartbeat(): Promise<null> {
    return null;
  }
}

function executeAddQueueEntry(
  harness: ReturnType<typeof createFlowHarness>,
  input: { commandId: string; songId: string; assetId: string }
): Promise<CommandExecutionResult> {
  return executeRoomCommand({
    commandId: input.commandId,
    roomSlug: harness.room.slug,
    sessionVersion: harness.playbackSessions.session.version,
    type: "add-queue-entry",
    payload: { songId: input.songId, assetId: input.assetId },
    controlSession: harness.controlSession,
    repositories: harness.repositories,
    assetGateway: harness.assetGateway,
    config: harness.config,
    now
  });
}

function expectAccepted(result: CommandExecutionResult): Extract<CommandExecutionResult, { status: "accepted" }> {
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") {
    throw new Error(`Expected accepted, got ${result.status}`);
  }
  return result;
}

function expectRejected(result: CommandExecutionResult): Extract<CommandExecutionResult, { status: "rejected" }> {
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") {
    throw new Error(`Expected rejected, got ${result.status}`);
  }
  return result;
}

function createConfig(): ApiConfig {
  return {
    corsAllowedOrigins: [],
    databaseUrl: "",
    mediaRoot: "/media-root",
    onlineDemoReadyAssetId: "",
    onlineProviderIds: [],
    onlineProviderKillSwitchIds: [],
    publicBaseUrl: "http://ktv.local",
    roomSlug: "living-room",
    port: 4000,
    host: "0.0.0.0",
    scanIntervalMinutes: 360
  };
}

function createRoom(): Room {
  return {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function createSong(id: string, title: string, artistName: string, defaultAssetId: string | null): Song {
  return {
    id,
    title,
    normalizedTitle: title.toLowerCase(),
    titlePinyin: "",
    titleInitials: "",
    artistId: `artist-${id}`,
    artistName,
    language: "mandarin",
    status: "ready",
    genre: [],
    tags: [],
    aliases: [],
    searchHints: [],
    releaseYear: null,
    canonicalDurationMs: 60000,
    searchWeight: 0,
    defaultAssetId,
    capabilities: { canSwitchVocalMode: true },
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function createRealMvAsset(input: Partial<Asset> = {}): Asset {
  return {
    id: "asset-real-mv",
    songId: "song-real-mv",
    sourceType: "local",
    assetKind: "dual-track-video",
    displayName: "Real MV",
    filePath: "real-mv.mkv",
    durationMs: 60000,
    lyricMode: "hard_sub",
    vocalMode: "dual",
    status: "ready",
    switchFamily: null,
    switchQualityStatus: "verified",
    compatibilityStatus: "playable",
    trackRoles: createTrackRoles(),
    playbackProfile: {
      kind: "single_file_audio_tracks",
      container: "matroska",
      videoCodec: "h264",
      audioCodecs: ["aac", "aac"],
      requiresAudioTrackSelection: true
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    ...input
  };
}

function createSongRow(input: Partial<SongRow> = {}): SongRow {
  return {
    id: "song-real-mv" as SongId,
    title: "Real MV",
    normalized_title: "real mv",
    title_pinyin: "realmv",
    title_initials: "rmv",
    artist_id: "artist-real-mv",
    artist_name: "Artist MV",
    artist_pinyin: "artistmv",
    artist_initials: "am",
    language: "mandarin",
    status: "ready",
    genre: [],
    tags: [],
    aliases: [],
    search_hints: [],
    release_year: null,
    canonical_duration_ms: 60000,
    search_weight: 10,
    default_asset_id: "asset-real-mv" as AssetId,
    created_at: now,
    updated_at: now,
    ...input
  };
}

function createRealMvAssetRow(input: Partial<AssetRow> = {}): AssetRow {
  return {
    id: "asset-real-mv",
    song_id: "song-real-mv",
    source_type: "local",
    asset_kind: "dual-track-video",
    display_name: "Real MV",
    file_path: "/media/real-mv.mkv",
    duration_ms: 60000,
    lyric_mode: "hard_sub",
    vocal_mode: "dual",
    status: "ready",
    switch_family: null,
    switch_quality_status: "verified",
    compatibility_status: "playable",
    compatibility_reasons: [],
    media_info_summary: {
      container: "matroska",
      durationMs: 60000,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 1024,
      audioTracks: []
    },
    media_info_provenance: {
      source: "ffprobe",
      sourceVersion: "8.1",
      probedAt: nowIso,
      importedFrom: "/imports/real-mv.mkv"
    },
    track_roles: createTrackRoles(),
    playback_profile: {
      kind: "single_file_audio_tracks",
      container: "matroska",
      videoCodec: "h264",
      audioCodecs: ["aac", "aac"],
      requiresAudioTrackSelection: true
    },
    created_at: now,
    updated_at: now,
    ...input
  };
}

function createTrackRoles(): TrackRoles {
  return {
    original: { index: 0, id: "0x1100", label: "Original" },
    instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
  };
}

function cloneAsset(asset: Asset): Asset {
  return JSON.parse(JSON.stringify(asset)) as Asset;
}

function createDeviceSession(): DeviceSession {
  return {
    id: "tv-1",
    roomId: "living-room",
    deviceType: "tv",
    deviceName: "Living Room TV",
    lastSeenAt: nowIso,
    capabilities: {},
    pairingToken: "token-1",
    createdAt: nowIso,
    updatedAt: nowIso
  };
}
