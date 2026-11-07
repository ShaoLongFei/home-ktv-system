import type { PlaybackTarget, RoomSnapshot } from "@home-ktv/player-contracts";
import { AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE } from "./playback-capability.js";
import type { DualVideoPool } from "./video-pool.js";

type PlaybackProfile = NonNullable<PlaybackTarget["playbackProfile"]>;

const AUDIO_UNLOCK_KEY = "ktv_audio_unlocked";

export function markAudioUnlocked(): void {
  try {
    globalThis.sessionStorage?.setItem(AUDIO_UNLOCK_KEY, "1");
  } catch {
    // 隐私模式下没有 sessionStorage，忽略
  }
}

function isAudioUnlocked(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(AUDIO_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export type ActivePlaybackResult =
  | { status: "playing"; warning?: string }
  | { status: "blocked"; message: string }
  | { status: "disabled"; reason: "no-current-target" };

export interface ActivePlaybackControllerInput {
  videoPool: DualVideoPool;
}

export class ActivePlaybackController {
  private readonly videoPool: DualVideoPool;

  constructor(input: ActivePlaybackControllerInput) {
    this.videoPool = input.videoPool;
  }

  async ensurePlaying(snapshot: RoomSnapshot): Promise<ActivePlaybackResult> {
    if (!snapshot.currentTarget) {
      this.videoPool.disable();
      return { status: "disabled", reason: "no-current-target" };
    }

    this.videoPool.applyVolume(snapshot.volumePercent);
    const contentType = contentTypeForPlaybackProfile(snapshot.currentTarget.playbackProfile);
    if (contentType && this.videoPool.activeVideo.canPlayType?.(contentType) === "") {
      return {
        status: "blocked",
        message: `media-not-supported: ${contentType}`
      };
    }

    const targetChanged = !isSamePlaybackTarget(this.videoPool.activeTarget, snapshot.currentTarget);
    // 同一条队列项也可能换了播放地址（重新准备/转码完成），只看 id 会漏掉，
    // 电视上就会一直放着上一次的源，直到有人点一下才重载
    const urlChanged = this.videoPool.activeTarget?.playbackUrl !== snapshot.currentTarget.playbackUrl;
    if (targetChanged || urlChanged) {
      this.videoPool.primeActive(snapshot.currentTarget);
    }

    const shouldSelectAudioTrack =
      targetChanged &&
      (snapshot.currentTarget.playbackProfile?.requiresAudioTrackSelection === true ||
        snapshot.currentTarget.selectedTrackRef != null);
    let playbackWarning: string | undefined;
    if (shouldSelectAudioTrack) {
      const selectionResult = this.videoPool.selectActiveAudioTrack(snapshot.currentTarget);
      if (selectionResult.status !== "selected") {
        if (selectionResult.status === "unsupported" && selectionResult.message === AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE) {
          playbackWarning = selectionResult.message;
        } else {
          return {
            status: "blocked",
            message: selectionResult.message
          };
        }
      }
    }

    if (!targetChanged && this.videoPool.activeVideo.paused === false) {
      return { status: "playing" };
    }

    // 用户在这个会话里点过屏幕，浏览器已经放行，刷新后也可以直接出声，
    // 不用再走"先静音再取消静音"那一套
    const shouldTemporarilyMute =
      targetChanged && this.videoPool.activeVideo.paused && !isAudioUnlocked();
    const previousMuted = this.videoPool.activeVideo.muted;
    if (shouldTemporarilyMute) {
      this.videoPool.activeVideo.muted = true;
    }

    try {
      await this.videoPool.playActiveUntilReady();
      if (shouldTemporarilyMute) {
        const video = this.videoPool.activeVideo;
        video.muted = previousMuted;
        // 页面刷新后没有任何用户交互，浏览器允许静音自动播放，但一取消静音
        // 就会把播放暂停。宁可先不出声，也不能让画面停住等人来点一下。
        if (previousMuted === false) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (video.paused) {
            video.muted = true;
            try {
              await video.play();
            } catch {
              // 还播不了就交给上层提示
            }
          }
        }
      }
      return playbackWarning ? { status: "playing", warning: playbackWarning } : { status: "playing" };
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

function contentTypeForPlaybackProfile(profile: PlaybackProfile | null | undefined): string | null {
  const container = profile?.container?.toLocaleLowerCase() ?? "";
  if (container.includes("matroska") || container.includes("webm")) {
    return "video/x-matroska";
  }

  if (container.includes("mpeg")) {
    return "video/mpeg";
  }

  if (container.includes("mp4") || container.includes("mov") || container.includes("quicktime")) {
    return "video/mp4";
  }

  return null;
}

export function isSamePlaybackTarget(
  current: PlaybackTarget | null | undefined,
  next: PlaybackTarget | null | undefined
): boolean {
  return Boolean(
    current &&
      next &&
      current.queueEntryId === next.queueEntryId &&
      current.sourceType === next.sourceType &&
      current.assetId === next.assetId
  );
}
