import type { PlaybackNotice, RoomSnapshot } from "@home-ktv/player-contracts";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction, SyntheticEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivePlaybackController } from "./active-playback-controller.js";
import { HeartbeatController } from "./heartbeat-controller.js";
import { createBrowserPlayerClient } from "./player-client.js";
import { RecoveryController } from "./recovery-controller.js";
import { SwitchController } from "./switch-controller.js";
import { useRoomSnapshot, type RoomSnapshotState } from "./use-room-snapshot.js";
import { createBrowserVideoPool, type DualVideoPool, type KtvVideoElement } from "./video-pool.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

export interface UseTvPlaybackRuntimeInput {
  activeVideoRef: RefObject<HTMLVideoElement | null>;
  standbyVideoRef: RefObject<HTMLVideoElement | null>;
}

export interface TvPlaybackRuntimeState {
  durationMs: number | null;
  firstPlayBlocked: boolean;
  handleVideoEnded(event: SyntheticEvent<HTMLVideoElement>): void;
  playbackPositionMs: number;
  roomState: RoomSnapshotState;
  snapshot: RoomSnapshot | null;
}

export function useTvPlaybackRuntime(input: UseTvPlaybackRuntimeInput): TvPlaybackRuntimeState {
  const [client] = useState(() => createBrowserPlayerClient());
  const roomState = useRoomSnapshot(client);
  const latestSnapshotRef = useRef<RoomSnapshot | null>(null);
  const videoPoolRef = useRef<DualVideoPool | null>(null);
  const vocalModeSwitchInFlightRef = useRef(false);
  const sentPlaybackTelemetryRef = useRef<Set<string>>(new Set());
  const [localNotice, setLocalNotice] = useState<PlaybackNotice | null>(null);
  const [firstPlayBlocked, setFirstPlayBlocked] = useState(false);
  const [, setPlaybackFrame] = useState(0);

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

    void synchronizePlayback({
      client,
      pool,
      snapshot,
      setFirstPlayBlocked,
      sentPlaybackTelemetryRef,
      setLocalNotice,
      switchInFlightRef: vocalModeSwitchInFlightRef
    });
  }, [client, roomState.snapshot]);

  useEffect(() => {
    if (roomState.status === "error" || !roomState.snapshot?.currentTarget || roomState.snapshot.conflict) {
      setFirstPlayBlocked(false);
    }
  }, [roomState.status, roomState.snapshot?.currentTarget?.queueEntryId, roomState.snapshot?.conflict]);

  useEffect(() => {
    if (!roomState.snapshot?.currentTarget) {
      return;
    }

    const intervalId = globalThis.setInterval(() => {
      setPlaybackFrame((frame) => frame + 1);
    }, 1000);

    return () => globalThis.clearInterval(intervalId);
  }, [roomState.snapshot?.currentTarget?.queueEntryId]);

  useEffect(() => {
    const handlePointerDown = () => {
      const pool = videoPoolRef.current;
      const snapshot = roomState.snapshot;
      if (!pool || !snapshot) {
        return;
      }

      void synchronizePlayback({
        client,
        pool,
        snapshot,
        setFirstPlayBlocked,
        sentPlaybackTelemetryRef,
        setLocalNotice,
        switchInFlightRef: vocalModeSwitchInFlightRef
      });
    };

    globalThis.addEventListener("pointerdown", handlePointerDown);
    return () => globalThis.removeEventListener("pointerdown", handlePointerDown);
  }, [client, roomState.snapshot]);

  useEffect(() => {
    const sendHeartbeat = () => {
      const pool = videoPoolRef.current;
      const snapshot = latestSnapshotRef.current;
      if (!pool || !snapshot) {
        return;
      }

      void new HeartbeatController({ client, videoPool: pool }).send(snapshot);
    };

    const intervalId = globalThis.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => globalThis.clearInterval(intervalId);
  }, [client]);

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
  const activeVideo = videoPoolRef.current?.activeVideo ?? null;
  const playbackPositionMs = activeVideo
    ? Math.max(0, Math.trunc(activeVideo.currentTime * 1000))
    : roomState.snapshot?.currentTarget?.resumePositionMs ?? 0;
  const durationMs =
    activeVideo && Number.isFinite(activeVideo.duration) ? Math.max(0, Math.trunc(activeVideo.duration * 1000)) : null;

  return {
    durationMs,
    firstPlayBlocked,
    handleVideoEnded,
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

async function ensureCurrentPlayback(
  client: ReturnType<typeof createBrowserPlayerClient>,
  pool: DualVideoPool,
  snapshot: RoomSnapshot,
  sentPlaybackTelemetryRef: MutableRefObject<Set<string>>,
  setLocalNotice: Dispatch<SetStateAction<PlaybackNotice | null>>,
  setFirstPlayBlocked: Dispatch<SetStateAction<boolean>>
): Promise<void> {
  const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(snapshot);
  const target = snapshot.currentTarget;
  if (!target) {
    setFirstPlayBlocked(false);
    return;
  }

  if (result.status === "blocked") {
    setFirstPlayBlocked(true);
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

async function synchronizePlayback(input: {
  client: ReturnType<typeof createBrowserPlayerClient>;
  pool: DualVideoPool;
  setFirstPlayBlocked: Dispatch<SetStateAction<boolean>>;
  sentPlaybackTelemetryRef: MutableRefObject<Set<string>>;
  snapshot: RoomSnapshot;
  setLocalNotice: Dispatch<SetStateAction<PlaybackNotice | null>>;
  switchInFlightRef: MutableRefObject<boolean>;
}): Promise<void> {
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
      input.setFirstPlayBlocked
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
    input.setFirstPlayBlocked
  );
}

function isCurrentPlaybackReadyForSwitch(pool: DualVideoPool, snapshot: RoomSnapshot): boolean {
  return Boolean(snapshot.currentTarget) && pool.activeTarget?.assetId === snapshot.currentTarget?.assetId && pool.activeVideo.paused === false;
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

function endedPlaybackPositionMs(video: HTMLVideoElement): number {
  const positionSeconds = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : video.currentTime;
  return Math.max(0, Math.trunc(positionSeconds * 1000));
}
