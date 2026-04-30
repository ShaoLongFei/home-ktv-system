import type { Asset, DeviceSession, PlaybackEvent, PlaybackSession, QueueEntry, Room, Song } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import { registerPlayer, type PlayerDeviceSessionRepository } from "../modules/player/register-player.js";
import { ingestPlayerTelemetry } from "../modules/player/telemetry-service.js";
import { applyReconnectRecovery } from "../modules/playback/apply-reconnect-recovery.js";
import type { PlaybackEventRepository } from "../modules/playback/repositories/playback-event-repository.js";
import type {
  UpdatePlaybackFactsInput,
  UpdatePlayerPositionInput
} from "../modules/playback/repositories/playback-session-repository.js";

const now = new Date("2026-04-28T00:00:00.000Z");
const room = createRoom();

describe("player runtime contract", () => {
  it("returns an explicit conflict when a second active TV player bootstraps into the room", async () => {
    const activeDevice = createDevice("tv-active", "Living Room Mini PC", now);
    const deviceRepository = new FakeDeviceRepository([activeDevice]);

    const result = await registerPlayer({
      room,
      deviceId: "tv-second",
      deviceName: "Second Chrome",
      capabilities: { videoPool: "dual-video" },
      publicBaseUrl: "http://ktv.local",
      repository: deviceRepository,
      now
    });

    expect(result.status).toBe("conflict");
    expect(result.conflict).toMatchObject({
      kind: "active-player-conflict",
      reason: "active-player-exists",
      activeDeviceId: "tv-active"
    });
    expect(deviceRepository.upsertedDeviceIds).toEqual([]);
  });

  it("persists switch_failed and recovery_fallback_start_over telemetry facts", async () => {
    const eventRepository = new FakePlaybackEventRepository();
    const playbackSessions = new FakePlaybackSessionRepository(createPlaybackSession(81234));

    await ingestPlayerTelemetry({
      telemetry: {
        eventType: "switch_failed",
        room,
        deviceId: "tv-active",
        sessionVersion: 4,
        queueEntryId: "queue-current",
        assetId: "asset-instrumental",
        playbackPositionMs: 82400,
        vocalMode: "original",
        switchFamily: "family-main",
        rollbackAssetId: "asset-original",
        message: "standby play rejected"
      },
      playbackEvents: eventRepository,
      playbackSessions
    });
    await ingestPlayerTelemetry({
      telemetry: {
        eventType: "recovery_fallback_start_over",
        room,
        deviceId: "tv-active",
        sessionVersion: 5,
        queueEntryId: "queue-current",
        assetId: "asset-original",
        playbackPositionMs: 0,
        vocalMode: "original",
        switchFamily: "family-main",
        rollbackAssetId: null
      },
      playbackEvents: eventRepository,
      playbackSessions
    });

    expect(eventRepository.events.map((event) => event.eventType)).toEqual([
      "switch_failed",
      "recovery_fallback_start_over"
    ]);
    expect(playbackSessions.session.activeAssetId).toBe("asset-original");
    expect(playbackSessions.session.playerPositionMs).toBe(0);
  });

  it("reconnect recovery resumes near the stored player_position_ms when the asset can honor it", async () => {
    const eventRepository = new FakePlaybackEventRepository();
    const repositories = createRecoveryRepositories({
      session: createPlaybackSession(81234),
      asset: createAsset("asset-original", 180000),
      playbackEvents: eventRepository
    });

    const result = await applyReconnectRecovery({
      roomSlug: "living-room",
      deviceId: "tv-active",
      repositories,
      assetGateway: createAssetGateway(repositories.assets)
    });

    expect(result.status).toBe("resume_near_position");
    expect(result.target?.resumePositionMs).toBe(81234);
    expect(eventRepository.events).toHaveLength(0);
  });

  it("reconnect recovery restarts from 0 and records recovery_fallback_start_over when progress cannot be honored", async () => {
    const eventRepository = new FakePlaybackEventRepository();
    const repositories = createRecoveryRepositories({
      session: createPlaybackSession(181000),
      asset: createAsset("asset-original", 180000),
      playbackEvents: eventRepository
    });

    const result = await applyReconnectRecovery({
      roomSlug: "living-room",
      deviceId: "tv-active",
      repositories,
      assetGateway: createAssetGateway(repositories.assets)
    });

    expect(result.status).toBe("fallback_start_over");
    expect(result.target?.resumePositionMs).toBe(0);
    expect(eventRepository.events.map((event) => event.eventType)).toContain("recovery_fallback_start_over");
  });
});

