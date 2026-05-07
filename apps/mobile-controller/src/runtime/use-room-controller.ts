import type { RoomControlSnapshot } from "@home-ktv/player-contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addQueueEntry,
  type AvailableSong,
  ControllerApiError,
  createControlSession,
  deleteQueueEntry,
  fetchAvailableSongs,
  promoteQueueEntry,
  realtimeUrl,
  restoreControlSession,
  skipCurrent,
  switchVocalMode,
  undoDeleteQueueEntry
} from "../api/client.js";
import { getOrCreateDeviceId } from "../api/client.js";

export const fallbackPollingIntervalMs = 5000;
export const sessionRefreshIntervalMs = 15 * 60 * 1000;

export interface RoomControllerState {
  availableSongs: AvailableSong[];
  connectionStatus: "connecting" | "connected" | "reconnecting" | "error";
  deviceId: string;
  errorMessage: string | null;
  pendingUndo: { queueEntryId: string; undoExpiresAt: string } | null;
  roomSlug: string;
  skipConfirmOpen: boolean;
  snapshot: RoomControlSnapshot | null;
  addSong(songId: string): Promise<void>;
  confirmSkip(): Promise<void>;
  deleteQueueEntry(queueEntryId: string): Promise<void>;
  promoteQueueEntry(queueEntryId: string): Promise<void>;
  requestSkip(): void;
  switchVocalMode(): Promise<void>;
  undoDelete(queueEntryId: string): Promise<void>;
  cancelSkip(): void;
}

