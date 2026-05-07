import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import { InMemoryControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import type { PlayerDeviceSessionRepository } from "../modules/player/register-player.js";
import { buildRoomControlSnapshot } from "../modules/rooms/build-control-snapshot.js";
import { InMemoryRoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import { registerAdminRoomsRoutes } from "../routes/admin-rooms.js";

describe("admin room status routes", () => {
  it("GET /admin/rooms/living-room returns room status, pairing, and queue summary", async () => {
    const harness = createHarness();
    const server = Fastify({ logger: false });
    await registerAdminRoomsRoutes(server, {
      config: { publicBaseUrl: "http://ktv.local" } as any,
      rooms: harness.rooms,
      pairingTokens: harness.pairingTokens,
      controlSessions: harness.controlSessions,
      playbackSessions: harness.playbackSessions,
      queueEntries: harness.queueEntries,
      assets: harness.assets,
      songs: harness.songs,
      deviceSessions: harness.deviceSessions,
      playbackEvents: harness.playbackEvents,
      onlineTasks: harness.onlineTasks,
      assetGateway: harness.assetGateway
    } as any);

    const snapshot = await buildRoomControlSnapshot({
      roomSlug: "living-room",
      config: { publicBaseUrl: "http://ktv.local" } as any,
      repositories: harness as any,
      assetGateway: harness.assetGateway
    });
    expect(snapshot).not.toBeNull();

    const response = await server.inject({
      method: "GET",
      url: "/admin/rooms/living-room"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      room: {
        roomId: "living-room",
        roomSlug: "living-room",
        status: "active"
      },
      pairing: {
        tokenExpiresAt: expect.any(String),
        controllerUrl: "http://ktv.local/controller?room=living-room&token=token-1",
        qrPayload: "http://ktv.local/controller?room=living-room&token=token-1"
      },
      tvPresence: {
        online: true,
        deviceName: "Living Room TV",
        conflict: null
      },
      controllers: { onlineCount: 1 },
      sessionVersion: 8,
      current: {
        queueEntryId: "queue-current",
        songTitle: "七里香",
        artistName: "周杰伦",
        vocalMode: "instrumental"
      },
      queue: expect.arrayContaining([
        expect.objectContaining({
          queueEntryId: "queue-current",
          songTitle: "七里香",
          artistName: "周杰伦"
        }),
        expect.objectContaining({
          queueEntryId: "queue-next",
          songTitle: "晴天",
          artistName: "周杰伦"
        })
      ]),
      recentEvents: [
        expect.objectContaining({
          eventType: "player.failed",
          queueEntryId: "queue-current",
          eventPayload: expect.objectContaining({
            reason: "media-error",
            recovery: "skipped-to-next"
          }),
          createdAt: "2026-05-04T10:03:00.000Z"
        }),
        expect.objectContaining({
          eventType: "player.ended",
          queueEntryId: "queue-previous"
        })
      ],
      onlineTasks: {
        counts: {
          total: 2,
          ready: 1,
          failed: 1
        },
        tasks: [
          expect.objectContaining({
            taskId: "task-ready",
            roomId: "living-room",
            title: "稻香",
            artistName: "周杰伦",
            provider: "fixture-provider",
            providerCandidateId: "fixture-ready",
            status: "ready",
            failureReason: null,
            readyAssetId: "asset-online-ready",
            updatedAt: "2026-05-04T10:02:00.000Z",
            recentEventAt: "2026-05-04T10:02:00.000Z"
          }),
          expect.objectContaining({
            taskId: "task-failed",
            roomId: "living-room",
            title: "倒带",
            artistName: "蔡依林",
            status: "failed",
            failureReason: "provider-timeout",
            recentEventAt: "2026-05-04T10:01:00.000Z"
          })
        ]
      }
    });
    expect(body.tvPresence.lastSeenAt).toEqual(expect.any(String));
  });

  it("POST /admin/rooms/living-room/pairing-token/refresh returns updated pairing", async () => {
    const harness = createHarness();
    const server = Fastify({ logger: false });
    await registerAdminRoomsRoutes(server, {
      config: { publicBaseUrl: "http://ktv.local" } as any,
      rooms: harness.rooms,
      pairingTokens: harness.pairingTokens,
      controlSessions: harness.controlSessions,
      playbackSessions: harness.playbackSessions,
      queueEntries: harness.queueEntries,
      assets: harness.assets,
      songs: harness.songs,
      deviceSessions: harness.deviceSessions,
      assetGateway: harness.assetGateway
    } as any);

    const response = await server.inject({
      method: "POST",
      url: "/admin/rooms/living-room/pairing-token/refresh"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { pairing: { token?: string; tokenExpiresAt: string; controllerUrl: string; qrPayload: string } };
    expect(body.pairing.controllerUrl).toContain("room=living-room&token=");
    expect(body.pairing.qrPayload).toContain("room=living-room&token=");
    expect(body.pairing.token).toBeTypeOf("string");
    expect(body.pairing.tokenExpiresAt).toMatch(/T/u);
  });

  it("keeps TV status online when the TV heartbeat is active but no song is playing", async () => {
    const harness = createHarness({ playing: false });
    const server = Fastify({ logger: false });
    await registerAdminRoomsRoutes(server, {
      config: { publicBaseUrl: "http://ktv.local" } as any,
      rooms: harness.rooms,
      pairingTokens: harness.pairingTokens,
      controlSessions: harness.controlSessions,
      playbackSessions: harness.playbackSessions,
      queueEntries: harness.queueEntries,
      assets: harness.assets,
      songs: harness.songs,
      deviceSessions: harness.deviceSessions,
      assetGateway: harness.assetGateway
    } as any);

    const response = await server.inject({
      method: "GET",
      url: "/admin/rooms/living-room"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { tvPresence: { online: boolean; deviceName: string | null; lastSeenAt: string | null }; current: unknown };
    expect(body.tvPresence).toMatchObject({
      online: true,
      deviceName: "Living Room TV"
    });
    expect(body.tvPresence.lastSeenAt).toEqual(expect.any(String));
    expect(body.current).toBeNull();
  });
});

function createHarness(options: { playing?: boolean } = {}) {
  const playing = options.playing ?? true;
  const activeNow = new Date();
  const room = {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: "2026-05-04T09:00:00.000Z",
    updatedAt: "2026-05-04T09:00:00.000Z"
  };

  const roomRepository = {
    async findById(roomId: string) {
      return roomId === room.id ? room : null;
    },
    async findBySlug(slug: string) {
      return slug === room.slug ? room : null;
    }
  };

  const songs = {
    async findById(songId: string) {
      if (songId === "song-current") {
        return { id: "song-current", title: "七里香", artistName: "周杰伦" } as any;
      }
      if (songId === "song-next") {
        return { id: "song-next", title: "晴天", artistName: "周杰伦" } as any;
      }
      return null;
    }
  };

  const assets = {
    async findById(assetId: string) {
      if (assetId === "asset-current") {
        return {
          id: "asset-current",
          songId: "song-current",
          status: "ready",
          vocalMode: "instrumental",
          switchFamily: "main",
          displayName: "七里香",
          filePath: "/media/asset-current",
          durationMs: 180000,
          lyricMode: "hard_sub",
          sourceType: "formal",
          assetKind: "video",
          switchQualityStatus: "verified",
          createdAt: "2026-05-04T09:00:00.000Z",
          updatedAt: "2026-05-04T09:00:00.000Z"
        } as any;
      }
      return null;
    },
    async findVerifiedSwitchCounterparts() {
      return [];
    }
  };

  const queueEntries = {
    async findById(queueEntryId: string) {
      if (queueEntryId === "queue-current") {
        return {
          id: "queue-current",
          roomId: "living-room",
          songId: "song-current",
          assetId: "asset-current",
          requestedBy: "phone-1",
          queuePosition: 1,
          status: "playing",
          priority: 0,
          playbackOptions: { preferredVocalMode: null, pitchSemitones: 0, requireReadyAsset: true },
          requestedAt: "2026-05-04T09:59:00.000Z",
          startedAt: "2026-05-04T10:00:00.000Z",
          endedAt: null,
          removedAt: null,
          removedByControlSessionId: null,
          undoExpiresAt: null
        } as any;
      }
      if (queueEntryId === "queue-next") {
        return {
          id: "queue-next",
          roomId: "living-room",
          songId: "song-next",
          assetId: "asset-next",
          requestedBy: "phone-2",
          queuePosition: 2,
          status: "queued",
          priority: 0,
          playbackOptions: { preferredVocalMode: null, pitchSemitones: 0, requireReadyAsset: true },
          requestedAt: "2026-05-04T10:00:00.000Z",
          startedAt: null,
          endedAt: null,
          removedAt: null,
          removedByControlSessionId: null,
          undoExpiresAt: null
        } as any;
      }
      return null;
    },
    async listEffectiveQueue() {
      return [await this.findById("queue-current"), await this.findById("queue-next")].filter(Boolean) as any;
    },
    async listUndoableRemoved() {
      return [];
    },
    async findCurrentForRoom() {
      return this.findById("queue-current");
    },
    async append() {
      return this.findById("queue-next");
    },
    async markRemoved() {
      return null;
    },
    async undoRemoved() {
      return null;
    },
    async renumberQueue() {
      return [];
    },
    async markCompleted() {
      return null;
    }
  };

  const playbackSessions = {
    async findByRoomId(roomId: string) {
      if (roomId !== "living-room") {
        return null;
      }
      return {
        roomId: "living-room",
        currentQueueEntryId: playing ? "queue-current" : null,
        nextQueueEntryId: playing ? "queue-next" : null,
        activeAssetId: playing ? "asset-current" : null,
        targetVocalMode: "instrumental",
        playerState: playing ? "playing" : "idle",
        playerPositionMs: 1234,
        mediaStartedAt: "2026-05-04T10:00:00.000Z",
        version: 8,
        updatedAt: "2026-05-04T10:00:00.000Z"
      } as any;
    }
  };

  const playbackEvents = {
    async listRecentByRoom(roomId: string, limit?: number) {
      if (roomId !== "living-room") {
        return [];
      }
      return [
        {
          id: "playback-event-failed",
          roomId: "living-room",
          queueEntryId: "queue-current",
          eventType: "player.failed",
          eventPayload: { reason: "media-error", recovery: "skipped-to-next" },
          createdAt: "2026-05-04T10:03:00.000Z"
        },
        {
          id: "playback-event-ended",
          roomId: "living-room",
          queueEntryId: "queue-previous",
          eventType: "player.ended",
          eventPayload: { endedReason: "natural" },
          createdAt: "2026-05-04T10:00:00.000Z"
        }
      ].slice(0, limit ?? 20);
    }
  };

  const onlineTasks = {
    async listActiveForRoom(roomId: string) {
      if (roomId !== "living-room") {
        return [];
      }
      return [
        {
          id: "task-ready",
          roomId: "living-room",
          provider: "fixture-provider",
          providerCandidateId: "fixture-ready",
          title: "稻香",
          artistName: "周杰伦",
          sourceLabel: "Fixture Provider",
          durationMs: 210000,
          candidateType: "karaoke",
          reliabilityLabel: "high",
          riskLabel: "normal",
          status: "ready",
          failureReason: null,
          recentEvent: { type: "ready", at: "2026-05-04T10:02:00.000Z" },
          providerPayload: {},
          readyAssetId: "asset-online-ready",
          createdAt: "2026-05-04T10:00:00.000Z",
          updatedAt: "2026-05-04T10:02:00.000Z",
          selectedAt: "2026-05-04T10:00:30.000Z",
          reviewRequiredAt: null,
          fetchingAt: "2026-05-04T10:01:00.000Z",
          fetchedAt: "2026-05-04T10:01:30.000Z",
          readyAt: "2026-05-04T10:02:00.000Z",
          failedAt: null,
          staleAt: null,
          promotedAt: null,
          purgedAt: null
        },
        {
          id: "task-failed",
          roomId: "living-room",
          provider: "fixture-provider",
          providerCandidateId: "fixture-failed",
          title: "倒带",
          artistName: "蔡依林",
          sourceLabel: "Fixture Provider",
          durationMs: 198000,
          candidateType: "mv",
          reliabilityLabel: "medium",
          riskLabel: "normal",
          status: "failed",
          failureReason: "provider-timeout",
          recentEvent: { type: "failed", at: "2026-05-04T10:01:00.000Z", reason: "provider-timeout" },
          providerPayload: {},
          readyAssetId: null,
          createdAt: "2026-05-04T09:59:00.000Z",
          updatedAt: "2026-05-04T10:01:00.000Z",
          selectedAt: "2026-05-04T09:59:30.000Z",
          reviewRequiredAt: null,
          fetchingAt: "2026-05-04T10:00:00.000Z",
          fetchedAt: null,
          readyAt: null,
          failedAt: "2026-05-04T10:01:00.000Z",
          staleAt: null,
          promotedAt: null,
          purgedAt: null
        }
      ] as any;
    }
  };

  const controlSessions = new InMemoryControlSessionRepository([
    {
      id: "control-session-1",
      roomId: "living-room",
      deviceId: "phone-1",
      deviceName: "Phone",
      lastSeenAt: activeNow.toISOString(),
      expiresAt: new Date(activeNow.getTime() + 15 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: "2026-05-04T09:50:00.000Z",
      updatedAt: activeNow.toISOString()
    }
  ]);

  const pairingTokens = new InMemoryRoomPairingTokenRepository([
    {
      roomId: "living-room",
      tokenValue: "token-1",
      tokenHash: "hash-1",
      tokenExpiresAt: new Date(activeNow.getTime() + 15 * 60 * 1000).toISOString(),
      rotatedAt: "2026-05-04T10:00:00.000Z",
      createdAt: "2026-05-04T09:50:00.000Z",
      updatedAt: "2026-05-04T10:00:00.000Z"
    }
  ]);

  const assetGateway = new AssetGateway({
    assetRepository: assets as any,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: "/media-root" }),
    publicBaseUrl: "http://ktv.local"
  });
  const deviceSessions: PlayerDeviceSessionRepository = {
    async findActiveTvPlayer(roomId: string, activeAfter: Date) {
      if (roomId !== "living-room") {
        return null;
      }

      const lastSeenAt = new Date(activeAfter.getTime() + 1000).toISOString();
      return {
        id: "tv-1",
        roomId: "living-room",
        deviceType: "tv",
        deviceName: "Living Room TV",
        lastSeenAt,
        capabilities: { videoPool: "dual-video" },
        pairingToken: "token-1",
        createdAt: "2026-05-04T09:00:00.000Z",
        updatedAt: lastSeenAt
      } as any;
    },
    async upsertTvPlayer() {
      return null as any;
    },
    async updateTvHeartbeat() {
      return null;
    }
  };

  return {
    rooms: roomRepository,
    pairingTokens,
    controlSessions,
    deviceSessions,
    playbackSessions,
    playbackEvents,
    onlineTasks,
    queueEntries,
    assets,
    songs,
    assetGateway
  };
}
