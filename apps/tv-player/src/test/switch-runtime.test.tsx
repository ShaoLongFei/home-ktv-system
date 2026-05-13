import type { PlaybackTarget, RoomSnapshot, SwitchTarget, SwitchTransitionResult } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import { SwitchController, canAttemptRuntimePlayback, type SwitchRuntimeClient } from "../runtime/switch-controller.js";
import { DualVideoPool, type KtvVideoElement } from "../runtime/video-pool.js";

describe("switch runtime", () => {
  it("switches from original to instrumental through the backend-authored switch target", async () => {
    const activeVideo = new FakeVideo();
    const standbyVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, standbyVideo);
    pool.primeActive(playbackTarget({ assetId: "asset-original", vocalMode: "original" }));
    activeVideo.currentTime = 82.4;
    const client = new FakeSwitchClient({
      status: "ready",
      switchTarget: switchTarget({ resumePositionMs: 82400 }),
      reason: null
    });

    const result = await new SwitchController({ client, videoPool: pool }).switchVocalMode(snapshot());

    expect(result.status).toBe("committed");
    expect(client.switchRequests).toEqual([{ roomSlug: "living-room", playbackPositionMs: 82400 }]);
    expect(pool.activeVideo.src).toBe("http://ktv.local/media/asset-instrumental");
    expect(pool.activeVideo.currentTime).toBe(82.4);
    expect(pool.activeTarget?.assetId).toBe("asset-instrumental");
    expect(client.telemetry).toMatchObject([
      {
        eventType: "playing",
        assetId: "asset-instrumental",
        playbackPositionMs: 82400,
        vocalMode: "instrumental",
        switchFamily: "family-main",
        rollbackAssetId: "asset-original"
      }
    ]);
  });

  it("rolls back to the prior asset and reports switch_failed when standby play fails", async () => {
    const activeVideo = new FakeVideo();
    const standbyVideo = new FakeVideo();
    standbyVideo.failPlay = true;
    const pool = new DualVideoPool(activeVideo, standbyVideo);
    pool.primeActive(playbackTarget({ assetId: "asset-original", vocalMode: "original" }));
    activeVideo.currentTime = 41;
    const client = new FakeSwitchClient({
      status: "ready",
      switchTarget: switchTarget({ resumePositionMs: 41000 }),
      reason: null
    });

    const result = await new SwitchController({ client, videoPool: pool }).switchVocalMode(snapshot());

    expect(result.status).toBe("reverted");
    expect(pool.activeVideo.src).toBe("http://ktv.local/media/asset-original");
    expect(pool.activeTarget?.assetId).toBe("asset-original");
    expect(client.telemetry).toMatchObject([
      {
        eventType: "switch_failed",
        assetId: "asset-instrumental",
        vocalMode: "original",
        rollbackAssetId: "asset-original",
        playbackPositionMs: 41000
      }
    ]);
  });

  it("keeps playback disabled for an explicit conflict snapshot", async () => {
    const activeVideo = new FakeVideo();
    const standbyVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, standbyVideo);
    const client = new FakeSwitchClient({
      status: "ready",
      switchTarget: switchTarget({ resumePositionMs: 0 }),
      reason: null
    });
    const conflictSnapshot = snapshot({
      state: "conflict",
      currentTarget: null,
      switchTarget: null,
      conflict: {
        kind: "active-player-conflict",
        reason: "active-player-exists",
        roomId: "living-room",
        activeDeviceId: "tv-active",
        activeDeviceName: "Living Room Mini PC",
        message: "This room already has an active TV player."
      }
    });

    const result = await new SwitchController({ client, videoPool: pool }).switchVocalMode(conflictSnapshot);

    expect(canAttemptRuntimePlayback(conflictSnapshot)).toBe(false);
    expect(result.status).toBe("disabled");
    expect(client.switchRequests).toEqual([]);
    expect(activeVideo.playCalls).toBe(0);
    expect(standbyVideo.playCalls).toBe(0);
  });
});

class FakeSwitchClient implements SwitchRuntimeClient {
  readonly switchRequests: Array<{ roomSlug: string; playbackPositionMs: number }> = [];
  readonly telemetry: Array<Record<string, unknown>> = [];

  constructor(private readonly transition: SwitchTransitionResult) {}

  async requestSwitchTransition(input: { roomSlug: string; playbackPositionMs: number }): Promise<SwitchTransitionResult> {
    this.switchRequests.push(input);
    return this.transition;
  }

  async sendTelemetry(input: Record<string, unknown>): Promise<void> {
    this.telemetry.push(input);
  }
}

class FakeVideo implements KtvVideoElement {
  currentTime = 0;
  duration = 180;
  failPlay = false;
  hidden = false;
  muted = false;
  playCalls = 0;
  readyState = 4;
  src = "";

  load(): void {}

  pause(): void {}

  async play(): Promise<void> {
    this.playCalls += 1;
    if (this.failPlay) {
      throw new Error("standby play rejected");
    }
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

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
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
    currentTarget: playbackTarget({ assetId: "asset-original", vocalMode: "original" }),
    switchTarget: switchTarget({ resumePositionMs: 82400 }),
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides
  };
}

function playbackTarget(input: { assetId: string; vocalMode: PlaybackTarget["vocalMode"] }): PlaybackTarget {
  return {
    roomId: "living-room",
    sessionVersion: 4,
    queueEntryId: "queue-current",
    assetId: input.assetId,
    currentQueueEntryPreview: {
      queueEntryId: "queue-current",
      songTitle: "七里香",
      artistName: "周杰伦"
    },
    playbackUrl: `http://ktv.local/media/${input.assetId}`,
    resumePositionMs: 0,
    vocalMode: input.vocalMode,
    switchFamily: "family-main",
    nextQueueEntryPreview: null
  };
}

function switchTarget(input: { resumePositionMs: number }): SwitchTarget {
  return {
    roomId: "living-room",
    sessionVersion: 4,
    queueEntryId: "queue-current",
    switchKind: "asset",
    fromAssetId: "asset-original",
    toAssetId: "asset-instrumental",
    playbackUrl: "http://ktv.local/media/asset-instrumental",
    switchFamily: "family-main",
    vocalMode: "instrumental",
    resumePositionMs: input.resumePositionMs,
    rollbackAssetId: "asset-original"
  };
}