function createRecoveryRepositories(input: {
  session: PlaybackSession;
  asset: Asset;
  playbackEvents: PlaybackEventRepository;
}) {
  const queueEntry = createQueueEntry(input.asset.id);
  const song = createSong();
  const assets: Asset[] = [input.asset];

  return {
    rooms: {
      async findById(roomId: string) {
        return roomId === room.id ? room : null;
      },
      async findBySlug(slug: string) {
        return slug === room.slug ? room : null;
      }
    },
    playbackSessions: {
      async findByRoomId(roomId: string) {
        return roomId === room.id ? input.session : null;
      }
    },
    queueEntries: {
      async findById(queueEntryId: string) {
        return queueEntryId === queueEntry.id ? queueEntry : null;
      }
    },
    assets: {
      async findById(assetId: string) {
        return assets.find((asset) => asset.id === assetId) ?? null;
      },
      async findVerifiedSwitchCounterparts() {
        return [];
      }
    },
    songs: {
      async findById(songId: string) {
        return songId === song.id ? song : null;
      }
    },
    playbackEvents: input.playbackEvents
  };
}

function createAssetGateway(assetRepository: AssetRepository): AssetGateway {
  return new AssetGateway({
    assetRepository,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: "/media-root" }),
    publicBaseUrl: "http://ktv.local"
  });
}

class FakeDeviceRepository implements PlayerDeviceSessionRepository {
  readonly upsertedDeviceIds: string[] = [];

  constructor(private readonly devices: DeviceSession[]) {}

  async findActiveTvPlayer(roomId: string, activeAfter: Date): Promise<DeviceSession | null> {
    return (
      this.devices.find(
        (device) =>
          device.roomId === roomId &&
          device.lastSeenAt !== null &&
          new Date(device.lastSeenAt).getTime() >= activeAfter.getTime()
      ) ?? null
    );
  }

  async upsertTvPlayer(input: Parameters<PlayerDeviceSessionRepository["upsertTvPlayer"]>[0]): Promise<DeviceSession> {
    this.upsertedDeviceIds.push(input.deviceId);
    const device = createDevice(input.deviceId, input.deviceName, input.now);
    this.devices.push(device);
    return device;
  }

  async updateTvHeartbeat(): Promise<DeviceSession | null> {
    return null;
  }
}

class FakePlaybackEventRepository implements PlaybackEventRepository {
  readonly events: PlaybackEvent[] = [];

  async append<TPayload extends Record<string, unknown>>(input: {
    roomId: string;
    queueEntryId: string | null;
    eventType: string;
    eventPayload: TPayload;
  }): Promise<PlaybackEvent<TPayload>> {
    const event: PlaybackEvent<TPayload> = {
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

class FakePlaybackSessionRepository {
  constructor(public session: PlaybackSession) {}

  async updatePlayerPosition(input: UpdatePlayerPositionInput): Promise<PlaybackSession | null> {
    this.session = {
      ...this.session,
      currentQueueEntryId: input.currentQueueEntryId,
      playerPositionMs: input.playerPositionMs,
      playerState: input.playerState ?? this.session.playerState
    };
    return this.session;
  }

  async updatePlaybackFacts(input: UpdatePlaybackFactsInput): Promise<PlaybackSession | null> {
    this.session = {
      ...this.session,
      currentQueueEntryId: input.queueEntryId,
      activeAssetId: input.activeAssetId,
      playerState: input.playerState,
      playerPositionMs: input.playerPositionMs,
      targetVocalMode: input.targetVocalMode ?? this.session.targetVocalMode
    };
    return this.session;
  }
}

function createRoom(): Room {
  return {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: "tv-active",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createDevice(id: string, deviceName: string, seenAt: Date): DeviceSession {
  return {
    id,
    roomId: room.id,
    deviceType: "tv",
    deviceName,
    lastSeenAt: seenAt.toISOString(),
    capabilities: { videoPool: "dual-video" },
    pairingToken: null,
    createdAt: seenAt.toISOString(),
    updatedAt: seenAt.toISOString()
  };
}

function createPlaybackSession(playerPositionMs: number): PlaybackSession {
  return {
    roomId: room.id,
    currentQueueEntryId: "queue-current",
    nextQueueEntryId: null,
    activeAssetId: "asset-original",
    targetVocalMode: "original",
    playerState: "playing",
    playerPositionMs,
    mediaStartedAt: now.toISOString(),
    version: 4,
    updatedAt: now.toISOString()
  };
}

function createQueueEntry(assetId: string): QueueEntry {
  return {
    id: "queue-current",
    roomId: room.id,
    songId: "song-main",
    assetId,
    requestedBy: "mobile",
    queuePosition: 1,
    status: "playing",
    priority: 0,
    playbackOptions: {
      preferredVocalMode: "original",
      pitchSemitones: 0,
      requireReadyAsset: true
    },
    requestedAt: now.toISOString(),
    startedAt: now.toISOString(),
    endedAt: null
  };
}

function createSong(): Song {
  return {
    id: "song-main",
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
    releaseYear: null,
    canonicalDurationMs: 180000,
    searchWeight: 0,
    defaultAssetId: "asset-original",
    capabilities: { canSwitchVocalMode: true },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function createAsset(id: string, durationMs: number): Asset {
  return {
    id,
    songId: "song-main",
    sourceType: "local",
    assetKind: "video",
    displayName: "七里香",
    filePath: `${id}.mp4`,
    durationMs,
    lyricMode: "hard_sub",
    vocalMode: "original",
    status: "ready",
    switchFamily: "family-main",
    switchQualityStatus: "verified",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}
