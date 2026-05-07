import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { Asset, PlaybackSession, QueueEntry, Room, Song } from "@home-ktv/domain";
import { describe, expect, it, vi } from "vitest";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import type { SongRepository } from "../modules/catalog/repositories/song-repository.js";
import { InMemoryControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import type { ControlSnapshotRepositories } from "../modules/rooms/build-control-snapshot.js";
import { RoomSnapshotBroadcaster, type RoomSnapshotConnection } from "../modules/realtime/room-snapshot-broadcaster.js";
import { registerRealtimeRoutes, MOBILE_REALTIME_RENEW_INTERVAL_MS } from "../routes/realtime.js";
import { registerControlCommandRoutes } from "../routes/control-commands.js";
import { registerPlayerRoutes } from "../routes/player.js";
import { InMemoryRoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { RoomSessionCommandRepository } from "../modules/playback/repositories/room-session-command-repository.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import { InMemoryQueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { PlaybackEventRepository } from "../modules/playback/repositories/playback-event-repository.js";
import type { PlayerDeviceSessionRepository } from "../modules/player/register-player.js";

const now = new Date("2026-05-01T10:00:00.000Z");

describe("realtime room sync", () => {
  it("broadcasts snapshots to room subscribers", async () => {
    const broadcaster = new RoomSnapshotBroadcaster();
    const socket = createSocketSpy();
    broadcaster.subscribe("living-room", socket);

    broadcaster.broadcastRoomSnapshot("living-room", {
      type: "room.control.snapshot",
      roomId: "living-room",
      roomSlug: "living-room",
      sessionVersion: 2,
      state: "playing",
      pairing: createPairing(),
      tvPresence: { online: true, deviceName: "TV", lastSeenAt: now.toISOString(), conflict: null },
      controllers: { onlineCount: 1 },
      currentTarget: null,
      switchTarget: null,
      queue: [],
      notice: null,
      generatedAt: now.toISOString()
    });

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0] ?? "")).toMatchObject({
      type: "room.control.snapshot.updated",
      roomId: "living-room",
      version: 2
    });
  });

  it("validates mobile realtime connections and renews the control session", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const server = await createRealtimeServer(harness);
    const messages: unknown[] = [];
    const socket = await server.injectWS(
      "/rooms/living-room/realtime?deviceId=phone-1&client=mobile",
      {
        headers: {
          cookie: "ktv_control_session=control-session-1"
        }
      },
      {
        onInit: collectJsonMessages(messages)
      }
    );

    await waitFor(() => messages.length >= 1);
    expect(messages[0]).toMatchObject({
      type: "room.control.snapshot.updated"
    });

    await vi.advanceTimersByTimeAsync(30000);
    await waitFor(() => messages.some((message) => isPing(message)));
    expect(messages.some((message) => isPing(message))).toBe(true);

    const touchCountAfterConnect = harness.controlSessions.touchCount;
    await vi.advanceTimersByTimeAsync(MOBILE_REALTIME_RENEW_INTERVAL_MS);
    expect(harness.controlSessions.touchCount).toBeGreaterThan(touchCountAfterConnect);

    socket.close();
    vi.useRealTimers();
    await server.close();
  });

  it("rejects missing or mismatched mobile realtime sessions", async () => {
    const harness = createHarness();
    const server = await createRealtimeServer(harness);

    const missingClosed = await injectClosedWebSocket(server, "/rooms/living-room/realtime?deviceId=phone-1&client=mobile");
    expect(missingClosed).toMatchObject({ code: 1008 });

    const mismatchedClosed = await injectClosedWebSocket(
      server,
      "/rooms/living-room/realtime?deviceId=phone-2&client=mobile",
      {
        headers: {
          cookie: "ktv_control_session=control-session-1"
        }
      }
    );
    expect(mismatchedClosed).toMatchObject({ code: 1008 });

    await server.close();
  });

  it("broadcasts accepted command and player snapshots but not conflicts", async () => {
    const harness = createHarness({
      queueEntries: [createQueueEntry("queue-current", 1, "playing"), createQueueEntry("queue-next", 2, "queued")]
    });
    const server = await createRealtimeServer(harness);
    const messages: unknown[] = [];
    const socket = await server.injectWS(
      "/rooms/living-room/realtime?deviceId=phone-1&client=mobile",
      {
        headers: {
          cookie: "ktv_control_session=control-session-1"
        }
      },
      {
        onInit: collectJsonMessages(messages)
      }
    );

    await waitFor(() => messages.length >= 1);
    messages.length = 0;

    const accepted = await server.inject({
      method: "POST",
      url: "/rooms/living-room/commands/add-queue-entry",
      headers: {
        cookie: "ktv_control_session=control-session-1"
      },
      payload: {
        commandId: "command-add",
        sessionVersion: 1,
        deviceId: "phone-1",
        songId: "song-ready"
      }
    });

    expect(accepted.statusCode).toBe(200);
    await waitFor(() => messages.some((message) => isSnapshotUpdated(message)));
    expect(messages.some((message) => isSnapshotUpdated(message))).toBe(true);
    const broadcastCountAfterAccepted = messages.length;

    const conflict = await server.inject({
      method: "POST",
      url: "/rooms/living-room/commands/add-queue-entry",
      headers: {
        cookie: "ktv_control_session=control-session-1"
      },
      payload: {
        commandId: "command-conflict",
        sessionVersion: 1,
        deviceId: "phone-1",
        songId: "song-ready"
      }
    });

    expect(conflict.statusCode).toBe(409);
    expect(messages.length).toBe(broadcastCountAfterAccepted);

    const heartbeat = await server.inject({
      method: "POST",
      url: "/player/heartbeat",
      payload: {
        roomSlug: "living-room",
        deviceId: "tv-1",
        currentQueueEntryId: "queue-current",
        playbackPositionMs: 1234,
        health: "ok"
      }
    });

    expect(heartbeat.statusCode).toBe(200);
    await waitFor(() => messages.length > broadcastCountAfterAccepted);

    socket.close();
    await server.close();
  });
});