export function useRoomController(): RoomControllerState {
  const initial = useMemo(() => readRuntimeParams(), []);
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [snapshot, setSnapshot] = useState<RoomControlSnapshot | null>(null);
  const [availableSongs, setAvailableSongs] = useState<AvailableSong[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<RoomControllerState["connectionStatus"]>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<{ queueEntryId: string; undoExpiresAt: string } | null>(null);
  const snapshotRef = useRef<RoomControlSnapshot | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    let websocket: WebSocket | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const stopFallbackPolling = () => {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const stopSessionRefresh = () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };

    const applySessionResponse = async (response: Awaited<ReturnType<typeof restoreControlSession>>) => {
      if (cancelled) {
        return;
      }
      setSnapshot(response.snapshot);
      setErrorMessage(null);
      removeTokenFromUrl();
      setAvailableSongs(await fetchAvailableSongs(initial.roomSlug));
    };

    const pollRestore = async () => {
      try {
        const restored = await restoreControlSession({ roomSlug: initial.roomSlug, deviceId });
        if (!cancelled) {
          setSnapshot(restored.snapshot);
          setErrorMessage(null);
        }
      } catch {
        if (!cancelled) {
          setConnectionStatus("reconnecting");
        }
      }
    };

    const startFallbackPolling = () => {
      stopSessionRefresh();
      setConnectionStatus("reconnecting");
      if (!fallbackTimer) {
        fallbackTimer = setInterval(() => {
          void pollRestore();
        }, fallbackPollingIntervalMs);
      }
    };

    const openRealtime = () => {
      if (cancelled) {
        return;
      }

      websocket = new WebSocket(realtimeUrl({ roomSlug: initial.roomSlug, deviceId }));
      websocket.onopen = () => {
        if (cancelled) {
          return;
        }
        stopFallbackPolling();
        setConnectionStatus("connected");
        refreshTimer = setInterval(() => {
          void restoreControlSession({ roomSlug: initial.roomSlug, deviceId }).then((response) => {
            if (!cancelled) {
              setSnapshot(response.snapshot);
            }
          });
        }, sessionRefreshIntervalMs);
      };
      websocket.onmessage = (event) => {
        const message = parseRealtimeMessage(event.data);
        if (message?.type === "room.control.snapshot.updated" && message.payload) {
          setSnapshot(message.payload);
          setErrorMessage(null);
        }
      };
      websocket.onclose = startFallbackPolling;
      websocket.onerror = startFallbackPolling;
    };

    const start = async () => {
      try {
        const restored = await restoreControlSession({ roomSlug: initial.roomSlug, deviceId });
        await applySessionResponse(restored);
        openRealtime();
      } catch (restoreError) {
        if (!initial.pairingToken) {
          setConnectionStatus("error");
          setErrorMessage(errorMessageFrom(restoreError, "CONTROL_SESSION_REQUIRED"));
          return;
        }

        try {
          const created = await createControlSession({
            roomSlug: initial.roomSlug,
            pairingToken: initial.pairingToken,
            deviceId
          });
          await applySessionResponse(created);
          openRealtime();
        } catch (createError) {
          if (isApiCode(createError, "INVALID_PAIRING_TOKEN")) {
            try {
              const restored = await restoreControlSession({ roomSlug: initial.roomSlug, deviceId });
              await applySessionResponse(restored);
              openRealtime();
              return;
            } catch {}
          }

          setConnectionStatus("error");
          setErrorMessage(errorMessageFrom(createError, "INVALID_PAIRING_TOKEN"));
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopFallbackPolling();
      stopSessionRefresh();
      websocket?.close();
    };
  }, [deviceId, initial.pairingToken, initial.roomSlug]);

  const runCommand = useCallback(
    async (command: (input: { roomSlug: string; deviceId: string; sessionVersion: number }) => Promise<any>) => {
      const current = snapshotRef.current;
      if (!current) {
        return null;
      }

      try {
        const response = await command({
          roomSlug: initial.roomSlug,
          deviceId,
          sessionVersion: current.sessionVersion
        });
        if (response?.snapshot) {
          setSnapshot(response.snapshot);
        }
        if (response?.undo) {
          setPendingUndo(response.undo);
        }
        return response;
      } catch (error) {
        if (isApiCode(error, "SESSION_VERSION_CONFLICT") && error instanceof ControllerApiError) {
          const payload = error.payload as { snapshot?: RoomControlSnapshot };
          if (payload.snapshot) {
            setSnapshot(payload.snapshot);
          }
          return null;
        }

        throw error;
      }
    },
    [deviceId, initial.roomSlug]
  );

  return {
    availableSongs,
    connectionStatus,
    deviceId,
    errorMessage,
    pendingUndo,
    roomSlug: initial.roomSlug,
    skipConfirmOpen,
    snapshot,
    addSong: async (songId) => {
      await runCommand((input) => addQueueEntry({ ...input, songId }));
    },
    cancelSkip: () => setSkipConfirmOpen(false),
    confirmSkip: async () => {
      setSkipConfirmOpen(false);
      await runCommand((input) => skipCurrent({ ...input, confirmSkip: true }));
    },
    deleteQueueEntry: async (queueEntryId) => {
      await runCommand((input) => deleteQueueEntry({ ...input, queueEntryId }));
    },
    promoteQueueEntry: async (queueEntryId) => {
      await runCommand((input) => promoteQueueEntry({ ...input, queueEntryId }));
    },
    requestSkip: () => setSkipConfirmOpen(true),
    switchVocalMode: async () => {
      await runCommand((input) =>
        switchVocalMode({ ...input, playbackPositionMs: snapshotRef.current?.currentTarget?.resumePositionMs ?? 0 })
      );
    },
    undoDelete: async (queueEntryId) => {
      setPendingUndo(null);
      await runCommand((input) => undoDeleteQueueEntry({ ...input, queueEntryId }));
    }
  };
}

function readRuntimeParams(): { roomSlug: string; pairingToken: string | null } {
  const search = new URLSearchParams(window.location.search);
  return {
    roomSlug: search.get("room") || "living-room",
    pairingToken: search.get("token")
  };
}

function removeTokenFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) {
    return;
  }

  url.searchParams.delete("token");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function parseRealtimeMessage(data: unknown): { type?: string; payload?: RoomControlSnapshot } | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    return JSON.parse(data) as { type?: string; payload?: RoomControlSnapshot };
  } catch {
    return null;
  }
}

function isApiCode(error: unknown, code: string): boolean {
  return error instanceof ControllerApiError && error.code === code;
}

function errorMessageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
