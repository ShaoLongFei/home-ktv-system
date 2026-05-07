import type { Asset, PlaybackSession, QueueEntry, Room, Song } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import { AssetGateway } from "../modules/assets/asset-gateway.js";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import { buildPlaybackTarget } from "../modules/playback/build-playback-target.js";
import type { BuildPlaybackTargetRepositories } from "../modules/playback/build-playback-target.js";
import type { AppendQueueEntryInput } from "../modules/playback/repositories/queue-entry-repository.js";

const now = "2026-04-28T00:00:00.000Z";

describe("buildPlaybackTarget", () => {
  it("builds a living-room playback target with the current asset URL and next queue preview", async () => {
    const room = createRoom("living-room");
    const currentAsset = createAsset("asset-current", "instrumental", "family-main");
    const nextAsset = createAsset("asset-next", "instrumental", "next-family");
    const currentSong = createSong("song-current", "七里香", "周杰伦", currentAsset.id);
    const nextSong = createSong("song-next", "后来", "刘若英", nextAsset.id);
    const songs = [currentSong, nextSong];
    const queueEntries = [
      createQueueEntry("queue-current", room.id, currentSong.id, currentAsset.id, "playing"),
      createQueueEntry("queue-next", room.id, nextSong.id, nextAsset.id, "queued")
    ];
    const session = createPlaybackSession(room.id, currentAsset.id);
    const repositories = createRepositories({
      room,
      session,
      assets: [currentAsset, nextAsset],
      queueEntries,
      songs
    });

    const target = await buildPlaybackTarget({
      roomSlug: "living-room",
      repositories,
      assetGateway: createAssetGateway(repositories.assets)
    });

    expect(target).toEqual({
      roomId: "living-room",
      sessionVersion: 11,
      queueEntryId: "queue-current",
      assetId: "asset-current",
      currentQueueEntryPreview: {
        queueEntryId: "queue-current",
        songTitle: "七里香",
        artistName: "周杰伦"
      },
      playbackUrl: "http://ktv.local/media/asset-current",
      resumePositionMs: 45678,
      vocalMode: "instrumental",
      switchFamily: "family-main",
      nextQueueEntryPreview: {
        queueEntryId: "queue-next",
        songTitle: "后来",
        artistName: "刘若英"
      }
    });
  });
});

interface RepositoryState {
  room: Room;
  session: PlaybackSession;
  assets: Asset[];
  queueEntries: QueueEntry[];
  songs: Song[];
}

function createRepositories(state: RepositoryState): BuildPlaybackTargetRepositories {
  const assetRepository: AssetRepository = {
    async findById(assetId) {
      return state.assets.find((asset) => asset.id === assetId) ?? null;
    },
    async findVerifiedSwitchCounterparts(currentAsset) {
      return state.assets.filter((asset) => asset.id !== currentAsset.id);
    }
  };

  return {
    rooms: {
      async findById(roomId) {
        return roomId === state.room.id ? state.room : null;
      },
      async findBySlug(slug) {
        return slug === state.room.slug ? state.room : null;
      }
    },
    playbackSessions: {
      async findByRoomId(roomId) {
        return roomId === state.room.id ? state.session : null;
      },
      async startQueueEntry() {
        return state.session;
      },
      async setIdle() {
        return state.session;
      },
      async requestSwitchTarget() {
        return state.session;
      }
    },
    queueEntries: {
      async findById(queueEntryId) {
        return state.queueEntries.find((queueEntry) => queueEntry.id === queueEntryId) ?? null;
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
    assets: assetRepository,
    songs: {
      async findById(songId) {
        return state.songs.find((song) => song.id === songId) ?? null;
      }
    }
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

function createPlaybackSession(roomId: string, activeAssetId: string): PlaybackSession {
  return {
    roomId,
    currentQueueEntryId: "queue-current",
    nextQueueEntryId: "queue-next",
    activeAssetId,
    targetVocalMode: "instrumental",
    playerState: "playing",
    playerPositionMs: 45678,
    mediaStartedAt: now,
    version: 11,
    updatedAt: now
  };
}

function createQueueEntry(
  id: string,
  roomId: string,
  songId: string,
  assetId: string,
  status: QueueEntry["status"]
): QueueEntry {
    return {
      id,
      roomId,
      songId,
      assetId,
    requestedBy: "mobile",
    queuePosition: id === "queue-current" ? 1 : 2,
    status,
    priority: 0,
    playbackOptions: {
      preferredVocalMode: "instrumental",
      pitchSemitones: 0,
      requireReadyAsset: true
    },
      requestedAt: now,
      startedAt: status === "playing" ? now : null,
      endedAt: null,
      removedAt: null,
      removedByControlSessionId: null,
      undoExpiresAt: null
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
    capabilities: {
      canSwitchVocalMode: true
    },
    createdAt: now,
    updatedAt: now
  };
}

function createAsset(id: string, vocalMode: Asset["vocalMode"], switchFamily: string): Asset {
  return {
    id,
    songId: id === "asset-current" ? "song-current" : "song-next",
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
    createdAt: now,
    updatedAt: now
  };
}
