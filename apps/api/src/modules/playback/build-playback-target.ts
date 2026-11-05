import type { MediaSourceRef, QueueEntry, Room, TrackRef, VocalMode } from "@home-ktv/domain";
import type { PlaybackTarget, QueueEntryPreview } from "@home-ktv/player-contracts";
import type { MediaGateway } from "../media/media-gateway.js";
import type { PlayableMediaAsset, PlayableMediaRepository } from "../media/playable-media-repository.js";
import type { RoomRepository } from "../rooms/repositories/room-repository.js";
import type { PlaybackSessionRepository } from "./repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "./repositories/queue-entry-repository.js";

export interface BuildPlaybackTargetRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  playableMedia?: PlayableMediaRepository;
}

export interface BuildPlaybackTargetInput {
  roomSlug: string;
  repositories: BuildPlaybackTargetRepositories;
  mediaGateway?: Pick<MediaGateway, "createPlaybackUrl">;
}

export async function buildPlaybackTarget(input: BuildPlaybackTargetInput): Promise<PlaybackTarget | null> {
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return null;
  }

  const session = await input.repositories.playbackSessions.findByRoomId(room.id);
  if (!session?.currentQueueEntryId) {
    return null;
  }

  const queueEntry = await input.repositories.queueEntries.findById(session.currentQueueEntryId);
  if (!queueEntry) {
    return null;
  }

  if (!input.repositories.playableMedia || !input.mediaGateway) {
    return null;
  }
  return buildSourcePlaybackTarget({
    ...input,
    room,
    queueEntry,
    sessionVersion: session.version,
    resumePositionMs: session.playerPositionMs,
    nextQueueEntryId: session.nextQueueEntryId
  });
}

async function buildSourcePlaybackTarget(input: BuildPlaybackTargetInput & {
  room: Room;
  queueEntry: QueueEntry;
  sessionVersion: number;
  resumePositionMs: number;
  nextQueueEntryId: string | null;
}): Promise<PlaybackTarget | null> {
  const source = sourceRefFromQueueEntry(input.queueEntry);
  const asset = await input.repositories.playableMedia?.findPlayableBySource(source);
  if (!asset || asset.status !== "ready" || !input.mediaGateway) {
    return null;
  }

  const effectiveVocalMode = effectiveVocalModeForPlayableMedia(asset, input.queueEntry);
  const playbackSource =
    effectiveVocalMode === "instrumental" && asset.variantFilePaths?.instrumental
      ? { ...source, variant: "instrumental" as const }
      : source;

  return {
    roomId: input.room.id,
    sessionVersion: input.sessionVersion,
    queueEntryId: input.queueEntry.id,
    sourceType: asset.sourceType,
    songId: asset.songId,
    assetId: asset.assetId,
    currentQueueEntryPreview: queuePreviewFromPlayableMedia(input.queueEntry, asset),
    playbackUrl: input.mediaGateway.createPlaybackUrl(playbackSource),
    resumePositionMs: input.resumePositionMs,
    vocalMode: effectiveVocalMode,
    switchFamily: switchFamilyForPlayableMedia(asset),
    playbackProfile: asset.playbackProfile,
    selectedTrackRef: selectedTrackRefForPlayableMedia(asset, effectiveVocalMode),
    nextQueueEntryPreview: await buildNextQueueEntryPreview(input.room, input.nextQueueEntryId, input.repositories)
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

  if (!repositories.playableMedia) {
    return null;
  }

  const nextQueueEntry = await repositories.queueEntries.findById(nextQueueEntryId);
  if (!nextQueueEntry) {
    return null;
  }

  const nextAsset = await repositories.playableMedia.findPlayableBySource(sourceRefFromQueueEntry(nextQueueEntry));
  if (nextAsset) {
    return queuePreviewFromPlayableMedia(nextQueueEntry, nextAsset);
  }

  return null;
}

function queuePreviewFromPlayableMedia(queueEntry: QueueEntry, asset: PlayableMediaAsset): QueueEntryPreview {
  return {
    queueEntryId: queueEntry.id,
    songTitle: asset.title,
    artistName: asset.artistName,
    requestedByUserPhone: queueEntry.requestedByUserPhone ?? null,
    requestedByName: queueEntry.requestedByName ?? null
  };
}

function sourceRefFromQueueEntry(queueEntry: QueueEntry): MediaSourceRef {
  return queueEntry.source ?? {
    sourceType: "nas",
    songId: queueEntry.songId,
    assetId: queueEntry.assetId
  };
}

function effectiveVocalModeForPlayableMedia(asset: PlayableMediaAsset, queueEntry: QueueEntry): VocalMode {
  if (asset.playbackProfile.kind === "single_file_audio_tracks") {
    return queueEntry.playbackOptions.preferredVocalMode ?? "instrumental";
  }
  return queueEntry.playbackOptions.preferredVocalMode ?? "instrumental";
}

function selectedTrackRefForPlayableMedia(asset: PlayableMediaAsset, vocalMode: VocalMode): TrackRef | null {
  if (vocalMode === "original") {
    return asset.trackRoles.original;
  }
  if (vocalMode === "instrumental") {
    return asset.trackRoles.instrumental;
  }
  return null;
}

function switchFamilyForPlayableMedia(asset: PlayableMediaAsset): string | null {
  return asset.playbackProfile.kind === "single_file_audio_tracks" &&
    Boolean(asset.trackRoles.original) &&
    Boolean(asset.trackRoles.instrumental)
    ? "real-mv-audio-track"
    : null;
}
