import type { Asset, PlaybackProfile, QueueEntry, Room, Song, TrackRef, VocalMode } from "@home-ktv/domain";
import type { PlaybackTarget, QueueEntryPreview } from "@home-ktv/player-contracts";
import type { AssetGateway } from "../assets/asset-gateway.js";
import type { AssetRepository } from "../catalog/repositories/asset-repository.js";
import type { SongRepository } from "../catalog/repositories/song-repository.js";
import type { RoomRepository } from "../rooms/repositories/room-repository.js";
import type { PlaybackSessionRepository } from "./repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "./repositories/queue-entry-repository.js";

export interface BuildPlaybackTargetRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
  songs: SongRepository;
}

export interface BuildPlaybackTargetInput {
  roomSlug: string;
  repositories: BuildPlaybackTargetRepositories;
  assetGateway: AssetGateway;
}

export async function buildPlaybackTarget(input: BuildPlaybackTargetInput): Promise<PlaybackTarget | null> {
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return null;
  }

  const session = await input.repositories.playbackSessions.findByRoomId(room.id);
  if (!session?.currentQueueEntryId || !session.activeAssetId) {
    return null;
  }

  const [queueEntry, asset] = await Promise.all([
    input.repositories.queueEntries.findById(session.currentQueueEntryId),
    input.repositories.assets.findById(session.activeAssetId)
  ]);

  if (!queueEntry || !asset || asset.status !== "ready") {
    return null;
  }

  const currentSong = await input.repositories.songs.findById(queueEntry.songId);
  if (!currentSong) {
    return null;
  }

  const effectiveVocalMode = effectiveVocalModeForPlayback(asset, queueEntry);

  return {
    roomId: room.id,
    sessionVersion: session.version,
    queueEntryId: queueEntry.id,
    assetId: asset.id,
    currentQueueEntryPreview: queuePreview(queueEntry, currentSong),
    playbackUrl: input.assetGateway.createPlaybackUrl(asset.id),
    resumePositionMs: session.playerPositionMs,
    vocalMode: effectiveVocalMode,
    switchFamily: asset.switchFamily,
    playbackProfile: buildPlaybackProfileForAsset(asset),
    selectedTrackRef: selectedTrackRefForResolvedMode(asset, effectiveVocalMode),
    nextQueueEntryPreview: await buildNextQueueEntryPreview(room, session.nextQueueEntryId, input.repositories)
  };
}

function buildPlaybackProfileForAsset(asset: Asset): PlaybackProfile {
  if (asset.playbackProfile) {
    return asset.playbackProfile;
  }

  return {
    kind: "separate_asset_pair",
    container: asset.mediaInfoSummary?.container ?? null,
    videoCodec: asset.mediaInfoSummary?.videoCodec ?? null,
    audioCodecs: asset.mediaInfoSummary?.audioTracks.map((track) => track.codec).filter((codec): codec is string => Boolean(codec)) ?? [],
    requiresAudioTrackSelection: false
  };
}

function effectiveVocalModeForPlayback(asset: Asset, queueEntry: QueueEntry): VocalMode {
  if (asset.playbackProfile?.kind === "single_file_audio_tracks" || asset.assetKind === "dual-track-video") {
    return queueEntry.playbackOptions.preferredVocalMode ?? "instrumental";
  }

  return asset.vocalMode;
}

function selectedTrackRefForResolvedMode(asset: Asset, vocalMode: VocalMode): TrackRef | null {
  if (vocalMode === "original") {
    return asset.trackRoles?.original ?? null;
  }
  if (vocalMode === "instrumental") {
    return asset.trackRoles?.instrumental ?? null;
  }
  return null;
}

async function buildNextQueueEntryPreview(
  _room: Room,
  nextQueueEntryId: string | null,
  repositories: BuildPlaybackTargetRepositories
): Promise<QueueEntryPreview | null> {
  if (!nextQueueEntryId) {
    return null;
  }

  const nextQueueEntry = await repositories.queueEntries.findById(nextQueueEntryId);
  if (!nextQueueEntry) {
    return null;
  }

  const nextSong = await repositories.songs.findById(nextQueueEntry.songId);
  if (!nextSong) {
    return null;
  }

  return queuePreview(nextQueueEntry, nextSong);
}

function queuePreview(queueEntry: QueueEntry, song: Song): QueueEntryPreview {
  return {
    queueEntryId: queueEntry.id,
    songTitle: song.title,
    artistName: song.artistName
  };
}

export function buildPlaybackTargetFromResolvedState(input: {
  room: Room;
  queueEntry: QueueEntry;
  asset: Asset;
  sessionVersion: number;
  resumePositionMs: number;
  playbackUrl: string;
  nextQueueEntryPreview: QueueEntryPreview | null;
}): PlaybackTarget {
  const effectiveVocalMode = effectiveVocalModeForPlayback(input.asset, input.queueEntry);

  return {
    roomId: input.room.id,
    sessionVersion: input.sessionVersion,
    queueEntryId: input.queueEntry.id,
    assetId: input.asset.id,
    currentQueueEntryPreview: input.nextQueueEntryPreview?.queueEntryId === input.queueEntry.id
      ? input.nextQueueEntryPreview
      : {
          queueEntryId: input.queueEntry.id,
          songTitle: input.asset.displayName,
          artistName: ""
        },
    playbackUrl: input.playbackUrl,
    resumePositionMs: input.resumePositionMs,
    vocalMode: effectiveVocalMode,
    switchFamily: input.asset.switchFamily,
    playbackProfile: buildPlaybackProfileForAsset(input.asset),
    selectedTrackRef: selectedTrackRefForResolvedMode(input.asset, effectiveVocalMode),
    nextQueueEntryPreview: input.nextQueueEntryPreview
  };
}
