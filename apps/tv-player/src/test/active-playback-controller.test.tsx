import type { PlaybackTarget, RoomSnapshot } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import { ActivePlaybackController } from "../runtime/active-playback-controller.js";
import { DualVideoPool, type KtvVideoElement } from "../runtime/video-pool.js";

describe("active playback controller", () => {
  it("primes and starts the current playback target", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());

    const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(snapshot());

    expect(result.status).toBe("playing");
    expect(pool.activeTarget?.assetId).toBe("asset-original");
    expect(activeVideo.src).toBe("http://ktv.local/media/asset-original");
    expect(activeVideo.currentTime).toBe(12.345);
    expect(activeVideo.playCalls).toBe(1);
  });

  it("starts the first playback muted and restores audible playback after it begins", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());

    const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(snapshot());

    expect(result.status).toBe("playing");
    expect(activeVideo.mutedAtPlay).toEqual([true]);
    expect(activeVideo.muted).toBe(false);
  });

  it("clears the active target when the room becomes idle", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());
    pool.primeActive(playbackTarget());

    const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(idleSnapshot());

    expect(result.status).toBe("disabled");
    expect(pool.activeTarget).toBeNull();
    expect(activeVideo.paused).toBe(true);
  });
});

class FakeVideo implements KtvVideoElement {
  currentTime = 0;
  duration = 180;
  hidden = false;
  muted = false;
  mutedAtPlay: boolean[] = [];
  paused = true;
  playCalls = 0;
  readyState = 4;
  src = "";

  load(): void {}

  pause(): void {
    this.paused = true;
  }

  async play(): Promise<void> {
    this.playCalls += 1;
    this.mutedAtPlay.push(this.muted);
    this.paused = false;
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

function snapshot(): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: 4,
    state: "playing",
    pairing: {
      roomSlug: "living-room",
      controllerUrl: "http://ktv.local/controller?room=living-room",
      qrPayload: "http://ktv.local/controller?room=living-room",
      token: "living-room.test",
      tokenExpiresAt: "2026-04-28T00:05:00.000Z"
    },
    currentTarget: playbackTarget(),
    switchTarget: null,
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z"
  };
}

function idleSnapshot(): RoomSnapshot {
  return {
    ...snapshot(),
    state: "idle",
    currentTarget: null,
    switchTarget: null,
    targetVocalMode: null
  };
}

function playbackTarget(): PlaybackTarget {
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
    resumePositionMs: 12345,
    vocalMode: "original",
    switchFamily: "family-main",
    nextQueueEntryPreview: null
  };
}
