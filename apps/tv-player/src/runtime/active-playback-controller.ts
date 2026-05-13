import type { RoomSnapshot } from "@home-ktv/player-contracts";
import type { DualVideoPool } from "./video-pool.js";

export type ActivePlaybackResult =
  | { status: "playing" }
  | { status: "blocked"; message: string }
  | { status: "disabled"; reason: "conflict" | "no-current-target" };

export interface ActivePlaybackControllerInput {
  videoPool: DualVideoPool;
}

export class ActivePlaybackController {
  private readonly videoPool: DualVideoPool;

  constructor(input: ActivePlaybackControllerInput) {
    this.videoPool = input.videoPool;
  }

  async ensurePlaying(snapshot: RoomSnapshot): Promise<ActivePlaybackResult> {
    if (snapshot.conflict || snapshot.state === "conflict") {
      this.videoPool.disable();
      return { status: "disabled", reason: "conflict" };
    }

    if (!snapshot.currentTarget) {
      this.videoPool.disable();
      return { status: "disabled", reason: "no-current-target" };
    }

    const targetChanged = this.videoPool.activeTarget?.assetId !== snapshot.currentTarget.assetId;
    if (targetChanged) {
      this.videoPool.primeActive(snapshot.currentTarget);
    }

    const shouldSelectAudioTrack =
      targetChanged &&
      (snapshot.currentTarget.playbackProfile?.requiresAudioTrackSelection === true ||
        snapshot.currentTarget.selectedTrackRef != null);
    if (shouldSelectAudioTrack) {
      const selectionResult = this.videoPool.selectActiveAudioTrack(snapshot.currentTarget);
      if (selectionResult.status !== "selected") {
        return {
          status: "blocked",
          message: selectionResult.message
        };
      }
    }

    if (!targetChanged && this.videoPool.activeVideo.paused === false) {
      return { status: "playing" };
    }

    const shouldTemporarilyMute = targetChanged && this.videoPool.activeVideo.paused;
    const previousMuted = this.videoPool.activeVideo.muted;
    if (shouldTemporarilyMute) {
      this.videoPool.activeVideo.muted = true;
    }

    try {
      await this.videoPool.playActiveUntilReady();
      if (shouldTemporarilyMute) {
        this.videoPool.activeVideo.muted = previousMuted;
      }
      return { status: "playing" };
    } catch (error) {
      if (shouldTemporarilyMute) {
        this.videoPool.activeVideo.muted = previousMuted;
      }
      return {
        status: "blocked",
        message: error instanceof Error ? error.message : "Playback start was blocked"
      };
    }
  }
}
