import type { PlaybackTarget, SwitchTarget } from "@home-ktv/player-contracts";

export interface KtvVideoElement {
  currentTime: number;
  duration: number;
  hidden: boolean | "until-found";
  muted: boolean;
  paused?: boolean;
  readyState: number;
  src: string;
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions | boolean): void;
  load(): void;
  pause(): void;
  play(): Promise<void>;
  removeEventListener(type: string, listener: () => void): void;
  requestVideoFrameCallback?: (callback: (now: number, metadata: unknown) => void) => number;
}

export class DualVideoPool {
  activeVideo: KtvVideoElement;
  standbyVideo: KtvVideoElement;
  activeTarget: PlaybackTarget | null = null;

  private previousTarget: PlaybackTarget | null = null;
  private standbyTarget: SwitchTarget | null = null;

  constructor(activeVideo: KtvVideoElement, standbyVideo: KtvVideoElement) {
    this.activeVideo = activeVideo;
    this.standbyVideo = standbyVideo;
    this.activeVideo.hidden = false;
    this.standbyVideo.hidden = true;
  }

  primeActive(target: PlaybackTarget): void {
    this.activeTarget = target;
    this.activeVideo.src = target.playbackUrl;
    this.activeVideo.currentTime = msToSeconds(target.resumePositionMs);
    this.activeVideo.hidden = false;
    this.activeVideo.load();
  }

  async playActiveUntilReady(): Promise<void> {
    await this.activeVideo.play();
    await waitForReadyPlayback(this.activeVideo);
  }

  prepareStandby(target: SwitchTarget): void {
    this.previousTarget = this.activeTarget;
    this.standbyTarget = target;
    this.standbyVideo.src = target.playbackUrl;
    this.standbyVideo.currentTime = msToSeconds(target.resumePositionMs);
    this.standbyVideo.muted = this.activeVideo.muted;
    this.standbyVideo.hidden = false;
    this.standbyVideo.load();
  }

  async playStandbyUntilReady(): Promise<void> {
    await this.standbyVideo.play();
    await waitForReadyPlayback(this.standbyVideo);
  }

  commitStandby(): PlaybackTarget | null {
    if (!this.standbyTarget) {
      return this.activeTarget;
    }

    this.activeVideo.pause();
    this.activeVideo.hidden = true;
    this.standbyVideo.hidden = false;
    [this.activeVideo, this.standbyVideo] = [this.standbyVideo, this.activeVideo];
    this.activeTarget = playbackTargetFromSwitchTarget(this.standbyTarget, this.previousTarget);
    this.previousTarget = null;
    this.standbyTarget = null;
    this.standbyVideo.src = "";
    return this.activeTarget;
  }

  rollback(): void {
    this.standbyVideo.pause();
    this.standbyVideo.hidden = true;
    this.standbyVideo.src = "";
    this.standbyTarget = null;
    this.activeTarget = this.previousTarget ?? this.activeTarget;
    this.previousTarget = null;
    this.activeVideo.hidden = false;
  }

  disable(): void {
    this.activeVideo.pause();
    this.standbyVideo.pause();
    this.activeVideo.hidden = true;
    this.standbyVideo.hidden = true;
    this.activeTarget = null;
    this.previousTarget = null;
    this.standbyTarget = null;
  }
}

export function createBrowserVideoPool(activeVideo: HTMLVideoElement, standbyVideo: HTMLVideoElement): DualVideoPool {
  return new DualVideoPool(activeVideo, standbyVideo);
}

export async function waitForReadyPlayback(video: KtvVideoElement): Promise<void> {
  if (video.requestVideoFrameCallback) {
    await new Promise<void>((resolve) => {
      video.requestVideoFrameCallback?.(() => resolve());
    });
    return;
  }

  if (video.readyState >= 3) {
    return;
  }

  await new Promise<void>((resolve) => {
    const handlePlaying = () => {
      video.removeEventListener("playing", handlePlaying);
      resolve();
    };
    video.addEventListener("playing", handlePlaying, { once: true });
  });
}

function playbackTargetFromSwitchTarget(target: SwitchTarget, previousTarget: PlaybackTarget | null): PlaybackTarget {
  return {
    roomId: target.roomId,
    sessionVersion: target.sessionVersion,
    queueEntryId: target.queueEntryId,
    assetId: target.toAssetId,
    currentQueueEntryPreview: previousTarget?.currentQueueEntryPreview ?? {
      queueEntryId: target.queueEntryId,
      songTitle: "Current song",
      artistName: ""
    },
    playbackUrl: target.playbackUrl,
    resumePositionMs: target.resumePositionMs,
    vocalMode: target.vocalMode,
    switchFamily: target.switchFamily,
    nextQueueEntryPreview: previousTarget?.nextQueueEntryPreview ?? null
  };
}

function msToSeconds(positionMs: number): number {
  return Math.max(0, positionMs) / 1000;
}
