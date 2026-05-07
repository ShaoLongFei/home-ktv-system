import Fastify from "fastify";
import type { Asset, PlaybackEvent, PlaybackSession, QueueEntry, Room, Song } from "@home-ktv/domain";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import { InMemoryControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import type { PlayerDeviceSessionRepository } from "../modules/player/register-player.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import { InMemoryRoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import { registerPlayerRoutes } from "../routes/player.js";
import { describe, expect, it, vi } from "vitest";

const now = new Date("2026-05-07T00:00:00.000Z");

describe("player failure recovery", () => {
  it("skips failed playback directly to the next queue entry and broadcasts the recovery notice", async () => {
    const harness = createHarness();
    const server = Fastify({ logger: false });
    await registerPlayerRoutes(server, {
      config: harness.config,
      repositories: harness.repositories as never,
      assetGateway: harness.assetGateway,
      broadcaster: harness.broadcaster as never
    });

    const response = await server.inject({
      method: "POST",
      url: "/player/telemetry",
      payload: {
        roomSlug: "living-room",
        eventType: "failed",
        deviceId: "tv-1",
        sessionVersion: 1,
        queueEntryId: "queue-current",
        assetId: "asset-current",
        playbackPositionMs: 45_000,
        vocalMode: "instrumental",
        errorCode: "MEDIA_DECODE",
        message: "Media decode failed"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      status: "ok",
      fallbackResult: "skipped_to_next",
      failureCause: "MEDIA_DECODE",
      snapshot: {
        currentTarget: {
          queueEntryId: "queue-next",
          assetId: "asset-next"
        },
        notice: {
          kind: "playback_failed_skipped"
        }
      }
    });
    expect(body.snapshot.notice.message).toContain("MEDIA_DECODE");
    expect(body.snapshot.notice.message).toContain("Skipped to next song");
    await expect(harness.queueEntries.findById("queue-current")).resolves.toMatchObject({ status: "failed" });
    await expect(harness.queueEntries.findById("queue-next")).resolves.toMatchObject({ status: "loading" });
    expect(harness.playbackEvents.events).toHaveLength(1);
    expect(harness.playbackEvents.events[0]).toMatchObject({
      eventType: "failed",
      eventPayload: {
        errorCode: "MEDIA_DECODE",
        fallbackResult: "skipped_to_next"
      }
    });
    expect(harness.broadcaster.broadcastRoomSnapshot).toHaveBeenCalledWith(
      "living-room",
      expect.objectContaining({
        currentTarget: expect.objectContaining({ queueEntryId: "queue-next" }),
        notice: expect.objectContaining({
          kind: "playback_failed_skipped",
          message: expect.stringContaining("MEDIA_DECODE")
        })
      })
    );
  });
});

function createHarness() {
  const room: Room = {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const songs = new Map<string, Song>([
    ["song-current", createSong("song-current", "Current Song", "Artist A", "asset-current")],
    ["song-next", createSong("song-next", "Next Song", "Artist B", "asset-next")]
  ]);
  const assets = new Map<string, Asset>([
    ["asset-current", createAsset("asset-current", "song-current")],
    ["asset-next", createAsset("asset-next", "song-next")]
  ]);
  const queueEntries = new FakeQueueEntryRepository([
    createQueueEntry("queue-current", "song-current", "asset-current", 1, "playing"),
    createQueueEntry("queue-next", "song-next", "asset-next", 2, "queued")
  ]);
  const playbackSessions = new FakePlaybackSessionRepository({
    roomId: room.id,
    currentQueueEntryId: "queue-current",
    nextQueueEntryId: "queue-next",
    activeAssetId: "asset-current",
    targetVocalMode: "instrumental",
    playerState: "playing",
    playerPositionMs: 45_000,
    mediaStartedAt: now.toISOString(),
    version: 1,
    updatedAt: now.toISOString()
  });
  const assetRepository = {
    findById: vi.fn(async (assetId: string) => assets.get(assetId) ?? null),
    findVerifiedSwitchCounterparts: vi.fn(async () => [])
  };
  const assetGateway = new AssetGateway({
    assetRepository,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: "/media-root" }),
    publicBaseUrl: "http://ktv.local"
  });
  const playbackEvents = new FakePlaybackEventRepository();

  return {
    config: {
      corsAllowedOrigins: [],
      databaseUrl: "",
      mediaRoot: "/media-root",
      publicBaseUrl: "http://ktv.local",
      roomSlug: "living-room",
      port: 4000,
      host: "0.0.0.0",
      scanIntervalMinutes: 360
    },
    assetGateway,
    queueEntries,
    playbackEvents,
    broadcaster: {
      broadcastRoomSnapshot: vi.fn()
    },
    repositories: {
      rooms: {
        findBySlug: vi.fn(async (slug: string) => (slug === room.slug ? room : null)),
        findById: vi.fn(async (roomId: string) => (roomId === room.id ? room : null))
      },
      playbackSessions,
      queueEntries,
      assets: assetRepository,
      songs: {
        findById: vi.fn(async (songId: string) => songs.get(songId) ?? null)
      },
      pairingTokens: new InMemoryRoomPairingTokenRepository([
        {
          roomId: room.id,
          tokenValue: "token-1",
          tokenHash: "hash-1",
          tokenExpiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
          rotatedAt: now.toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        }
      ]),
      deviceSessions: new FakeDeviceSessionRepository(),
      playbackEvents,
      controlSessions: new InMemoryControlSessionRepository(),
      controlCommands: {} as never
    }
  };
}

class FakePlaybackSessionRepository implements PlaybackSessionRepository {
  constructor(private session: PlaybackSession) {}

  async findByRoomId(roomId: string): Promise<PlaybackSession | null> {
    return roomId === this.session.roomId ? { ...this.session } : null;
  }

  async startQueueEntry(input: Parameters<PlaybackSessionRepository["startQueueEntry"]>[0]): Promise<PlaybackSession | null> {
    this.session = {
      ...this.session,
      currentQueueEntryId: input.queueEntryId,
      activeAssetId: input.activeAssetId,
      targetVocalMode: input.targetVocalMode ?? this.session.targetVocalMode,
      playerState: input.playerState ?? this.session.playerState,
      playerPositionMs: input.playerPositionMs ?? 0,
      nextQueueEntryId: input.nextQueueEntryId ?? null,
      mediaStartedAt: input.mediaStartedAt?.toISOString() ?? null,
      version: this.session.version + 1,
      updatedAt: now.toISOString()
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
      updatedAt: now.toISOString()
    };
    return { ...this.session };
  }

  async requestSwitchTarget(): Promise<PlaybackSession | null> {
    return { ...this.session };
  }

  async bumpVersion(): Promise<PlaybackSession | null> {
    this.session = { ...this.session, version: this.session.version + 1 };
    return { ...this.session };
  }

  async updatePlayerPosition(): Promise<PlaybackSession | null> {
    return { ...this.session };
  }

  async updatePlaybackFacts(): Promise<PlaybackSession | null> {
    return { ...this.session };
  }
}

class FakeQueueEntryRepository {
  private readonly entries: QueueEntry[];

  constructor(entries: QueueEntry[]) {
    this.entries = entries;
  }

  async findById(queueEntryId: string): Promise<QueueEntry | null> {
    return this.entries.find((entry) => entry.id === queueEntryId) ?? null;
  }

  async listEffectiveQueue(): Promise<QueueEntry[]> {
    return this.entries.filter((entry) => ["queued", "preparing", "loading", "playing"].includes(entry.status));
  }

  async listUndoableRemoved(): Promise<QueueEntry[]> {
    return [];
  }

  async findCurrentForRoom(): Promise<QueueEntry | null> {
    return this.findById("queue-current");
  }

  async append(): Promise<QueueEntry | null> {
    return null;
  }

  async markRemoved(): Promise<QueueEntry | null> {
    return null;
  }

  async undoRemoved(): Promise<QueueEntry | null> {
    return null;
  }

  async renumberQueue(): Promise<QueueEntry[]> {
    return this.entries;
  }

  async markCompleted(input: { queueEntryId: string; status: QueueEntry["status"]; endedAt: Date }): Promise<QueueEntry | null> {
    const entry = await this.findById(input.queueEntryId);
    if (!entry) {
      return null;
    }
    entry.status = input.status;
    entry.endedAt = input.endedAt.toISOString();
    return { ...entry };
  }

  async markPlaybackState(input: { queueEntryId: string; status: "loading" | "playing"; startedAt: Date }): Promise<QueueEntry | null> {
    const entry = await this.findById(input.queueEntryId);
    if (!entry) {
      return null;
    }
    entry.status = input.status;
    entry.startedAt = input.startedAt.toISOString();
    return { ...entry };
  }
}

class FakePlaybackEventRepository {
  readonly events: PlaybackEvent[] = [];

  async append(input: {
    roomId: string;
    queueEntryId: string | null;
    eventType: string;
    eventPayload: Record<string, unknown>;
  }): Promise<PlaybackEvent> {
    const event: PlaybackEvent = {
      id: `event-${this.events.length + 1}`,
      roomId: input.roomId,
      queueEntryId: input.queueEntryId,
      eventType: input.eventType,
      eventPayload: input.eventPayload,
      createdAt: now.toISOString()
    };
    this.events.push(event);
    return event;
  }
}

class FakeDeviceSessionRepository implements PlayerDeviceSessionRepository {
  async findActiveTvPlayer() {
    return {
      id: "tv-1",
      roomId: "living-room",
      deviceType: "tv",
      deviceName: "Living Room TV",
      lastSeenAt: now.toISOString(),
      capabilities: {},
      pairingToken: "token-1",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    } as never;
  }

  async upsertTvPlayer() {
    return null as never;
  }

  async updateTvHeartbeat() {
    return null;
  }
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
    capabilities: { canSwitchVocalMode: false },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createAsset(id: string, songId: string): Asset {
  return {
    id,
    songId,
    sourceType: "local",
    assetKind: "video",
    displayName: id,
    filePath: `${id}.mp4`,
    durationMs: 180000,
    lyricMode: "hard_sub",
    vocalMode: "instrumental",
    status: "ready",
    switchFamily: null,
    switchQualityStatus: "verified",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createQueueEntry(
  id: string,
  songId: string,
  assetId: string,
  queuePosition: number,
  status: QueueEntry["status"]
): QueueEntry {
  return {
    id,
    roomId: "living-room",
    songId,
    assetId,
    requestedBy: "phone-1",
    queuePosition,
    status,
    priority: 0,
    playbackOptions: { preferredVocalMode: null, pitchSemitones: 0, requireReadyAsset: true },
    requestedAt: now.toISOString(),
    startedAt: status === "playing" ? now.toISOString() : null,
    endedAt: null,
    removedAt: null,
    removedByControlSessionId: null,
    undoExpiresAt: null
  };
}
