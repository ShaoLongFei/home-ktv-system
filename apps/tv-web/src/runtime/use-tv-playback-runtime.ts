import type { PlaybackNotice, RoomSnapshot } from "@home-ktv/player-contracts";
import type { RoomInteractionEvent } from "@home-ktv/player-contracts";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction, SyntheticEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivePlaybackController, isSamePlaybackTarget } from "./active-playback-controller.js";
import { HeartbeatController } from "./heartbeat-controller.js";
import { createBrowserPlayerClient } from "./player-client.js";
import { RecoveryController } from "./recovery-controller.js";
import { SwitchController } from "./switch-controller.js";
import { useRoomSnapshot, type RoomSnapshotState } from "./use-room-snapshot.js";
import { markAudioUnlocked } from "./active-playback-controller.js";
import { createBrowserVideoPool, type DualVideoPool, type KtvVideoElement } from "./video-pool.js";

const HEARTBEAT_INTERVAL_MS = 10_000;
const TRANSIENT_NOTICE_TTL_MS = 5_000;

export interface UseTvPlaybackRuntimeInput {
  activeVideoRef: RefObject<HTMLVideoElement | null>;
  standbyVideoRef: RefObject<HTMLVideoElement | null>;
  roomSlug?: string;
}

export interface TvPlaybackRuntimeState {
  client: ReturnType<typeof createBrowserPlayerClient>;
  durationMs: number | null;
  firstPlayBlocked: boolean;
  handleFirstPlayPromptClick(): void;
  handleVideoEnded(event: SyntheticEvent<HTMLVideoElement>): void;
  interactions: readonly RoomInteractionEvent[];
  localPlaybackConfirmed: boolean;
  playbackPositionMs: number;
  roomState: RoomSnapshotState;
  snapshot: RoomSnapshot | null;
}

