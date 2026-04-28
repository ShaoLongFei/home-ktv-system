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

  if (!queueEntry || !currentAsset?.switchFamily) {
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

  return {
    roomId: room.id,
    sessionVersion: session.version,
    queueEntryId: queueEntry.id,
    fromAssetId: currentAsset.id,
    toAssetId: targetAsset.id,
    playbackUrl: input.assetGateway.createPlaybackUrl(targetAsset.id),
    switchFamily: targetAsset.switchFamily,
    vocalMode: targetAsset.vocalMode,
    rollbackAssetId: currentAsset.id,
    resumePositionMs: session.playerPositionMs
  };
}
