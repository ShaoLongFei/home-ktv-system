import type { PlaybackNotice, ReconnectRecoveryResult } from "@home-ktv/player-contracts";
import type { AssetGateway } from "../assets/asset-gateway.js";
import type { PlaybackEventRepository } from "./repositories/playback-event-repository.js";
import { buildPlaybackTarget, type BuildPlaybackTargetRepositories } from "./build-playback-target.js";

export interface ApplyReconnectRecoveryRepositories extends BuildPlaybackTargetRepositories {
  playbackEvents: PlaybackEventRepository;
}

export interface ApplyReconnectRecoveryInput {
  roomSlug: string;
  deviceId: string;
  repositories: ApplyReconnectRecoveryRepositories;
  assetGateway: AssetGateway;
}

export async function applyReconnectRecovery(input: ApplyReconnectRecoveryInput): Promise<ReconnectRecoveryResult> {
  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return {
      status: "idle",
      target: null,
      notice: null
    };
  }

  const target = await buildPlaybackTarget({
    roomSlug: input.roomSlug,
    repositories: input.repositories,
    assetGateway: input.assetGateway
  });

  if (!target) {
    return {
      status: "idle",
      target: null,
      notice: null
    };
  }

  const asset = await input.repositories.assets.findById(target.assetId);
  const canResumeNearPriorPosition =
    Boolean(asset) && target.resumePositionMs > 0 && target.resumePositionMs < Math.max((asset?.durationMs ?? 0) - 1000, 0);

  if (canResumeNearPriorPosition) {
    return {
      status: "resume_near_position",
      target,
      notice: recoveringNotice()
    };
  }

  await input.repositories.playbackEvents.append({
    roomId: room.id,
    queueEntryId: target.queueEntryId,
    eventType: "recovery_fallback_start_over",
    eventPayload: {
      deviceId: input.deviceId,
      assetId: target.assetId,
      previousPositionMs: target.resumePositionMs,
      resumedPositionMs: 0
    }
  });

  return {
    status: "fallback_start_over",
    target: {
      ...target,
      resumePositionMs: 0
    },
    notice: fallbackNotice()
  };
}

function recoveringNotice(): PlaybackNotice {
  return {
    kind: "recovering",
    message: "Playback reconnected and is resuming near the prior position."
  };
}

function fallbackNotice(): PlaybackNotice {
  return {
    kind: "recovery_fallback_start_over",
    message: "Playback reconnected, but this song restarted from the beginning."
  };
}
