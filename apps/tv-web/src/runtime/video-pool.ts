import { DEFAULT_ROOM_VOLUME_PERCENT, type PlaybackTarget, type SwitchTarget } from "@home-ktv/player-contracts";
import { AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE } from "./playback-capability.js";

type TrackRef = NonNullable<PlaybackTarget["selectedTrackRef"]>;

export interface SelectableAudioTrack {
  id?: string;
  label?: string;
  enabled: boolean;
}

export interface SelectableAudioTrackList {
  readonly length: number;
  [index: number]: SelectableAudioTrack | undefined;
}

export type AudioTrackSelectionResult =
  | { status: "selected"; previousEnabledIndexes: readonly number[] }
  | { status: "unsupported"; message: string }
  | { status: "missing_track"; message: string };

export interface KtvVideoElement {
  audioTracks?: SelectableAudioTrackList;
  currentTime: number;
  duration: number;
  hidden: boolean | "until-found";
  muted: boolean;
  paused?: boolean;
  readyState: number;
  src: string;
  volume?: number;
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions | boolean): void;
  canPlayType?(type: string): "" | "maybe" | "probably";
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
    // 任何残留的 standby 都必须停掉，否则会出现两路声音叠加。
    this.standbyVideo.pause();
    this.standbyVideo.hidden = true;
    this.standbyVideo.src = "";
    this.standbyTarget = null;
    this.activeTarget = target;
    this.activeVideo.src = target.playbackUrl;
    this.activeVideo.currentTime = msToSeconds(target.resumePositionMs);
    this.activeVideo.hidden = false;
    this.activeVideo.load();
  }

  applyVolume(volumePercent: number | null | undefined): void {
    const normalizedVolume = normalizeVolume(volumePercent);
    this.activeVideo.volume = normalizedVolume;
    this.standbyVideo.volume = normalizedVolume;
  }

  selectActiveAudioTrack(target: PlaybackTarget): AudioTrackSelectionResult {
    return selectAudioTrack(this.activeVideo, target.selectedTrackRef);
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
    // 预加载阶段必须静音：否则 standby 与原视频同时出声，出现「双重原唱」。
    this.standbyVideo.muted = true;
    this.standbyVideo.volume = this.activeVideo.volume ?? normalizeVolume(DEFAULT_ROOM_VOLUME_PERCENT);
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

    // 对齐进度再切换，避免 standby 预加载耗时导致的声音回跳/错位。
    const resumeSeconds = this.activeVideo.currentTime;
    if (Math.abs(this.standbyVideo.currentTime - resumeSeconds) > 0.25) {
      this.standbyVideo.currentTime = resumeSeconds;
    }
    this.standbyVideo.muted = this.activeVideo.muted;
    this.standbyVideo.volume = this.activeVideo.volume ?? normalizeVolume(DEFAULT_ROOM_VOLUME_PERCENT);

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

  commitActiveAudioTrackSwitch(target: SwitchTarget): PlaybackTarget | null {
    this.activeTarget = playbackTargetFromSwitchTarget(target, this.activeTarget);
    return this.activeTarget;
  }

  rollback(): void {
    this.standbyVideo.pause();
    this.standbyVideo.hidden = true;
    this.standbyVideo.muted = false;
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

export function selectAudioTrack(
  video: KtvVideoElement,
  trackRef: TrackRef | null | undefined
): AudioTrackSelectionResult {
  const audioTracks = getSelectableAudioTracks(video);
  const previousEnabledIndexes = audioTracks ? enabledIndexes(audioTracks) : [];

  if (!trackRef) {
    return { status: "selected", previousEnabledIndexes };
  }

  if (!audioTracks) {
    return { status: "unsupported", message: AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE };
  }

  const targetIndex = findAudioTrackIndex(audioTracks, trackRef);
  if (targetIndex == null) {
    return { status: "missing_track", message: "requested audio track is not available" };
  }

  try {
    for (let index = 0; index < audioTracks.length; index += 1) {
      const track = audioTracks[index];
      if (track) {
        track.enabled = index === targetIndex;
      }
    }
  } catch {
    restoreAudioTracks(video, previousEnabledIndexes);
    return { status: "unsupported", message: AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE };
  }

  if (audioTracks[targetIndex]?.enabled !== true) {
    restoreAudioTracks(video, previousEnabledIndexes);
    return { status: "unsupported", message: AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE };
  }

  return { status: "selected", previousEnabledIndexes };
}

export function restoreAudioTracks(video: KtvVideoElement, previousEnabledIndexes: readonly number[]): void {
  const audioTracks = getSelectableAudioTracks(video);
  if (!audioTracks) {
    return;
  }

  const enabledSet = new Set(previousEnabledIndexes);
  for (let index = 0; index < audioTracks.length; index += 1) {
    const track = audioTracks[index];
    if (track) {
      track.enabled = enabledSet.has(index);
    }
  }
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
    sourceType: target.sourceType,
    songId: previousTarget?.songId ?? "",
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
    ...(target.playbackProfile ? { playbackProfile: target.playbackProfile } : {}),
    ...(target.selectedTrackRef ? { selectedTrackRef: target.selectedTrackRef } : {}),
    nextQueueEntryPreview: previousTarget?.nextQueueEntryPreview ?? null
  };
}

function getSelectableAudioTracks(video: KtvVideoElement): SelectableAudioTrackList | null {
  const audioTracks = video.audioTracks;
  return isSelectableAudioTrackList(audioTracks) ? audioTracks : null;
}

function isSelectableAudioTrackList(value: unknown): value is SelectableAudioTrackList {
  if (!value || typeof value !== "object") {
    return false;
  }

  return typeof (value as { length?: unknown }).length === "number";
}

function enabledIndexes(audioTracks: SelectableAudioTrackList): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < audioTracks.length; index += 1) {
    if (audioTracks[index]?.enabled === true) {
      indexes.push(index);
    }
  }
  return indexes;
}

