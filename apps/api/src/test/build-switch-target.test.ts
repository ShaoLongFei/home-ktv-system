import type { Asset, PlaybackSession, QueueEntry, Room } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import { buildSwitchTarget } from "../modules/playback/build-switch-target.js";
import type { BuildSwitchTargetRepositories } from "../modules/playback/build-switch-target.js";
import type { AppendQueueEntryInput } from "../modules/playback/repositories/queue-entry-repository.js";

const now = "2026-04-28T00:00:00.000Z";
const livingRoom = createRoom("living-room");

describe("buildSwitchTarget", () => {
  it("builds a switch target for a verified original/instrumental pair in the same switch family", async () => {
    const currentAsset = createAsset("asset-original", "original", "family-main", "verified");
    const targetAsset = createAsset("asset-instrumental", "instrumental", "family-main", "verified");
    const context = createSwitchContext([currentAsset, targetAsset]);

    const target = await buildSwitchTarget(context);

    expect(target).toEqual({
      roomId: "living-room",
      sessionVersion: 7,
      queueEntryId: "queue-current",
      fromAssetId: "asset-original",
      toAssetId: "asset-instrumental",
      playbackUrl: "http://ktv.local/media/asset-instrumental",
      switchFamily: "family-main",
      vocalMode: "instrumental",
      rollbackAssetId: "asset-original",
      resumePositionMs: 81234
    });
  });

  it("returns null when a switch counterpart is missing", async () => {
    const currentAsset = createAsset("asset-original", "original", "family-main", "verified");
    const context = createSwitchContext([currentAsset]);

    await expect(buildSwitchTarget(context)).resolves.toBeNull();
  });

  it("returns null for a wrong-family counterpart", async () => {
    const currentAsset = createAsset("asset-original", "original", "family-main", "verified");
    const wrongFamilyAsset = createAsset("asset-instrumental", "instrumental", "family-other", "verified");
    const context = createSwitchContext([currentAsset, wrongFamilyAsset]);

    await expect(buildSwitchTarget(context)).resolves.toBeNull();
  });

  it("returns null when the counterpart has switch_quality_status = review_required", async () => {
    const currentAsset = createAsset("asset-original", "original", "family-main", "verified");
    const reviewRequiredAsset = createAsset("asset-instrumental", "instrumental", "family-main", "review_required");
    const context = createSwitchContext([currentAsset, reviewRequiredAsset]);

    await expect(buildSwitchTarget(context)).resolves.toBeNull();
  });
});

function createSwitchContext(assets: Asset[]) {
  const repositories = createRepositories(assets);
  return {
    roomSlug: "living-room",
    repositories,
    assetGateway: createAssetGateway(repositories.assets)
  };
}

function createRepositories(assets: Asset[]): BuildSwitchTargetRepositories {
  const assetRepository: AssetRepository = {
    async findById(assetId) {
      return assets.find((asset) => asset.id === assetId) ?? null;
    },
    async findVerifiedSwitchCounterparts(currentAsset) {
      return assets.filter((asset) => asset.id !== currentAsset.id);
    }
  };

  return {
    rooms: {
      async findById(roomId) {
        return roomId === livingRoom.id ? livingRoom : null;
      },
      async findBySlug(slug) {
        return slug === livingRoom.slug ? livingRoom : null;
      }
    },
    playbackSessions: {
      async findByRoomId(roomId) {
        return roomId === livingRoom.id ? createPlaybackSession() : null;
      },
      async startQueueEntry() {
        return createPlaybackSession();
      },
      async setIdle() {
        return createPlaybackSession();
      },
      async requestSwitchTarget() {
        return createPlaybackSession();
      }
    },
    queueEntries: {
      async findById(queueEntryId) {
        return queueEntryId === "queue-current" ? createQueueEntry() : null;
      },
      async listEffectiveQueue() {
        return [];
      },
      async listUndoableRemoved() {
        return [];
      },
      async findCurrentForRoom() {
        return null;
      },
      async append(input: AppendQueueEntryInput) {
        return {
          id: "queue-new",
          roomId: input.roomId,
          songId: input.songId,
          assetId: input.assetId,
          requestedBy: input.requestedBy,
          queuePosition: input.queuePosition,
          status: input.status ?? "queued",
          priority: input.priority ?? 0,
          playbackOptions: {
            preferredVocalMode: null,
            pitchSemitones: 0,
            requireReadyAsset: true
          },
          requestedAt: (input.requestedAt ?? new Date()).toISOString(),
          startedAt: input.startedAt ? input.startedAt.toISOString() : null,
          endedAt: input.endedAt ? input.endedAt.toISOString() : null,
          removedAt: input.removedAt ? input.removedAt.toISOString() : null,
          removedByControlSessionId: input.removedByControlSessionId ?? null,
          undoExpiresAt: input.undoExpiresAt ? input.undoExpiresAt.toISOString() : null
        };
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
    },
    assets: assetRepository
  };
}

function createAssetGateway(assetRepository: AssetRepository): AssetGateway {
  return new AssetGateway({
    assetRepository,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: "/media-root" }),
    publicBaseUrl: "http://ktv.local"
  });
}

function createRoom(slug: string): Room {
  return {
    id: slug,
    slug,
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: now,
    updatedAt: now
  };
}

function createPlaybackSession(): PlaybackSession {
  return {
    roomId: livingRoom.id,
    currentQueueEntryId: "queue-current",
    nextQueueEntryId: null,
    activeAssetId: "asset-original",
    targetVocalMode: "original",
    playerState: "playing",
    playerPositionMs: 81234,
    mediaStartedAt: now,
    version: 7,
    updatedAt: now
  };
}

function createQueueEntry(): QueueEntry {
    return {
      id: "queue-current",
      roomId: livingRoom.id,
      songId: "song-main",
      assetId: "asset-original",
    requestedBy: "mobile",
    queuePosition: 1,
    status: "playing",
    priority: 0,
    playbackOptions: {
      preferredVocalMode: "original",
      pitchSemitones: 0,
      requireReadyAsset: true
    },
      requestedAt: now,
      startedAt: now,
      endedAt: null,
      removedAt: null,
      removedByControlSessionId: null,
      undoExpiresAt: null
    };
  }

function createAsset(
  id: string,
  vocalMode: Asset["vocalMode"],
  switchFamily: string,
  switchQualityStatus: Asset["switchQualityStatus"]
): Asset {
  return {
    id,
    songId: "song-main",
    sourceType: "local",
    assetKind: "video",
    displayName: id,
    filePath: `${id}.mp4`,
    durationMs: 180000,
    lyricMode: "hard_sub",
    vocalMode,
    status: "ready",
    switchFamily,
    switchQualityStatus,
    createdAt: now,
    updatedAt: now
  };
}
