import type { Asset, ControlSession, PlaybackSession, QueueEntry, Room, Song } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import type { SongRepository } from "../modules/catalog/repositories/song-repository.js";
import { InMemoryControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import {
  QUEUE_DELETE_UNDO_TTL_MS,
  handlePlayerEnded,
  executeRoomCommand
} from "../modules/playback/session-command-service.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import { InMemoryQueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomSessionCommandRecord } from "../modules/playback/repositories/room-session-command-repository.js";
import { buildRoomControlSnapshot } from "../modules/rooms/build-control-snapshot.js";
import type { RoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import type { ApiConfig } from "../config.js";
import { InMemoryRoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { ControlSessionInfo, RoomControlSnapshot } from "@home-ktv/player-contracts";

const now = new Date("2026-05-01T10:00:00.000Z");
type RoomCommandResult = Awaited<ReturnType<typeof executeRoomCommand>>;

describe("room queue commands", () => {
  it("accepts add, delete, undo, promote, and skip validation with command idempotency", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing"), createQueueEntry("queue-queued", 2, "queued")]
    });

    const add = expectAccepted(
      await executeRoomCommand({
      commandId: "command-add",
      roomSlug: harness.room.slug,
      sessionVersion: 1,
      type: "add-queue-entry",
      payload: { songId: "song-ready" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(add.sessionVersion).toBe(2);
    expect(harness.controlSessions.touchCount).toBe(1);
    const addedQueueEntryId = add.snapshot.queue.find((entry) => entry.songId === "song-ready")?.queueEntryId;
    expect(addedQueueEntryId).toBeDefined();

    const deleted = expectAccepted(
      await executeRoomCommand({
      commandId: "command-delete",
      roomSlug: harness.room.slug,
      sessionVersion: 2,
      type: "delete-queue-entry",
      payload: { queueEntryId: "queue-queued" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(deleted.undo).toEqual({
      queueEntryId: "queue-queued",
      undoExpiresAt: new Date(now.getTime() + QUEUE_DELETE_UNDO_TTL_MS).toISOString()
    });
    expect(deleted.snapshot.queue.find((entry) => entry.queueEntryId === "queue-queued")?.status).toBe("removed");

    const undone = expectAccepted(
      await executeRoomCommand({
      commandId: "command-undo",
      roomSlug: harness.room.slug,
      sessionVersion: 3,
      type: "undo-delete-queue-entry",
      payload: { queueEntryId: "queue-queued" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now: new Date(now.getTime() + 5000)
      })
    );

    expect(harness.queueEntries.findById("queue-queued")).resolves.toMatchObject({ status: "queued" });

    const promoted = expectAccepted(
      await executeRoomCommand({
      commandId: "command-promote",
      roomSlug: harness.room.slug,
      sessionVersion: 4,
      type: "promote-queue-entry",
      payload: { queueEntryId: "queue-queued" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(promoted.snapshot.queue.map((entry) => entry.queueEntryId)).toEqual([
      "queue-current",
      "queue-queued",
      addedQueueEntryId
    ]);

    const rejectedSkip = expectRejected(
      await executeRoomCommand({
      commandId: "command-skip",
      roomSlug: harness.room.slug,
      sessionVersion: 5,
      type: "skip-current",
      payload: { confirmSkip: false },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );

    expect(rejectedSkip.code).toBe("SKIP_CONFIRMATION_REQUIRED");
  });

  it("returns duplicate for repeated command ids and conflict for stale versions", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing")]
    });

    const first = expectAccepted(
      await executeRoomCommand({
      commandId: "command-duplicate",
      roomSlug: harness.room.slug,
      sessionVersion: 1,
      type: "add-queue-entry",
      payload: { songId: "song-ready" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    const second = await executeRoomCommand({
      commandId: "command-duplicate",
      roomSlug: harness.room.slug,
      sessionVersion: 1,
      type: "add-queue-entry",
      payload: { songId: "song-ready" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
      config: harness.config,
      now
    });

    expect(second.status).toBe("duplicate");
    expect(harness.controlSessions.touchCount).toBe(1);

    const conflict = expectConflict(
      await executeRoomCommand({
      commandId: "command-conflict",
      roomSlug: harness.room.slug,
      sessionVersion: 1,
      type: "add-queue-entry",
      payload: { songId: "song-ready" },
      controlSession: harness.controlSession,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
        config: harness.config,
        now
      })
    );
    expect(conflict.code).toBe("SESSION_VERSION_CONFLICT");
    expect(conflict.latestSessionVersion).toBe(first.sessionVersion);
  });

  it("includes undoable removed entries in the control snapshot only while they are undoable", async () => {
    const harness = createHarness({
      queueEntries: [
        createQueueEntry("queue-current", 1, "playing"),
        createQueueEntry("queue-queued", 2, "queued"),
        createQueueEntry("queue-removed", 3, "removed", {
          removedAt: "2026-05-01T10:00:05.000Z",
          undoExpiresAt: "2026-05-01T10:00:12.000Z"
        }),
        createQueueEntry("queue-expired", 4, "removed", {
          removedAt: "2026-05-01T09:59:55.000Z",
          undoExpiresAt: "2026-05-01T10:00:01.000Z"
        })
      ]
    });

    const snapshot = await buildRoomControlSnapshot({
      roomSlug: harness.room.slug,
      config: harness.config,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
      now: new Date("2026-05-01T10:00:06.000Z")
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.queue.map((entry) => entry.queueEntryId)).toEqual([
      "queue-current",
      "queue-queued",
      "queue-removed"
    ]);
    expect(snapshot?.queue.find((entry) => entry.queueEntryId === "queue-removed")).toMatchObject({
      status: "removed",
      canDelete: false,
      canPromote: false,
      undoExpiresAt: "2026-05-01T10:00:12.000Z"
    });
    expect(snapshot?.queue.some((entry) => entry.queueEntryId === "queue-expired")).toBe(false);
  });

  it("advances to the next queue entry when TV ended telemetry arrives", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing"), createQueueEntry("queue-queued", 2, "queued")]
    });

    const result = await handlePlayerEnded({
      roomSlug: harness.room.slug,
      deviceId: "tv-1",
      queueEntryId: "queue-current",
      assetId: "asset-current-instrumental",
      playbackPositionMs: 179000,
      sessionVersion: 1,
      playbackEvents: harness.playbackEvents,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
      config: harness.config,
      now
    });

    expect(result.status).toBe("accepted");
    expect(result.snapshot?.currentTarget?.queueEntryId).toBe("queue-queued");
    expect(result.snapshot?.sessionVersion).toBe(2);
  });

  it("returns idle when TV ended telemetry arrives with no next queue entry", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing")]
    });

    const result = await handlePlayerEnded({
      roomSlug: harness.room.slug,
      deviceId: "tv-1",
      queueEntryId: "queue-current",
      assetId: "asset-current-instrumental",
      playbackPositionMs: 179000,
      sessionVersion: 1,
      playbackEvents: harness.playbackEvents,
      repositories: harness.repositories,
      assetGateway: harness.assetGateway,
      config: harness.config,
      now
    });

    expect(result.status).toBe("accepted");
    expect(result.snapshot?.currentTarget).toBeNull();
    expect(result.snapshot?.state).toBe("idle");
  });
});

function createHarness(options: { queueEntries: readonly QueueEntry[] }) {
  const room = createRoom();
  const songs = new Map<string, Song>([
    ["song-current", createSong("song-current", "Current", "Artist A", "asset-current-instrumental")],
    ["song-queued", createSong("song-queued", "Queued", "Artist B", "asset-queued-instrumental")],
    ["song-ready", createSong("song-ready", "Ready Song", "Artist Ready", "asset-ready-instrumental")]
  ]);
  const assets = new Map<string, Asset>([
    ["asset-current-instrumental", createAsset("asset-current-instrumental", "song-current", "instrumental", "family-current")],
    ["asset-current-original", createAsset("asset-current-original", "song-current", "original", "family-current")],
    ["asset-queued-instrumental", createAsset("asset-queued-instrumental", "song-queued", "instrumental", "family-queued")],
    ["asset-queued-original", createAsset("asset-queued-original", "song-queued", "original", "family-queued")],
    ["asset-ready-instrumental", createAsset("asset-ready-instrumental", "song-ready", "instrumental", "family-ready")],
    ["asset-ready-original", createAsset("asset-ready-original", "song-ready", "original", "family-ready")]
  ]);
  const playbackSession = new FakePlaybackSessionRepository({
    roomId: room.id,
    currentQueueEntryId: options.queueEntries.find((entry) => entry.status === "playing")?.id ?? null,
    nextQueueEntryId: null,
    activeAssetId: options.queueEntries.find((entry) => entry.status === "playing")?.assetId ?? null,
    targetVocalMode: "instrumental",
    playerState: options.queueEntries.some((entry) => entry.status === "playing") ? "playing" : "idle",
    playerPositionMs: 0,
    mediaStartedAt: null,
    version: 1,
    updatedAt: now.toISOString()
  });
  const queueEntries = new InMemoryQueueEntryRepository(options.queueEntries);
  const controlSessions = new TrackingControlSessionRepository([
    {
      id: "control-session-1",
      roomId: room.id,
      deviceId: "phone-1",
      deviceName: "Mobile Controller",
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ]);
  const roomPairingTokens = new InMemoryRoomPairingTokenRepository([
    {
      roomId: room.id,
      tokenValue: "token-1",
      tokenHash: "hash-1",
      tokenExpiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      rotatedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ]);
  const commandRepo = new FakeRoomSessionCommandRepository();
  const playbackEvents = new FakePlaybackEventRepository();
  const assetRepository = new FakeAssetRepository(assets);
  const songRepository = new FakeSongRepository(songs);
  const roomRepository = new FakeRoomRepository(room);
  const assetGateway = new AssetGateway({
    assetRepository,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: "/media-root" }),
    publicBaseUrl: "http://ktv.local"
  });
  const config = createConfig();
  const controlSession: ControlSessionInfo = {
    id: "control-session-1",
    roomId: room.id,
    roomSlug: room.slug,
    deviceId: "phone-1",
    deviceName: "Mobile Controller",
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    lastSeenAt: now.toISOString()
  };

  return {
    room,
    queueEntries,
    controlSessions,
    assetRepository,
    songRepository,
    roomRepository,
    assetGateway,
    config,
    controlSession,
    commandRepo,
    playbackEvents,
    repositories: {
      rooms: roomRepository,
      playbackSessions: playbackSession,
      queueEntries,
      assets: assetRepository,
      songs: songRepository,
      pairingTokens: roomPairingTokens,
      controlSessions,
      controlCommands: commandRepo,
      playbackEvents
    }
  };
}

class FakePlaybackSessionRepository implements PlaybackSessionRepository {
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
      mediaStartedAt: input.mediaStartedAt?.toISOString() ?? this.session.mediaStartedAt,
      version: this.session.version + 1,
      updatedAt: new Date(now.getTime() + this.session.version * 1000).toISOString()
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
      nextQueueEntryId: null,
      activeAssetId: null,
      playerState: "idle",
      playerPositionMs: 0,
      mediaStartedAt: null,
      version: this.session.version + 1,
      updatedAt: new Date(now.getTime() + this.session.version * 1000).toISOString()
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
      updatedAt: new Date(now.getTime() + this.session.version * 1000).toISOString()
    };
    return { ...this.session };
  }

  async bumpVersion(roomId: string): Promise<PlaybackSession | null> {
    if (roomId !== this.session.roomId) {
      return null;
    }

    this.session = {
      ...this.session,
      version: this.session.version + 1,
      updatedAt: new Date(now.getTime() + this.session.version * 1000).toISOString()
    };
    return { ...this.session };
  }

  async updatePlayerPosition(): Promise<PlaybackSession | null> {
    return { ...this.session };
  }

  async updatePlaybackFacts(): Promise<PlaybackSession | null> {
    return { ...this.session };
  }
}

class FakeRoomRepository implements RoomRepository {
  constructor(private readonly room: Room) {}

  async findById(roomId: string): Promise<Room | null> {
    return roomId === this.room.id ? { ...this.room } : null;
  }

  async findBySlug(slug: string): Promise<Room | null> {
    return slug === this.room.slug ? { ...this.room } : null;
  }
}

class FakeSongRepository implements SongRepository {
  constructor(private readonly songs: Map<string, Song>) {}

  async findById(songId: string): Promise<Song | null> {
    return this.songs.get(songId) ? { ...this.songs.get(songId)! } : null;
  }
}

class FakeAssetRepository implements AssetRepository {
  constructor(private readonly assets: Map<string, Asset>) {}

  async findById(assetId: string): Promise<Asset | null> {
    const asset = this.assets.get(assetId);
    return asset ? { ...asset } : null;
  }

  async findVerifiedSwitchCounterparts(asset: Asset): Promise<Asset[]> {
    return [...this.assets.values()].filter(
      (candidate) =>
        candidate.songId === asset.songId &&
        candidate.switchFamily === asset.switchFamily &&
        candidate.vocalMode !== asset.vocalMode &&
        candidate.status === "ready" &&
        candidate.switchQualityStatus === "verified"
    );
  }
}

class TrackingControlSessionRepository extends InMemoryControlSessionRepository {
  touchCount = 0;

  async touch(input: Parameters<InMemoryControlSessionRepository["touch"]>[0]) {
    this.touchCount += 1;
    return super.touch(input);
  }
}

class FakeRoomSessionCommandRepository {
  private readonly records = new Map<string, RoomSessionCommandRecord>();

  async findCommand(commandId: string): Promise<RoomSessionCommandRecord | null> {
    return this.records.get(commandId) ?? null;
  }

  async insertCommandAttempt(input: RoomSessionCommandRecord): Promise<RoomSessionCommandRecord> {
    this.records.set(input.commandId, { ...input });
    return { ...input };
  }

  async updateCommandResult(input: { commandId: string; resultStatus: RoomSessionCommandRecord["resultStatus"]; resultPayload?: Record<string, unknown> }) {
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

class FakePlaybackEventRepository {
  async append(): Promise<null> {
    return null;
  }
}

function createConfig(): ApiConfig {
  return {
    corsAllowedOrigins: [],
    databaseUrl: "",
    mediaRoot: "/media-root",
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
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createSong(id: string, title: string, artistName: string, defaultAssetId: string | null): Song {
  return {
    id,
    title,
    normalizedTitle: title,
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
    canonicalDurationMs: 180000,
    searchWeight: 0,
    defaultAssetId,
    capabilities: { canSwitchVocalMode: true },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createAsset(
  id: string,
  songId: string,
  vocalMode: Asset["vocalMode"],
  switchFamily: string
): Asset {
  return {
    id,
    songId,
    sourceType: "local",
    assetKind: "video",
    displayName: id,
    filePath: `${id}.mp4`,
    durationMs: 180000,
    lyricMode: "hard_sub",
    vocalMode,
    status: "ready",
    switchFamily,
    switchQualityStatus: "verified",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createQueueEntry(
  id: string,
  queuePosition: number,
  status: QueueEntry["status"],
  timestamps: { removedAt: string; undoExpiresAt: string } | null = null
): QueueEntry {
  return {
    id,
    roomId: "living-room",
    songId: id === "queue-current" ? "song-current" : "song-queued",
    assetId: id === "queue-current" ? "asset-current-instrumental" : "asset-queued-instrumental",
    requestedBy: "phone-1",
    queuePosition,
    status,
    priority: 0,
    playbackOptions: {
      preferredVocalMode: "instrumental",
      pitchSemitones: 0,
      requireReadyAsset: true
    },
    requestedAt: now.toISOString(),
    startedAt: status === "playing" ? now.toISOString() : null,
    endedAt: null,
    removedAt: timestamps?.removedAt ?? null,
    removedByControlSessionId: timestamps ? "control-session-1" : null,
    undoExpiresAt: timestamps?.undoExpiresAt ?? null
  };
}

function expectAccepted(result: RoomCommandResult): Extract<RoomCommandResult, { status: "accepted" }> {
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") {
    throw new Error(`Expected accepted, got ${result.status}`);
  }

  return result;
}

function expectRejected(result: RoomCommandResult): Extract<RoomCommandResult, { status: "rejected" }> {
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") {
    throw new Error(`Expected rejected, got ${result.status}`);
  }

  return result;
}

function expectConflict(result: RoomCommandResult): Extract<RoomCommandResult, { status: "conflict" }> {
  expect(result.status).toBe("conflict");
  if (result.status !== "conflict") {
    throw new Error(`Expected conflict, got ${result.status}`);
  }

  return result;
}