function findAudioTrackIndex(audioTracks: SelectableAudioTrackList, trackRef: TrackRef): number | null {
  const exactIdIndex = findTrackIndex(audioTracks, (track) => track.id === trackRef.id);
  if (exactIdIndex !== null && !isAmbiguousOrdinalId(trackRef.id, audioTracks.length)) {
    return exactIdIndex;
  }

  const label = trackRef.label.trim();
  if (label) {
    const labelIndex = findUniqueTrackIndex(
      audioTracks,
      (track) => track.label?.toLocaleLowerCase().includes(label.toLocaleLowerCase()) === true
    );
    if (labelIndex !== null) {
      return labelIndex;
    }
  }

  if (trackRef.index > 0 && audioTracks[trackRef.index - 1]) {
    return trackRef.index - 1;
  }

  if (audioTracks[trackRef.index]) {
    return trackRef.index;
  }

  if (exactIdIndex !== null) {
    return exactIdIndex;
  }

  const numericId = toTrackNumericId(trackRef.id);
  if (numericId !== null) {
    const numericIdIndex = findTrackIndex(audioTracks, (track) => toTrackNumericId(track.id) === numericId);
    if (numericIdIndex !== null) {
      return numericIdIndex;
    }
  }

  return null;
}

function findTrackIndex(
  audioTracks: SelectableAudioTrackList,
  predicate: (track: SelectableAudioTrack) => boolean
): number | null {
  for (let index = 0; index < audioTracks.length; index += 1) {
    const track = audioTracks[index];
    if (track && predicate(track)) {
      return index;
    }
  }
  return null;
}

function findUniqueTrackIndex(
  audioTracks: SelectableAudioTrackList,
  predicate: (track: SelectableAudioTrack) => boolean
): number | null {
  let matchedIndex: number | null = null;
  for (let index = 0; index < audioTracks.length; index += 1) {
    const track = audioTracks[index];
    if (!track || !predicate(track)) {
      continue;
    }
    if (matchedIndex !== null) {
      return null;
    }
    matchedIndex = index;
  }
  return matchedIndex;
}

function isAmbiguousOrdinalId(value: string | undefined, trackCount: number): boolean {
  const numericId = toTrackNumericId(value);
  return numericId !== null && numericId >= 0 && numericId <= trackCount;
}

function toTrackNumericId(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  const parsed = normalized.toLocaleLowerCase().startsWith("0x")
    ? Number.parseInt(normalized.slice(2), 16)
    : Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function msToSeconds(positionMs: number): number {
  return Math.max(0, positionMs) / 1000;
}

function normalizeVolume(volumePercent: number | null | undefined): number {
  const percent =
    typeof volumePercent === "number" && Number.isFinite(volumePercent) ? Math.trunc(volumePercent) : DEFAULT_ROOM_VOLUME_PERCENT;
  return Math.max(0, Math.min(100, percent)) / 100;
}
