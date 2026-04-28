import type { PlaybackTarget, ReconnectRecoveryResult } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import { RecoveryController, type RecoveryRuntimeClient } from "../runtime/recovery-controller.js";
import { DualVideoPool, type KtvVideoElement } from "../runtime/video-pool.js";

describe("reconnect recovery", () => {
  it("resumes near the stored playback position when the backend can honor progress", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());
    const client = new FakeRecoveryClient({
      status: "resume_near_position",
      target: playbackTarget({ resumePositionMs: 81234 }),
      notice: {
        kind: "recovering",
        message: "Playback reconnected and is resuming near the prior position."
      }
    });

    const result = await new RecoveryController({ client, videoPool: pool }).recover({
      roomSlug: "living-room",
      deviceId: "tv-active"
    });

    expect(result.status).toBe("resume_near_position");
    expect(pool.activeVideo.src).toBe("http://ktv.local/media/asset-original");
    expect(pool.activeVideo.currentTime).toBe(81.234);
    expect(activeVideo.playCalls).toBe(1);
  });

  it("restarts from 0 and exposes a fallback notice when resume cannot be honored", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());
    const client = new FakeRecoveryClient({
      status: "fallback_start_over",
      target: playbackTarget({ resumePositionMs: 0 }),
      notice: {
        kind: "recovery_fallback_start_over",
        message: "Playback reconnected, but this song restarted from the beginning."
      }
    });

    const result = await new RecoveryController({ client, videoPool: pool }).recover({
      roomSlug: "living-room",
      deviceId: "tv-active"
    });

    expect(result.status).toBe("fallback_start_over");
    expect(result.notice?.kind).toBe("recovery_fallback_start_over");
    expect(pool.activeVideo.currentTime).toBe(0);
    expect(activeVideo.playCalls).toBe(1);
  });
});

class FakeRecoveryClient implements RecoveryRuntimeClient {
  readonly requests: Array<{ roomSlug: string; deviceId: string }> = [];

  constructor(private readonly result: ReconnectRecoveryResult) {}

  async requestReconnectRecovery(input: { roomSlug: string; deviceId: string }): Promise<ReconnectRecoveryResult> {
    this.requests.push(input);
    return this.result;
  }
}

class FakeVideo implements KtvVideoElement {
  currentTime = 0;
  hidden = false;
  muted = false;
  playCalls = 0;
  readyState = 4;
  src = "";

  load(): void {}

  pause(): void {}

  async play(): Promise<void> {
    this.playCalls += 1;
  }

  addEventListener(_type: string, listener: () => void): void {
    listener();
  }

  removeEventListener(): void {}

  requestVideoFrameCallback(callback: (now: number, metadata: unknown) => void): number {
    callback(0, {});
    return 1;
  }
}

function playbackTarget(input: { resumePositionMs: number }): PlaybackTarget {
  return {
    roomId: "living-room",
    sessionVersion: 4,
    queueEntryId: "queue-current",
    assetId: "asset-original",
    currentQueueEntryPreview: {
      queueEntryId: "queue-current",
      songTitle: "七里香",
      artistName: "周杰伦"
    },
    playbackUrl: "http://ktv.local/media/asset-original",
    resumePositionMs: input.resumePositionMs,
    vocalMode: "original",
    switchFamily: "family-main",
    nextQueueEntryPreview: null
  };
}
