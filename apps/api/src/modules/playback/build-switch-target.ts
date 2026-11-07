import type { MediaSourceRef, QueueEntry } from "@home-ktv/domain";
import type { SwitchTarget } from "@home-ktv/player-contracts";
import type { MediaGateway } from "../media/media-gateway.js";
import type { PlayableMediaAsset, PlayableMediaRepository } from "../media/playable-media-repository.js";
import type { RoomRepository } from "../rooms/repositories/room-repository.js";
import type { PlaybackSessionRepository } from "./repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "./repositories/queue-entry-repository.js";

export interface BuildSwitchTargetRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  playableMedia?: PlayableMediaRepository;
}

export interface BuildSwitchTargetInput {
  roomSlug: string;
  repositories: BuildSwitchTargetRepositories;
  mediaGateway?: Pick<MediaGateway, "createPlaybackUrl">;
}

export async function buildSwitchTarget(input: BuildSwitchTargetInput): Promise<SwitchTarget | null> {
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

  return buildSourceSwitchTarget({
    roomId: room.id,
    sessionVersion: session.version,
    resumePositionMs: session.playerPositionMs,
    queueEntry,
    playableMedia: input.repositories.playableMedia,
    mediaGateway: input.mediaGateway
  });
}

async function buildSourceSwitchTarget(input: {
  roomId: string;
  sessionVersion: number;
  queueEntry: QueueEntry;
  resumePositionMs: number;
  playableMedia: PlayableMediaRepository;
  mediaGateway: Pick<MediaGateway, "createPlaybackUrl">;
}): Promise<SwitchTarget | null> {
  const source = sourceRefFromQueueEntry(input.queueEntry);
  const asset = await input.playableMedia.findPlayableBySource(source);
  if (!asset || asset.status !== "ready") {
    return null;
  }

  // 浏览器（Chrome/Edge）没有 HTMLMediaElement.audioTracks，单文件切轨必然失败；
  // 有抽出的伴奏文件时改用「换源」路径，原生端与 Web 端都能工作。
  if (asset.variantFilePaths?.instrumental) {
    const targetMode = nextRealMvVocalMode(committedVocalModeForQueueEntry(input.queueEntry));
    const playbackUrl = input.mediaGateway.createPlaybackUrl(
      targetMode === "instrumental" ? { ...source, variant: "instrumental" } : source
    );
    return {
      roomId: input.roomId,
      sessionVersion: input.sessionVersion,
      queueEntryId: input.queueEntry.id,
      switchKind: "asset",
      sourceType: asset.sourceType,
      fromAssetId: asset.assetId,
      toAssetId: asset.assetId,
      playbackUrl,
      switchFamily: "real-mv-variant",
      vocalMode: targetMode,
      resumePositionMs: input.resumePositionMs,
      rollbackAssetId: asset.assetId,
      playbackProfile: asset.playbackProfile,
      selectedTrackRef: null
    };
  }

  if (asset.playbackProfile.kind !== "single_file_audio_tracks") {
    return null;
  }

  return buildPlayableAudioTrackSwitchTarget({
    roomId: input.roomId,
    sessionVersion: input.sessionVersion,
    queueEntry: input.queueEntry,
    asset,
    resumePositionMs: input.resumePositionMs,
    playbackUrl: input.mediaGateway.createPlaybackUrl(source)
  });
}

function committedVocalModeForQueueEntry(queueEntry: QueueEntry): "original" | "instrumental" {
  const preferredVocalMode = queueEntry.playbackOptions.preferredVocalMode;
  return preferredVocalMode === "original" || preferredVocalMode === "instrumental"
    ? preferredVocalMode
    : "instrumental";
}

function nextRealMvVocalMode(current: "original" | "instrumental"): "original" | "instrumental" {
  return current === "original" ? "instrumental" : "original";
}

function buildPlayableAudioTrackSwitchTarget(input: {
  roomId: string;
  sessionVersion: number;
  queueEntry: QueueEntry;
  asset: PlayableMediaAsset;
  resumePositionMs: number;
  playbackUrl: string;
}): SwitchTarget | null {
  const targetMode = nextRealMvVocalMode(committedVocalModeForQueueEntry(input.queueEntry));
  const selectedTrackRef = targetMode === "original" ? input.asset.trackRoles.original : input.asset.trackRoles.instrumental;
  if (!selectedTrackRef) {
    return null;
  }

  return {
    roomId: input.roomId,
    sessionVersion: input.sessionVersion,
    queueEntryId: input.queueEntry.id,
    switchKind: "audio_track",
    sourceType: input.asset.sourceType,
    fromAssetId: input.asset.assetId,
    toAssetId: input.asset.assetId,
    playbackUrl: input.playbackUrl,
    switchFamily: "real-mv-audio-track",
    vocalMode: targetMode,
    resumePositionMs: input.resumePositionMs,
    rollbackAssetId: input.asset.assetId,
    playbackProfile: input.asset.playbackProfile,
    selectedTrackRef
  };
}

function sourceRefFromQueueEntry(queueEntry: QueueEntry): MediaSourceRef {
  return queueEntry.source ?? {
    sourceType: "nas",
    songId: queueEntry.songId,
    assetId: queueEntry.assetId
  };
}
