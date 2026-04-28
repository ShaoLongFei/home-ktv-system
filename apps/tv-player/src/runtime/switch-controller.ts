import type {
  PlayerTelemetryKind,
  RoomSnapshot,
  SwitchTarget,
  SwitchTransitionResult
} from "@home-ktv/player-contracts";
import type { DualVideoPool } from "./video-pool.js";

type VocalMode = NonNullable<RoomSnapshot["currentTarget"]>["vocalMode"];

export interface SwitchRuntimeClient {
  requestSwitchTransition(input: { roomSlug: string; playbackPositionMs: number }): Promise<SwitchTransitionResult>;
  sendTelemetry(input: {
    roomSlug: string;
    deviceId: string;
    eventType: PlayerTelemetryKind;
    sessionVersion: number;
    queueEntryId: string;
    assetId: string;
    playbackPositionMs: number;
    vocalMode: VocalMode;
    switchFamily: string | null;
    rollbackAssetId: string | null;
    message?: string;
    stage?: string;
  }): Promise<void>;
}

export type SwitchRuntimeResult =
  | { status: "committed"; switchTarget: SwitchTarget }
  | { status: "reverted"; switchTarget: SwitchTarget; message: string }
  | { status: "unavailable"; reason: string }
  | { status: "disabled"; reason: "conflict" | "no-current-target" };

export interface SwitchControllerInput {
  client: SwitchRuntimeClient;
  videoPool: DualVideoPool;
  deviceId?: string;
}

export class SwitchController {
  private readonly client: SwitchRuntimeClient;
  private readonly deviceId: string;
  private readonly videoPool: DualVideoPool;

  constructor(input: SwitchControllerInput) {
    this.client = input.client;
    this.videoPool = input.videoPool;
    this.deviceId = input.deviceId ?? "tv-player";
  }

  async switchVocalMode(snapshot: RoomSnapshot): Promise<SwitchRuntimeResult> {
    if (!canAttemptRuntimePlayback(snapshot)) {
      this.videoPool.disable();
      return {
        status: "disabled",
        reason: snapshot.conflict ? "conflict" : "no-current-target"
      };
    }

    if (snapshot.currentTarget && this.videoPool.activeTarget?.assetId !== snapshot.currentTarget.assetId) {
      this.videoPool.primeActive(snapshot.currentTarget);
    }

    const playbackPositionMs = Math.max(0, Math.trunc(this.videoPool.activeVideo.currentTime * 1000));
    const transition = await this.client.requestSwitchTransition({
      roomSlug: snapshot.roomSlug,
      playbackPositionMs
    });

    if (transition.status !== "ready" || !transition.switchTarget) {
      return {
        status: "unavailable",
        reason: transition.reason ?? "SWITCH_TARGET_NOT_AVAILABLE"
      };
    }

    try {
      this.videoPool.prepareStandby(transition.switchTarget);
      await this.videoPool.playStandbyUntilReady();
      this.videoPool.commitStandby();
      return {
        status: "committed",
        switchTarget: transition.switchTarget
      };
    } catch (error) {
      this.videoPool.rollback();
      await this.reportSwitchFailure(snapshot, transition.switchTarget, error);
      return {
        status: "reverted",
        switchTarget: transition.switchTarget,
        message: "Switch failed and playback returned to the previous version."
      };
    }
  }

  private async reportSwitchFailure(snapshot: RoomSnapshot, switchTarget: SwitchTarget, error: unknown): Promise<void> {
    await this.client.sendTelemetry({
      roomSlug: snapshot.roomSlug,
      deviceId: this.deviceId,
      eventType: "switch_failed",
      sessionVersion: switchTarget.sessionVersion,
      queueEntryId: switchTarget.queueEntryId,
      assetId: switchTarget.toAssetId,
      playbackPositionMs: switchTarget.resumePositionMs,
      vocalMode: switchTarget.vocalMode,
      switchFamily: switchTarget.switchFamily,
      rollbackAssetId: switchTarget.rollbackAssetId,
      message: error instanceof Error ? error.message : "standby playback failed",
      stage: "standby"
    });
  }
}

export function canAttemptRuntimePlayback(snapshot: RoomSnapshot | null): boolean {
  return Boolean(snapshot?.currentTarget) && snapshot?.state !== "conflict" && !snapshot?.conflict;
}
