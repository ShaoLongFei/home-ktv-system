import type { PlaybackSession, QueueEntry, Room } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import type { MediaGateway } from "../modules/media/media-gateway.js";
import type { PlayableMediaAsset, PlayableMediaLookup, PlayableMediaRepository } from "../modules/media/playable-media-repository.js";
import { buildSwitchTarget, type BuildSwitchTargetRepositories } from "../modules/playback/build-switch-target.js";

const now = "2026-04-28T00:00:00.000Z";
const livingRoom = createRoom("living-room");

describe("buildSwitchTarget", () => {
  it("builds a NAS audio-track switch target from queue source identity without activeAssetId", async () => {
    const playableAsset = createPlayableMediaAsset();
    const target = await buildSwitchTarget({
      roomSlug: livingRoom.slug,
      repositories: createRepositories({
        session: createPlaybackSession(),
        queueEntry: createQueueEntry({ playbackOptions: { preferredVocalMode: "instrumental" } }),
        playableMedia: [playableAsset]
      }),
      mediaGateway: createMediaGateway()
    });

    expect(target).toMatchObject({
      roomId: "living-room",
      sessionVersion: 7,
      queueEntryId: "queue-current",
      switchKind: "audio_track",
      sourceType: "nas",
      fromAssetId: "ktv-asset-main",
      toAssetId: "ktv-asset-main",
      playbackUrl: "http://ktv.local/media/nas/ktv-asset-main",
      switchFamily: "real-mv-audio-track",
      vocalMode: "original",
      rollbackAssetId: "ktv-asset-main",
      selectedTrackRef: { index: 0, id: "0x1100", label: "Original" }
    });
  });

  it("switches to the extracted instrumental file when a variant exists", async () => {
    const playableAsset: PlayableMediaAsset = {
      ...createPlayableMediaAsset(),
      variantFilePaths: { instrumental: "/media/online-cache/igeba/20040098.instrumental.mkv" }
    };

    const target = await buildSwitchTarget({
      roomSlug: livingRoom.slug,
      repositories: createRepositories({
        session: createPlaybackSession(),
        queueEntry: createQueueEntry({ playbackOptions: { preferredVocalMode: "original" } }),
        playableMedia: [playableAsset]
      }),
      mediaGateway: createMediaGateway()
    });

    expect(target).toMatchObject({
      switchKind: "asset",
      toAssetId: "ktv-asset-main",
      playbackUrl: "http://ktv.local/media/nas/ktv-asset-main?variant=instrumental",
      switchFamily: "real-mv-variant",
      vocalMode: "instrumental",
      selectedTrackRef: null
    });
  });

  it("returns null when the target NAS audio role is missing", async () => {
    const playableAsset = {
      ...createPlayableMediaAsset(),
      trackRoles: { original: null, instrumental: { index: 1, id: "0x1101", label: "Instrumental" } }
    };

    await expect(
      buildSwitchTarget({
        roomSlug: livingRoom.slug,
        repositories: createRepositories({
          session: createPlaybackSession(),
          queueEntry: createQueueEntry({ playbackOptions: { preferredVocalMode: "instrumental" } }),
          playableMedia: [playableAsset]
        }),
        mediaGateway: createMediaGateway()
      })
    ).resolves.toBeNull();
  });
});

function createRepositories(input: {
  session: PlaybackSession;
  queueEntry: QueueEntry;
  playableMedia: PlayableMediaAsset[];
}): BuildSwitchTargetRepositories {
  return {
    rooms: {
      findById: async (roomId) => (roomId === livingRoom.id ? livingRoom : null),
      findBySlug: async (slug) => (slug === livingRoom.slug ? livingRoom : null)
    },
    playbackSessions: {
      findByRoomId: async (roomId) => (roomId === livingRoom.id ? input.session : null),
      startQueueEntry: async () => input.session,
      setIdle: async () => input.session,
      requestSwitchTarget: async () => input.session
    },
    queueEntries: {
      findById: async (queueEntryId) => (queueEntryId === input.queueEntry.id ? input.queueEntry : null),
      listEffectiveQueue: async () => [input.queueEntry],
      listUndoableRemoved: async () => [],
      findCurrentForRoom: async () => input.queueEntry,
      append: async () => input.queueEntry,
      markRemoved: async () => null,
      undoRemoved: async () => null,
      renumberQueue: async () => [],
      markCompleted: async () => null
    },
    playableMedia: new FakePlayableMediaRepository(input.playableMedia)
  };
}

function createMediaGateway(): Pick<MediaGateway, "createPlaybackUrl"> {
  return {
    createPlaybackUrl(source: PlayableMediaLookup) {
      const query = source.variant ? `?variant=${source.variant}` : "";
      return `http://ktv.local/media/${source.sourceType}/${source.assetId}${query}`;
    }
  };
}

class FakePlayableMediaRepository implements PlayableMediaRepository {
  constructor(private readonly assets: readonly PlayableMediaAsset[]) {}

  async findPlayableBySource(source: PlayableMediaLookup): Promise<PlayableMediaAsset | null> {
    return this.assets.find((asset) => asset.sourceType === source.sourceType && asset.assetId === source.assetId) ?? null;
  }
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
    activeAssetId: null,
    targetVocalMode: "original",
    playerState: "playing",
    playerPositionMs: 81234,
    mediaStartedAt: now,
    version: 7,
    updatedAt: now
  };
}

function createQueueEntry(input: { playbackOptions?: Partial<QueueEntry["playbackOptions"]> } = {}): QueueEntry {
  return {
    id: "queue-current",
    roomId: livingRoom.id,
    source: { sourceType: "nas", songId: "ktv-song-main", assetId: "ktv-asset-main" },
    songId: "ktv-song-main",
    assetId: "ktv-asset-main",
    requestedBy: "mobile",
    queuePosition: 1,
    status: "playing",
    priority: 0,
    playbackOptions: {
      preferredVocalMode: "original",
      pitchSemitones: 0,
      requireReadyAsset: true,
      ...input.playbackOptions
    },
    requestedAt: now,
    startedAt: now,
    endedAt: null,
    removedAt: null,
    removedByControlSessionId: null,
    undoExpiresAt: null
  };
}

function createPlayableMediaAsset(): PlayableMediaAsset {
  return {
    sourceType: "nas",
    songId: "ktv-song-main",
    assetId: "ktv-asset-main",
    title: "七里香",
    artistName: "周杰伦",
    displayName: "七里香",
    filePath: "/nas/ktv-asset-main.mp4",
    status: "ready",
    durationMs: 180000,
    compatibilityStatus: "playable",
    compatibilityReasons: [],
    mediaInfoSummary: {
      container: "mp4",
      durationMs: 180000,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 1000,
      audioTracks: [
        { index: 0, id: "0x1100", label: "Original", language: "zh", codec: "aac", channels: 2 },
        { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
      ]
    },
    mediaInfoProvenance: { source: "ffprobe", sourceVersion: null, probedAt: now, importedFrom: "/nas/ktv-asset-main.mp4" },
    trackRoles: {
      original: { index: 0, id: "0x1100", label: "Original" },
      instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
    },
    playbackProfile: {
      kind: "single_file_audio_tracks",
      container: "mp4",
      videoCodec: "h264",
      audioCodecs: ["aac"],
      requiresAudioTrackSelection: true
    }
  };
}
