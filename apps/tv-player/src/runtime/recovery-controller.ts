import type { PlaybackNotice, PlaybackTarget, ReconnectRecoveryResult } from "@home-ktv/player-contracts";
import type { DualVideoPool } from "./video-pool.js";

export interface RecoveryRuntimeClient {
  requestReconnectRecovery(input: { roomSlug: string; deviceId: string }): Promise<ReconnectRecoveryResult>;
}

export type RecoveryRuntimeResult =
  | { status: "idle"; target: null; notice: PlaybackNotice | null }
  | { status: "resume_near_position"; target: PlaybackTarget; notice: PlaybackNotice | null }
  | { status: "fallback_start_over"; target: PlaybackTarget; notice: PlaybackNotice | null };

export interface RecoveryControllerInput {
  client: RecoveryRuntimeClient;
  videoPool: DualVideoPool;
}

export class RecoveryController {
  private readonly client: RecoveryRuntimeClient;
  private readonly videoPool: DualVideoPool;

  constructor(input: RecoveryControllerInput) {
    this.client = input.client;
    this.videoPool = input.videoPool;
  }

  async recover(input: { roomSlug: string; deviceId: string }): Promise<RecoveryRuntimeResult> {
    const result = await this.client.requestReconnectRecovery(input);
    if (result.status === "idle" || !result.target) {
      return {
        status: "idle",
        target: null,
        notice: result.notice
      };
    }

    this.videoPool.primeActive(result.target);
    await this.videoPool.playActiveUntilReady();

    return {
      status: result.status,
      target: result.target,
      notice: result.notice
    };
  }
}
