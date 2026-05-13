import type { Asset, QueueEntry, TrackRef } from "@home-ktv/domain";
import type { SwitchTarget } from "@home-ktv/player-contracts";
import type { AssetGateway } from "../assets/asset-gateway.js";
import type { AssetRepository } from "../catalog/repositories/asset-repository.js";
import type { RoomRepository } from "../rooms/repositories/room-repository.js";
import type { PlaybackSessionRepository } from "./repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "./repositories/queue-entry-repository.js";

export interface BuildSwitchTargetRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
}

export interface BuildSwitchTargetInput {
  roomSlug: string;
  repositories: BuildSwitchTargetRepositories;
  assetGateway: AssetGateway;
}

export async function buildSwitchTarget(input: BuildSwitchTargetInput): Promise<SwitchTarget | null> {
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return null;
  }

  const session = await input.repositories.playbackSessions.findByRoomId(room.id);
  if (!session?.currentQueueEntryId || !session.activeAssetId) {
    return null;
  }

  const [queueEntry, currentAsset] = await Promise.all([
    input.repositories.queueEntries.findById(session.currentQueueEntryId),
    input.repositories.assets.findById(session.activeAssetId)
  ]);

  if (!queueEntry || !currentAsset) {
    return null;
  }

  if (isSingleFileRealMvAsset(currentAsset)) {
    return buildRealMvSwitchTarget({
      roomId: room.id,
      sessionVersion: session.version,
      queueEntry,
      currentAsset,
      resumePositionMs: session.playerPositionMs,
      assetGateway: input.assetGateway
    });
  }

  if (!currentAsset.switchFamily) {
    return null;
  }

  const counterparts = await input.repositories.assets.findVerifiedSwitchCounterparts(currentAsset);
  const verifiedCounterparts = counterparts.filter(
    (candidate) =>
      candidate.switchFamily === currentAsset.switchFamily &&
      candidate.vocalMode !== currentAsset.vocalMode &&
      candidate.status === "ready" &&
      candidate.switchQualityStatus === "verified"
  );

  if (verifiedCounterparts.length !== 1) {
    return null;
  }

  const targetAsset = verifiedCounterparts[0];
  if (!targetAsset?.switchFamily) {
    return null;
  }

  const selectedTrackRef = selectedTrackRefForAsset(targetAsset);

  return {
    roomId: room.id,
    sessionVersion: session.version,
    queueEntryId: queueEntry.id,
    switchKind: "asset",
    fromAssetId: currentAsset.id,
    toAssetId: targetAsset.id,
    playbackUrl: input.assetGateway.createPlaybackUrl(targetAsset.id),
    switchFamily: targetAsset.switchFamily,
    vocalMode: targetAsset.vocalMode,
    rollbackAssetId: currentAsset.id,
    resumePositionMs: session.playerPositionMs,
    ...(targetAsset.playbackProfile ? { playbackProfile: targetAsset.playbackProfile } : {}),
    ...(selectedTrackRef ? { selectedTrackRef } : {})
  };
}

function isSingleFileRealMvAsset(asset: Asset): boolean {
  return asset.playbackProfile?.kind === "single_file_audio_tracks" || asset.assetKind === "dual-track-video";
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

function selectedTrackRefForRealMvSwitch(asset: Asset, vocalMode: "original" | "instrumental"): TrackRef | null {
  return vocalMode === "original" ? asset.trackRoles?.original ?? null : asset.trackRoles?.instrumental ?? null;
}

function selectedTrackRefForAsset(asset: Asset): TrackRef | null {
  if (asset.vocalMode === "original") {
    return asset.trackRoles?.original ?? null;
  }
  if (asset.vocalMode === "instrumental") {
    return asset.trackRoles?.instrumental ?? null;
  }
  return null;
}

function buildRealMvSwitchTarget(input: {
  roomId: string;
  sessionVersion: number;
  queueEntry: QueueEntry;
  currentAsset: Asset;
  resumePositionMs: number;
  assetGateway: AssetGateway;
}): SwitchTarget | null {
  const targetMode = nextRealMvVocalMode(committedVocalModeForQueueEntry(input.queueEntry));
  const selectedTrackRef = selectedTrackRefForRealMvSwitch(input.currentAsset, targetMode);
  if (!selectedTrackRef) {
    return null;
  }

  return {
    roomId: input.roomId,
    sessionVersion: input.sessionVersion,
    queueEntryId: input.queueEntry.id,
    switchKind: "audio_track",
    fromAssetId: input.currentAsset.id,
    toAssetId: input.currentAsset.id,
    playbackUrl: input.assetGateway.createPlaybackUrl(input.currentAsset.id),
    switchFamily: input.currentAsset.switchFamily ?? "real-mv-audio-track",
    vocalMode: targetMode,
    resumePositionMs: input.resumePositionMs,
    rollbackAssetId: input.currentAsset.id,
    ...(input.currentAsset.playbackProfile ? { playbackProfile: input.currentAsset.playbackProfile } : {}),
    selectedTrackRef
  };
}
