import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import { HeartbeatController, type HeartbeatRuntimeClient } from "../runtime/heartbeat-controller.js";
import { DualVideoPool, type KtvVideoElement } from "../runtime/video-pool.js";

describe("heartbeat presence", () => {
  it("keeps the TV presence online while the room is idle", async () => {
    const pool = new DualVideoPool(new FakeVideo(), new FakeVideo());
    const client = new FakeHeartbeatClient();

    const result = await new HeartbeatController({ client, videoPool: pool }).send(idleSnapshot());

    expect(result.status).toBe("sent");
    expect(client.heartbeats).toEqual([
      {
        currentQueueEntryId: null,
        playbackPositionMs: 0,
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
  duration = 180;
  hidden = false;
  muted = false;
  paused = true;
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
}

function idleSnapshot(): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: 4,
    state: "idle",
    pairing: {
      roomSlug: "living-room",
      controllerUrl: "http://ktv.local/controller?room=living-room",
      qrPayload: "http://ktv.local/controller?room=living-room",
      token: "living-room.test",
      tokenExpiresAt: "2026-04-28T00:05:00.000Z"
    },
    currentTarget: null,
    switchTarget: null,
    targetVocalMode: null,
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z"
  };
}