export function useTvPlaybackRuntime(input: UseTvPlaybackRuntimeInput): TvPlaybackRuntimeState {
  const [client] = useState(() => createBrowserPlayerClient(input.roomSlug ?? "living-room"));
  const latestSnapshotRef = useRef<RoomSnapshot | null>(null);
  const videoPoolRef = useRef<DualVideoPool | null>(null);
  const vocalModeSwitchInFlightRef = useRef(false);
  const sentPlaybackTelemetryRef = useRef<Set<string>>(new Set());
  const replayTokenRef = useRef<string | null>(null);
  const [localNotice, setLocalNotice] = useState<PlaybackNotice | null>(null);
  const [firstPlayBlocked, setFirstPlayBlocked] = useState(false);
  const [confirmedPlaybackTargetKey, setConfirmedPlaybackTargetKey] = useState<string | null>(null);
  const [, setPlaybackFrame] = useState(0);

  const sendHeartbeat = useCallback(() => {
    const pool = videoPoolRef.current;
    const snapshot = latestSnapshotRef.current;
    if (!pool || !snapshot) {
      return;
    }

    void new HeartbeatController({ client, videoPool: pool }).send(snapshot);
  }, [client]);

  // 手机打开「同步画面」时会请求一次位置，这里立刻回一次心跳，
  // 不用等 10 秒的定时心跳。
  const roomState = useRoomSnapshot(client, 1500, sendHeartbeat);

  useEffect(() => {
    latestSnapshotRef.current = roomState.snapshot;
  }, [roomState.snapshot]);

  useEffect(() => {
    if (!input.activeVideoRef.current || !input.standbyVideoRef.current || videoPoolRef.current) {
      return;
    }

    videoPoolRef.current = createBrowserVideoPool(input.activeVideoRef.current, input.standbyVideoRef.current);
  }, [input.activeVideoRef, input.standbyVideoRef]);

  useEffect(() => {
    const pool = videoPoolRef.current;
    const snapshot = roomState.snapshot;
    if (!pool || !snapshot) {
      return;
    }

    // 音量与会话状态无关：暂停、重唱、切轨这些分支都会提前 return，
    // 所以在这里统一落一次，避免调音量被播放分支吞掉。
    pool.applyVolume(snapshot.volumePercent);

    void synchronizePlayback({
      client,
      pool,
      snapshot,
      setFirstPlayBlocked,
      setConfirmedPlaybackTargetKey,
      sentPlaybackTelemetryRef,
      setLocalNotice,
      switchInFlightRef: vocalModeSwitchInFlightRef,
      replayTokenRef
    });
  }, [client, roomState.snapshot]);

  useEffect(() => {
    if (roomState.status === "error" || !roomState.snapshot?.currentTarget) {
      setFirstPlayBlocked(false);
      setConfirmedPlaybackTargetKey(null);
    }
  }, [roomState.status, roomState.snapshot?.currentTarget?.queueEntryId]);

  useEffect(() => {
    if (!isTransientLocalNotice(localNotice)) {
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setLocalNotice((current) => (current === localNotice ? null : current));
    }, TRANSIENT_NOTICE_TTL_MS);

    return () => globalThis.clearTimeout(timeoutId);
  }, [localNotice]);

  useEffect(() => {
    if (!roomState.snapshot?.currentTarget) {
      return;
    }

    const intervalId = globalThis.setInterval(() => {
      setPlaybackFrame((frame) => frame + 1);
    }, 1000);

    return () => globalThis.clearInterval(intervalId);
  }, [roomState.snapshot?.currentTarget?.queueEntryId]);

  const retryCurrentPlayback = useCallback(() => {
    const pool = videoPoolRef.current;
    const snapshot = latestSnapshotRef.current;
    if (!pool || !snapshot) {
      return;
    }

    // 记下来：这个会话已经解锁过声音，刷新后也不用再点
    markAudioUnlocked();

    // 用户点了屏幕，这次交互可以用来恢复声音（刷新后是被迫静音的）
    if (pool.activeVideo.muted) {
      pool.activeVideo.muted = false;
      void pool.activeVideo.play().catch(() => {
        pool.activeVideo.muted = true;
      });
    }

    void synchronizePlayback({
      client,
      pool,
      snapshot,
      setFirstPlayBlocked,
      setConfirmedPlaybackTargetKey,
      sentPlaybackTelemetryRef,
      setLocalNotice,
      switchInFlightRef: vocalModeSwitchInFlightRef,
      replayTokenRef
    });
  }, [client]);

  useEffect(() => {
    const handlePointerDown = () => {
      retryCurrentPlayback();
    };

    globalThis.addEventListener("pointerdown", handlePointerDown);
    return () => globalThis.removeEventListener("pointerdown", handlePointerDown);
  }, [retryCurrentPlayback]);

  useEffect(() => {
    const intervalId = globalThis.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => globalThis.clearInterval(intervalId);
  }, [sendHeartbeat]);

  useEffect(() => {
    const pool = videoPoolRef.current;
    const snapshot = roomState.snapshot;
    if (!pool || !snapshot || snapshot.state !== "recovering") {
      return;
    }

    const recoveryController = new RecoveryController({ client, videoPool: pool });
    void recoveryController.recover({ roomSlug: snapshot.roomSlug, deviceId: client.deviceId }).then((result) => {
      setLocalNotice(result.notice);
    });
  }, [client, roomState.snapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const pool = videoPoolRef.current;
      const snapshot = roomState.snapshot;
      if (event.key.toLowerCase() !== "v" || !pool || !snapshot) {
        return;
      }

      const switchController = new SwitchController({ client, deviceId: client.deviceId, videoPool: pool });
      void switchController.switchVocalMode(snapshot).then((result) => {
        if (result.status === "reverted") {
          setLocalNotice({
            kind: "switch_failed_reverted",
            message: result.message
          });
        }
      });
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [client, roomState.snapshot]);

  const handleVideoEnded = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const pool = videoPoolRef.current;
      const snapshot = latestSnapshotRef.current;
      if (!pool || !snapshot || event.currentTarget !== pool.activeVideo) {
        return;
      }

      const target = pool.activeTarget ?? snapshot.currentTarget;
      if (!target) {
        return;
      }

      void client.sendTelemetry({
        roomSlug: snapshot.roomSlug,
        deviceId: client.deviceId,
        eventType: "ended",
        sessionVersion: target.sessionVersion,
        queueEntryId: target.queueEntryId,
        sourceType: target.sourceType,
        assetId: target.assetId,
        playbackPositionMs: endedPlaybackPositionMs(event.currentTarget),
        vocalMode: target.vocalMode,
        switchFamily: target.switchFamily,
        rollbackAssetId: null,
        stage: "ended"
      });
    },
    [client]
  );

  const snapshot = mergeLocalNotice(roomState.snapshot, localNotice);
  const currentTargetKey = playbackTargetKey(snapshot?.currentTarget ?? null);
  const activeVideo = videoPoolRef.current?.activeVideo ?? null;
  const playbackPositionMs = activeVideo
    ? Math.max(0, Math.trunc(activeVideo.currentTime * 1000))
    : roomState.snapshot?.currentTarget?.resumePositionMs ?? 0;
  const durationMs =
    activeVideo && Number.isFinite(activeVideo.duration) ? Math.max(0, Math.trunc(activeVideo.duration * 1000)) : null;

  return {
    client,
    durationMs,
    firstPlayBlocked,
    handleFirstPlayPromptClick: retryCurrentPlayback,
    handleVideoEnded,
    interactions: roomState.interactions,
    localPlaybackConfirmed: Boolean(currentTargetKey && confirmedPlaybackTargetKey === currentTargetKey),
    playbackPositionMs,
    roomState,
    snapshot
  };
}

