import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import { InMemoryControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
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
        tokenExpiresAt: "2026-05-04T10:15:00.000Z",
        controllerUrl: "http://ktv.local/controller?room=living-room&token=token-1",
        qrPayload: "http://ktv.local/controller?room=living-room&token=token-1"
      },
      tvPresence: {
        online: true,
        deviceName: null,
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
      ])
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
});

function createHarness() {
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
        currentQueueEntryId: "queue-current",
        nextQueueEntryId: "queue-next",
        activeAssetId: "asset-current",
        targetVocalMode: "instrumental",
        playerState: "playing",
        playerPositionMs: 1234,
        mediaStartedAt: "2026-05-04T10:00:00.000Z",
        version: 8,
        updatedAt: "2026-05-04T10:00:00.000Z"
      } as any;
    }
  };

  const controlSessions = new InMemoryControlSessionRepository([
    {
      id: "control-session-1",
      roomId: "living-room",
      deviceId: "phone-1",
      deviceName: "Phone",
      lastSeenAt: "2026-05-04T09:59:30.000Z",
      expiresAt: "2026-05-04T10:15:00.000Z",
      revokedAt: null,
      createdAt: "2026-05-04T09:50:00.000Z",
      updatedAt: "2026-05-04T09:59:30.000Z"
    }
  ]);

  const pairingTokens = new InMemoryRoomPairingTokenRepository([
    {
      roomId: "living-room",
      tokenValue: "token-1",
      tokenHash: "hash-1",
      tokenExpiresAt: "2026-05-04T10:15:00.000Z",
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

  return {
    rooms: roomRepository,
    pairingTokens,
    controlSessions,
    playbackSessions,
    queueEntries,
    assets,
    songs,
    assetGateway
  };
}