function createSocketSpy(): RoomSnapshotConnection & { sent: string[] } {
  return {
    sent: [] as string[],
    send(message: string) {
      this.sent.push(message);
    },
    on() {
      return this;
    },
    close() {
      return undefined;
    }
  } satisfies RoomSnapshotConnection & { sent: string[] };
}

function createPairing() {
  return {
    roomSlug: "living-room",
    controllerUrl: "http://ktv.local/control",
    qrPayload: "payload",
    token: "token",
    tokenExpiresAt: now.toISOString()
  };
}

function isSnapshotUpdated(message: unknown): boolean {
  return Boolean(message && typeof message === "object" && (message as { type?: string }).type === "room.control.snapshot.updated");
}

function isPing(message: unknown): boolean {
  return Boolean(message && typeof message === "object" && (message as { type?: string }).type === "ping");
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(10);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function waitForClose(socket: any) {
  return await new Promise<{ code: number; reason: string }>((resolve) => {
    socket.on("close", (code: number, reason: Buffer) => {
      resolve({ code, reason: reason.toString() });
    });
  });
}

function collectJsonMessages(messages: unknown[]) {
  return (socket: any) => {
    socket.on("message", (buffer: Buffer) => {
      messages.push(JSON.parse(buffer.toString()));
    });
  };
}

async function injectClosedWebSocket(
  server: FastifyInstance,
  url: string,
  options?: Parameters<FastifyInstance["injectWS"]>[1]
) {
  let closePromise: Promise<{ code: number; reason: string }> | null = null;
  await server.injectWS(url, options, {
    onInit(socket: any) {
      closePromise = waitForClose(socket);
    }
  });
  if (!closePromise) {
    throw new Error("Close listener was not attached");
  }
  return closePromise;
}

async function createRealtimeServer(harness: ReturnType<typeof createHarness>) {
  const server = Fastify();
  await server.register(websocket);
  await registerRealtimeRoutes(server, {
    config: createConfig(),
    repositories: harness.repositories,
    assetGateway: harness.assetGateway,
    broadcaster: harness.broadcaster
  });
  await registerControlCommandRoutes(server, {
    config: createConfig(),
    repositories: harness.repositories,
    assetGateway: harness.assetGateway,
    broadcaster: harness.broadcaster
  });
  await registerPlayerRoutes(server, {
    config: createConfig(),
    repositories: harness.repositories,
    assetGateway: harness.assetGateway,
    broadcaster: harness.broadcaster
  });
  await server.ready();
  return server;
}

function createHarness(options: { queueEntries?: readonly QueueEntry[] } = {}) {
  const room = createRoom();
  const currentTestTime = new Date();
  const songs = new Map<string, Song>([
    ["song-current", createSong("song-current", "Current", "Artist A", "asset-current")],
    ["song-next", createSong("song-next", "Next", "Artist B", "asset-next")],
    ["song-ready", createSong("song-ready", "Ready Song", "Artist Ready", "asset-ready")]
  ]);
  const assets = new Map<string, Asset>([
    ["asset-current", createAsset("asset-current", "song-current", "instrumental", "family-current")],
    ["asset-current-alt", createAsset("asset-current-alt", "song-current", "original", "family-current")],
    ["asset-next", createAsset("asset-next", "song-next", "instrumental", "family-next")],
    ["asset-next-alt", createAsset("asset-next-alt", "song-next", "original", "family-next")],
    ["asset-ready", createAsset("asset-ready", "song-ready", "instrumental", "family-ready")],
    ["asset-ready-alt", createAsset("asset-ready-alt", "song-ready", "original", "family-ready")]
  ]);
  const queueEntries = new InMemoryQueueEntryRepository(
    options.queueEntries ?? [createQueueEntry("queue-current", 1, "playing"), createQueueEntry("queue-next", 2, "queued")]
  );
  const playbackSessions = new FakePlaybackSessionRepository({
    roomId: room.id,
    currentQueueEntryId: "queue-current",
    nextQueueEntryId: "queue-next",
    activeAssetId: "asset-current",
    targetVocalMode: "instrumental",
    playerState: "playing",
    playerPositionMs: 0,
    mediaStartedAt: now.toISOString(),
    version: 1,
    updatedAt: now.toISOString()
  });
  const controlSessions = new TrackingControlSessionRepository([
    {
      id: "control-session-1",
      roomId: room.id,
      deviceId: "phone-1",
      deviceName: "Phone",
      lastSeenAt: currentTestTime.toISOString(),
      expiresAt: new Date(currentTestTime.getTime() + 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: currentTestTime.toISOString(),
      updatedAt: currentTestTime.toISOString()
    }
  ]);
  const roomPairingTokens = new InMemoryRoomPairingTokenRepository([
    {
      roomId: room.id,
      tokenValue: "token",
      tokenHash: "hash",
      tokenExpiresAt: new Date(currentTestTime.getTime() + 15 * 60 * 1000).toISOString(),
      rotatedAt: currentTestTime.toISOString(),
      createdAt: currentTestTime.toISOString(),
      updatedAt: currentTestTime.toISOString()
    }
  ]);
  const broadcaster = new RoomSnapshotBroadcaster();
  const commandRepo = new FakeRoomSessionCommandRepository();
  return {
    room,
    broadcaster,
    assetGateway: new AssetGateway({
      assetRepository: createAssetRepository(assets),
      mediaPathResolver: new MediaPathResolver({ mediaRoot: "/media-root" }),
      publicBaseUrl: "http://ktv.local"
    }),
    controlSessions,
    repositories: {
      rooms: new FakeRoomRepository(room),
      playbackSessions,
      queueEntries,
      assets: createAssetRepository(assets),
      songs: createSongRepository(songs),
      pairingTokens: roomPairingTokens,
      controlSessions,
      controlCommands: commandRepo,
      deviceSessions: new FakeDeviceSessionRepository(),
      playbackEvents: new FakePlaybackEventRepository()
    }
  };
}

function createConfig() {
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

function createSong(id: string, title: string, artistName: string, defaultAssetId: string): Song {
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

function createQueueEntry(id: string, queuePosition: number, status: QueueEntry["status"]): QueueEntry {
  return {
    id,
    roomId: "living-room",
    songId: id === "queue-current" ? "song-current" : "song-next",
    assetId: id === "queue-current" ? "asset-current" : "asset-next",
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
    removedAt: null,
    removedByControlSessionId: null,
    undoExpiresAt: null
  };
}

function createSongRepository(songs: Map<string, Song>): SongRepository {
  return {
    async findById(songId: string) {
      const song = songs.get(songId);
      return song ? { ...song } : null;
    }
  };
}

function createAssetRepository(assets: Map<string, Asset>): AssetRepository {
  return {
    async findById(assetId: string) {
      const asset = assets.get(assetId);
      return asset ? { ...asset } : null;
    },
    async findVerifiedSwitchCounterparts(asset: Asset) {
      return [...assets.values()].filter(
        (candidate) =>
          candidate.songId === asset.songId &&
          candidate.switchFamily === asset.switchFamily &&
          candidate.vocalMode !== asset.vocalMode &&
          candidate.status === "ready" &&
          candidate.switchQualityStatus === "verified"
      );
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

class TrackingControlSessionRepository extends InMemoryControlSessionRepository {
  touchCount = 0;

  async touch(input: Parameters<InMemoryControlSessionRepository["touch"]>[0]) {
    this.touchCount += 1;
    return super.touch(input);
  }
}

class FakeRoomRepository {
  constructor(private readonly room: Room) {}

  async findById(roomId: string): Promise<Room | null> {
    return roomId === this.room.id ? { ...this.room } : null;
  }

  async findBySlug(slug: string): Promise<Room | null> {
    return slug === this.room.slug ? { ...this.room } : null;
  }
}

class FakePlaybackEventRepository implements PlaybackEventRepository {
  async append(): Promise<any> {
    return {
      id: "event-1",
      roomId: "living-room",
      queueEntryId: null,
      eventType: "test",
      eventPayload: {},
      createdAt: now.toISOString()
    };
  }
}

class FakeDeviceSessionRepository implements PlayerDeviceSessionRepository {
  async findActiveTvPlayer(): Promise<null> {
    return null;
  }

  async upsertTvPlayer(input: Parameters<PlayerDeviceSessionRepository["upsertTvPlayer"]>[0]) {
    return {
      id: input.deviceId,
      roomId: input.roomId,
      deviceType: "tv" as const,
      deviceName: input.deviceName,
      lastSeenAt: input.now.toISOString(),
      capabilities: input.capabilities,
      pairingToken: input.pairingToken,
      createdAt: input.now.toISOString(),
      updatedAt: input.now.toISOString()
    };
  }

  async updateTvHeartbeat(): Promise<null> {
    return null;
  }
}

class FakeRoomSessionCommandRepository implements RoomSessionCommandRepository {
  private readonly records = new Map<string, any>();

  async findCommand(commandId: string) {
    return this.records.get(commandId) ?? null;
  }

  async insertCommandAttempt(input: any) {
    const record = {
      ...input,
      createdAt: now.toISOString()
    };
    this.records.set(input.commandId, record);
    return record;
  }

  async updateCommandResult(input: any) {
    const existing = this.records.get(input.commandId);
    if (!existing) {
      return null;
    }

    const updated = { ...existing, resultStatus: input.resultStatus, resultPayload: input.resultPayload ?? {} };
    this.records.set(input.commandId, updated);
    return updated;
  }
}