function mergeLocalNotice(snapshot: RoomSnapshot | null, localNotice: PlaybackNotice | null): RoomSnapshot | null {
  if (!snapshot || !localNotice) {
    return snapshot;
  }

  return {
    ...snapshot,
    notice: localNotice
  };
}

function isTransientLocalNotice(notice: PlaybackNotice | null): boolean {
  return (
    notice?.kind === "switch_failed_reverted" ||
    notice?.kind === "playback_failed_skipped" ||
    notice?.kind === "recovery_fallback_start_over"
  );
}

async function ensureCurrentPlayback(
  client: ReturnType<typeof createBrowserPlayerClient>,
  pool: DualVideoPool,
  snapshot: RoomSnapshot,
  sentPlaybackTelemetryRef: MutableRefObject<Set<string>>,
  setLocalNotice: Dispatch<SetStateAction<PlaybackNotice | null>>,
  setFirstPlayBlocked: Dispatch<SetStateAction<boolean>>,
  setConfirmedPlaybackTargetKey: Dispatch<SetStateAction<string | null>>
): Promise<void> {
  const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(snapshot);
  const target = snapshot.currentTarget;
  if (!target) {
    setFirstPlayBlocked(false);
    setConfirmedPlaybackTargetKey(null);
    return;
  }

  if (result.status === "blocked") {
    if (isPlaybackCapabilityBlockedMessage(result.message)) {
      setFirstPlayBlocked(false);
      setLocalNotice({
        kind: "playback_failed_skipped",
        message: `unsupported: ${result.message}`
      });
      await client.sendTelemetry({
        roomSlug: snapshot.roomSlug,
        deviceId: client.deviceId,
        eventType: "failed",
        sessionVersion: target.sessionVersion,
        queueEntryId: target.queueEntryId,
        sourceType: target.sourceType,
        assetId: target.assetId,
        playbackPositionMs: target.resumePositionMs,
        vocalMode: target.vocalMode,
        switchFamily: target.switchFamily,
        rollbackAssetId: null,
        message: result.message,
        errorCode: "TV_PLAYBACK_CAPABILITY_BLOCKED",
        stage: "playback_capability_blocked"
      });
      return;
    }

    setFirstPlayBlocked(true);
    setConfirmedPlaybackTargetKey(null);
    setLocalNotice({
      kind: "loading",
      message: "点击电视开始播放"
    });
    await sendPlaybackTelemetryOnce({
      client,
      eventType: "loading",
      message: result.message,
      playbackPositionMs: target.resumePositionMs,
      sentPlaybackTelemetryRef,
      snapshot,
      stage: "autoplay_blocked"
    });
    return;
  }

  if (result.status === "playing") {
    setFirstPlayBlocked(false);
    setConfirmedPlaybackTargetKey(playbackTargetKey(target));
    setLocalNotice((notice) => (notice?.kind === "loading" ? null : notice));
    await sendPlaybackTelemetryOnce({
      client,
      eventType: "playing",
      playbackPositionMs: playbackPositionFromVideo(pool.activeVideo, target.resumePositionMs),
      sentPlaybackTelemetryRef,
      snapshot,
      stage: "active_playback_started"
    });
  }
}

