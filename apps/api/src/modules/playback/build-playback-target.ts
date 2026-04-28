import type { Asset, QueueEntry, Room, Song } from "@home-ktv/domain";
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

  return {
    roomId: room.id,
    sessionVersion: session.version,
    queueEntryId: queueEntry.id,
    assetId: asset.id,
    currentQueueEntryPreview: queuePreview(queueEntry, currentSong),
    playbackUrl: input.assetGateway.createPlaybackUrl(asset.id),
    resumePositionMs: session.playerPositionMs,
    vocalMode: asset.vocalMode,
    switchFamily: asset.switchFamily,
    nextQueueEntryPreview: await buildNextQueueEntryPreview(room, session.nextQueueEntryId, input.repositories)
  };
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
    vocalMode: input.asset.vocalMode,
    switchFamily: input.asset.switchFamily,
    nextQueueEntryPreview: input.nextQueueEntryPreview
  };
}
