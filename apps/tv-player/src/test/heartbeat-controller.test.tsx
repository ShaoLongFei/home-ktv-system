import type { PlaybackTarget, RoomSnapshot } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import { HeartbeatController, type HeartbeatRuntimeClient } from "../runtime/heartbeat-controller.js";
import { DualVideoPool, type KtvVideoElement } from "../runtime/video-pool.js";

describe("heartbeat controller", () => {
  it("reports the current queue entry and playback position while playing", async () => {
    const activeVideo = new FakeVideo();
    const pool = new DualVideoPool(activeVideo, new FakeVideo());
    pool.primeActive(playbackTarget());
    activeVideo.currentTime = 42.25;
    const client = new FakeHeartbeatClient();

    const result = await new HeartbeatController({ client, videoPool: pool }).send(snapshot());

    expect(result.status).toBe("sent");
    expect(client.heartbeats).toEqual([
      {
        currentQueueEntryId: "queue-current",
        playbackPositionMs: 42250,
        health: "ok"
      }
    ]);
  });
});

class FakeHeartbeatClient implements HeartbeatRuntimeClient {
  readonly heartbeats: Array<{ currentQueueEntryId: string | null; playbackPositionMs: number; health?: "ok" | "degraded" | "blocked" }> = [];

  async sendHeartbeat(input: {
    currentQueueEntryId: string | null;
    playbackPositionMs: number;
    health?: "ok" | "degraded" | "blocked";
  }): Promise<void> {
    this.heartbeats.push(input);
  }
}

class FakeVideo implements KtvVideoElement {
  currentTime = 0;
  hidden = false;
  muted = false;
  paused = false;
  readyState = 4;
  src = "";

  load(): void {}

  pause(): void {
    this.paused = true;
  }

  async play(): Promise<void> {
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
    resumePositionMs: 0,
    vocalMode: "original",
    switchFamily: "family-main",
    nextQueueEntryPreview: null
  };
}