export async function synchronizePlayback(input: {
  client: ReturnType<typeof createBrowserPlayerClient>;
  pool: DualVideoPool;
  setConfirmedPlaybackTargetKey: Dispatch<SetStateAction<string | null>>;
  setFirstPlayBlocked: Dispatch<SetStateAction<boolean>>;
  sentPlaybackTelemetryRef: MutableRefObject<Set<string>>;
  snapshot: RoomSnapshot;
  setLocalNotice: Dispatch<SetStateAction<PlaybackNotice | null>>;
  switchInFlightRef: MutableRefObject<boolean>;
  replayTokenRef: MutableRefObject<string | null>;
}): Promise<void> {
  if (input.snapshot.playbackPaused) {
    if (!input.pool.activeVideo.paused) {
      input.pool.activeVideo.pause();
    }
    return;
  }

  const replayToken = input.snapshot.replayToken ?? "";
  if (input.replayTokenRef.current !== null && replayToken !== input.replayTokenRef.current && input.snapshot.currentTarget) {
    input.replayTokenRef.current = replayToken;
    input.pool.activeVideo.currentTime = 0;
    try {
      await input.pool.activeVideo.play();
    } catch {
      // 自动播放被拦截时保持暂停，等用户点击
    }
    return;
  }
  input.replayTokenRef.current = replayToken;

  const targetVocalMode = input.snapshot.targetVocalMode ?? input.snapshot.currentTarget?.vocalMode ?? null;
  const currentVocalMode = input.snapshot.currentTarget?.vocalMode ?? null;
  const hasPendingVocalSwitch = Boolean(input.snapshot.currentTarget && targetVocalMode && targetVocalMode !== currentVocalMode);

  if (hasPendingVocalSwitch && !isCurrentPlaybackReadyForSwitch(input.pool, input.snapshot)) {
    await ensureCurrentPlayback(
      input.client,
      input.pool,
      input.snapshot,
      input.sentPlaybackTelemetryRef,
      input.setLocalNotice,
      input.setFirstPlayBlocked,
      input.setConfirmedPlaybackTargetKey
    );
    return;
  }

  if (hasPendingVocalSwitch) {
    if (input.switchInFlightRef.current) {
      return;
    }

    input.switchInFlightRef.current = true;
    try {
      const result = await new SwitchController({
        client: input.client,
        deviceId: input.client.deviceId,
        videoPool: input.pool
      }).switchVocalMode(input.snapshot);
      if (result.status === "reverted") {
        input.setLocalNotice({
          kind: "switch_failed_reverted",
          message: result.message
        });
      }
    } finally {
      input.switchInFlightRef.current = false;
    }
    return;
  }

  await ensureCurrentPlayback(
    input.client,
    input.pool,
    input.snapshot,
    input.sentPlaybackTelemetryRef,
    input.setLocalNotice,
    input.setFirstPlayBlocked,
    input.setConfirmedPlaybackTargetKey
  );
}

function isCurrentPlaybackReadyForSwitch(pool: DualVideoPool, snapshot: RoomSnapshot): boolean {
  return Boolean(snapshot.currentTarget) && isSamePlaybackTarget(pool.activeTarget, snapshot.currentTarget) && pool.activeVideo.paused === false;
}

async function sendPlaybackTelemetryOnce(input: {
  client: ReturnType<typeof createBrowserPlayerClient>;
  eventType: "loading" | "playing";
  message?: string;
  playbackPositionMs: number;
  sentPlaybackTelemetryRef: MutableRefObject<Set<string>>;
  snapshot: RoomSnapshot;
  stage: "active_playback_started" | "autoplay_blocked";
}): Promise<void> {
  const target = input.snapshot.currentTarget;
  if (!target) {
    return;
  }

  const telemetryKey = [
    input.eventType,
    input.snapshot.roomSlug,
    target.queueEntryId,
    target.sourceType,
    target.assetId,
    target.vocalMode,
    input.stage
  ].join(":");
  if (input.sentPlaybackTelemetryRef.current.has(telemetryKey)) {
    return;
  }

  input.sentPlaybackTelemetryRef.current.add(telemetryKey);
  try {
    await input.client.sendTelemetry({
      roomSlug: input.snapshot.roomSlug,
      deviceId: input.client.deviceId,
      eventType: input.eventType,
      sessionVersion: target.sessionVersion,
      queueEntryId: target.queueEntryId,
      sourceType: target.sourceType,
      assetId: target.assetId,
      playbackPositionMs: input.playbackPositionMs,
      vocalMode: target.vocalMode,
      switchFamily: target.switchFamily,
      rollbackAssetId: null,
      ...(input.message ? { message: input.message } : {}),
      stage: input.stage
    });
  } catch {
    input.sentPlaybackTelemetryRef.current.delete(telemetryKey);
  }
}

function playbackPositionFromVideo(video: KtvVideoElement, fallbackMs: number): number {
  if (!Number.isFinite(video.currentTime)) {
    return Math.max(0, Math.trunc(fallbackMs));
  }

  return Math.max(0, Math.trunc(video.currentTime * 1000));
}

function playbackTargetKey(target: RoomSnapshot["currentTarget"] | null): string | null {
  if (!target) {
    return null;
  }

  return [target.queueEntryId, target.sourceType, target.assetId, target.vocalMode].join(":");
}

function endedPlaybackPositionMs(video: HTMLVideoElement): number {
  const positionSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : video.currentTime;
  return Math.max(0, Math.trunc(positionSeconds * 1000));
}

function isPlaybackCapabilityBlockedMessage(message: string): boolean {
  return /audio-track switching|media-not-supported|cannot-play|preprocess|unsupported|not supported|no supported sources|notsupportederror|decode|demux|format/iu.test(message);
}
