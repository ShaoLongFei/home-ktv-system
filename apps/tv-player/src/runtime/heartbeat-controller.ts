import type { RoomSnapshot } from "@home-ktv/player-contracts";
import type { DualVideoPool } from "./video-pool.js";

export interface HeartbeatRuntimeClient {
  sendHeartbeat(input: {
    currentQueueEntryId: string | null;
    playbackPositionMs: number;
    health?: "ok" | "degraded" | "blocked";
  }): Promise<void>;
}

export type HeartbeatResult = { status: "sent" } | { status: "skipped"; reason: "conflict" | "no-current-target" };

export interface HeartbeatControllerInput {
  client: HeartbeatRuntimeClient;
  videoPool: DualVideoPool;
}

export class HeartbeatController {
  private readonly client: HeartbeatRuntimeClient;
  private readonly videoPool: DualVideoPool;

  constructor(input: HeartbeatControllerInput) {
    this.client = input.client;
    this.videoPool = input.videoPool;
  }

  async send(snapshot: RoomSnapshot): Promise<HeartbeatResult> {
    if (snapshot.conflict || snapshot.state === "conflict") {
      return { status: "skipped", reason: "conflict" };
    }

    const target = this.videoPool.activeTarget ?? snapshot.currentTarget;
    if (!target) {
      return { status: "skipped", reason: "no-current-target" };
    }

    await this.client.sendHeartbeat({
      currentQueueEntryId: target.queueEntryId,
      playbackPositionMs: Math.max(0, Math.trunc(this.videoPool.activeVideo.currentTime * 1000)),
      health: "ok"
    });

    return { status: "sent" };
  }
}
