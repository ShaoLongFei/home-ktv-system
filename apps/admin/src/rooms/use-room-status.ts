import { useCallback, useEffect, useState } from "react";
import {
  cleanFailedOnlineTask,
  getOrCreateAdminDeviceId,
  promoteOnlineTaskResource,
  refreshPairingToken as fetchPairingTokenRefresh,
  refreshRoomStatus as fetchRoomStatus,
  retryFailedOnlineTask,
  roomRealtimeUrl
} from "../api/client.js";
import type {
  RoomControlSnapshotMessage,
  RoomControlSnapshotPayload,
  RoomOnlineTaskSummaryRow,
  RoomStatusResponse
} from "./types.js";

type Translate = (key: string, replacements?: Record<string, string | number>) => string;

const realtimeFallbackPollingMs = 5000;

export interface UseRoomStatusResult {
  busyTaskAction: string | null;
  errorMessage: string | null;
  isRefreshingPairing: boolean;
  isRefreshingRoom: boolean;
  roomStatus: RoomStatusResponse | null;
  refreshPairingToken(): Promise<void>;
  refreshRoomStatus(): Promise<void>;
  runTaskAction(task: RoomOnlineTaskSummaryRow, action: "retry" | "clean" | "promote"): Promise<void>;
}

export function useRoomStatus(roomSlug: string, t: Translate): UseRoomStatusResult {
  const [roomStatus, setRoomStatus] = useState<RoomStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshingRoom, setIsRefreshingRoom] = useState(false);
  const [isRefreshingPairing, setIsRefreshingPairing] = useState(false);
  const [busyTaskAction, setBusyTaskAction] = useState<string | null>(null);
  const [deviceId] = useState(() => getOrCreateAdminDeviceId());

  useEffect(() => {
    let cancelled = false;
    let websocket: WebSocket | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const loadRoomStatus = async () => {
      try {
        const status = await fetchRoomStatus(roomSlug);
        if (!cancelled) {
          setRoomStatus(status);
          setErrorMessage(null);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t("rooms.loadFailed"));
        }
      }
    };

    const stopFallbackPolling = () => {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const startFallbackPolling = () => {
      if (cancelled || fallbackTimer) {
        return;
      }

      fallbackTimer = setInterval(() => {
        void loadRoomStatus();
      }, realtimeFallbackPollingMs);
    };

    const openRealtime = () => {
      if (cancelled || typeof WebSocket === "undefined") {
        startFallbackPolling();
        return;
      }

      websocket = new WebSocket(roomRealtimeUrl({ roomSlug, deviceId }));
      websocket.onopen = stopFallbackPolling;
      websocket.onmessage = (event) => {
        if (cancelled) {
          return;
        }

        const message = parseRealtimeMessage(event.data);
        if (message?.payload.roomSlug !== roomSlug) {
          return;
        }

        setRoomStatus((current) => roomStatusFromSnapshot(message.payload, current));
        setErrorMessage(null);
      };
      websocket.onclose = startFallbackPolling;
      websocket.onerror = startFallbackPolling;
    };

    void loadRoomStatus().then(openRealtime);

    return () => {
      cancelled = true;
      stopFallbackPolling();
      websocket?.close();
    };
  }, [deviceId, roomSlug, t]);

  const refreshRoomStatus = useCallback(async () => {
    setIsRefreshingRoom(true);
    try {
      const status = await fetchRoomStatus(roomSlug);
      setRoomStatus(status);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("rooms.refreshStateFailed"));
    } finally {
      setIsRefreshingRoom(false);
    }
  }, [roomSlug, t]);

  const refreshPairingToken = useCallback(async () => {
    setIsRefreshingPairing(true);
    try {
      const refreshed = await fetchPairingTokenRefresh(roomSlug);
      setRoomStatus((current) =>
        current
          ? {
              ...current,
              pairing: {
                tokenExpiresAt: refreshed.pairing.tokenExpiresAt,
                controllerUrl: refreshed.pairing.controllerUrl,
                qrPayload: refreshed.pairing.qrPayload
              }
            }
          : current
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("rooms.refreshTokenFailed"));
    } finally {
      setIsRefreshingPairing(false);
    }
  }, [roomSlug, t]);

  const runTaskAction = useCallback(
    async (task: RoomOnlineTaskSummaryRow, action: "retry" | "clean" | "promote") => {
      const busyKey = `${action}:${task.taskId}`;
      setBusyTaskAction(busyKey);
      try {
        if (action === "retry") {
          await retryFailedOnlineTask(roomSlug, task.taskId);
        } else if (action === "clean") {
          await cleanFailedOnlineTask(roomSlug, task.taskId);
        } else {
          await promoteOnlineTaskResource(roomSlug, task.taskId);
        }

        const refreshed = await fetchRoomStatus(roomSlug);
        setRoomStatus(refreshed);
        setErrorMessage(null);
      } catch (error) {
        const actionLabel = action === "retry" ? t("rooms.retry") : action === "clean" ? t("rooms.clean") : t("rooms.promote");
        setErrorMessage(error instanceof Error ? error.message : t("rooms.taskActionFailed", { action: actionLabel }));
      } finally {
        setBusyTaskAction(null);
      }
    },
    [roomSlug, t]
  );

  return {
    busyTaskAction,
    errorMessage,
    isRefreshingPairing,
    isRefreshingRoom,
    roomStatus,
    refreshPairingToken,
    refreshRoomStatus,
    runTaskAction
  };
}

function parseRealtimeMessage(data: unknown): RoomControlSnapshotMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as Partial<RoomControlSnapshotMessage>;
    if (parsed.type === "room.control.snapshot.updated" && isSnapshotPayload(parsed.payload)) {
      return parsed as RoomControlSnapshotMessage;
    }
  } catch {}

  return null;
}

function isSnapshotPayload(value: unknown): value is RoomControlSnapshotPayload {
  return typeof value === "object" && value !== null && "roomSlug" in value && "sessionVersion" in value && "queue" in value;
}

function roomStatusFromSnapshot(snapshot: RoomControlSnapshotPayload, current: RoomStatusResponse | null): RoomStatusResponse {
  return {
    room: current?.room ?? {
      roomId: snapshot.roomId,
      roomSlug: snapshot.roomSlug,
      status: "active"
    },
    pairing: {
      tokenExpiresAt: snapshot.pairing.tokenExpiresAt,
      controllerUrl: snapshot.pairing.controllerUrl,
      qrPayload: snapshot.pairing.qrPayload
    },
    tvPresence: snapshot.tvPresence,
    controllers: snapshot.controllers,
    sessionVersion: snapshot.sessionVersion,
    current: snapshot.currentTarget
      ? {
          queueEntryId: snapshot.currentTarget.queueEntryId,
          songTitle: snapshot.currentTarget.currentQueueEntryPreview.songTitle,
          artistName: snapshot.currentTarget.currentQueueEntryPreview.artistName,
          vocalMode: snapshot.currentTarget.vocalMode
        }
      : null,
    queue: snapshot.queue.map((entry) => ({ ...entry })),
    recentEvents: snapshot.recentEvents ?? current?.recentEvents ?? [],
    onlineTasks: snapshot.onlineTasks ?? current?.onlineTasks ?? { counts: { total: 0 }, tasks: [] }
  };
}
