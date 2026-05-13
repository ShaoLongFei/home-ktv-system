import type {
  PlayerTelemetryKind,
  RoomSnapshot,
  SwitchTarget,
  SwitchTransitionResult
} from "@home-ktv/player-contracts";
import type { AudioTrackSelectionResult, DualVideoPool } from "./video-pool.js";
import { selectAudioTrack } from "./video-pool.js";

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

    if (transition.switchTarget.switchKind === "audio_track") {
      return this.commitAudioTrackSwitch(snapshot, transition.switchTarget);
    }

    try {
      this.videoPool.prepareStandby(transition.switchTarget);
      await this.videoPool.playStandbyUntilReady();
      this.videoPool.commitStandby();
      await this.reportSwitchCommitted(snapshot, transition.switchTarget);
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

  private async commitAudioTrackSwitch(snapshot: RoomSnapshot, switchTarget: SwitchTarget): Promise<SwitchRuntimeResult> {
    const previousPositionMs = Math.max(0, Math.trunc(this.videoPool.activeVideo.currentTime * 1000));
    const result = selectAudioTrack(this.videoPool.activeVideo, switchTarget.selectedTrackRef);
    if (result.status !== "selected") {
      await this.reportSwitchFailure(snapshot, switchTarget, new Error(result.message), "audio_track", previousPositionMs);
      return {
        status: "reverted",
        switchTarget,
        message: revertedMessageForAudioTrackSelection(result)
      };
    }

    this.videoPool.commitActiveAudioTrackSwitch(switchTarget);
    await this.reportSwitchCommitted(snapshot, switchTarget);
    return {
      status: "committed",
      switchTarget
    };
  }

  private async reportSwitchFailure(
    snapshot: RoomSnapshot,
    switchTarget: SwitchTarget,
    error: unknown,
    stage = "standby",
    playbackPositionMs = switchTarget.resumePositionMs
  ): Promise<void> {
    await this.client.sendTelemetry({
      roomSlug: snapshot.roomSlug,
      deviceId: this.deviceId,
      eventType: "switch_failed",
      sessionVersion: switchTarget.sessionVersion,
      queueEntryId: switchTarget.queueEntryId,
      assetId: switchTarget.toAssetId,
      playbackPositionMs,
      vocalMode: snapshot.currentTarget?.vocalMode ?? switchTarget.vocalMode,
      switchFamily: switchTarget.switchFamily,
      rollbackAssetId: switchTarget.rollbackAssetId,
      message: error instanceof Error ? error.message : "standby playback failed",
      stage
    });
  }

  private async reportSwitchCommitted(snapshot: RoomSnapshot, switchTarget: SwitchTarget): Promise<void> {
    await this.client.sendTelemetry({
      roomSlug: snapshot.roomSlug,
      deviceId: this.deviceId,
      eventType: "playing",
      sessionVersion: switchTarget.sessionVersion,
      queueEntryId: switchTarget.queueEntryId,
      assetId: switchTarget.toAssetId,
      playbackPositionMs: Math.max(0, Math.trunc(this.videoPool.activeVideo.currentTime * 1000)),
      vocalMode: switchTarget.vocalMode,
      switchFamily: switchTarget.switchFamily,
      rollbackAssetId: switchTarget.rollbackAssetId,
      stage: "switch_committed"
    });
  }
}

function revertedMessageForAudioTrackSelection(result: Exclude<AudioTrackSelectionResult, { status: "selected" }>): string {
  return result.status === "missing_track"
    ? "未找到请求的音轨，已保持当前播放。"
    : "当前电视浏览器不支持切换原唱/伴唱，已保持当前播放。";
}

export function canAttemptRuntimePlayback(snapshot: RoomSnapshot | null): boolean {
  return Boolean(snapshot?.currentTarget) && snapshot?.state !== "conflict" && !snapshot?.conflict;
}
