import type { SongSearchResponse, SongSearchQueueState } from "@home-ktv/domain";
import type { RoomControlSnapshot } from "@home-ktv/player-contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addQueueEntry,
  ControllerApiError,
  createControlSession,
  deleteQueueEntry,
  promoteQueueEntry,
  realtimeUrl,
  restoreControlSession,
  requestSupplement,
  searchSongs,
  skipCurrent,
  switchVocalMode,
  undoDeleteQueueEntry
} from "../api/client.js";
import { getOrCreateDeviceId } from "../api/client.js";

export const fallbackPollingIntervalMs = 5000;
export const sessionRefreshIntervalMs = 15 * 60 * 1000;

export interface RoomControllerState {
  connectionStatus: "connecting" | "connected" | "reconnecting" | "error";
  deviceId: string;
  duplicateConfirm: { songId: string; assetId: string; title: string } | null;
  errorMessage: string | null;
  pendingUndo: { queueEntryId: string; undoExpiresAt: string } | null;
  pendingSupplementKeys: readonly string[];
  roomSlug: string;
  skipConfirmOpen: boolean;
  songSearch: SongSearchResponse | null;
  songSearchQuery: string;
  songSearchStatus: "idle" | "loading" | "success" | "error";
  snapshot: RoomControlSnapshot | null;
  addSongVersion(songId: string, assetId: string): Promise<void>;
  cancelDuplicateAdd(): void;
  confirmSkip(): Promise<void>;
  confirmDuplicateAdd(): Promise<void>;
  deleteQueueEntry(queueEntryId: string): Promise<void>;
  promoteQueueEntry(queueEntryId: string): Promise<void>;
  requestAddSongVersion(songId: string, assetId: string, title: string, queueState: SongSearchQueueState): void;
  requestSupplement(provider: string, providerCandidateId: string): Promise<void>;
  requestSkip(): void;
  setSongSearchQuery(query: string): void;
  submitSongSearch(): void;
  switchVocalMode(): Promise<void>;
  undoDelete(queueEntryId: string): Promise<void>;
  cancelSkip(): void;
}

export function useRoomControllerRuntime(): RoomControllerState {
  const initial = useMemo(() => readRuntimeParams(), []);
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [snapshot, setSnapshot] = useState<RoomControlSnapshot | null>(null);
  const [songSearch, setSongSearch] = useState<SongSearchResponse | null>(null);
  const [songSearchQuery, setSongSearchQueryState] = useState("");
  const [songSearchStatus, setSongSearchStatus] = useState<RoomControllerState["songSearchStatus"]>("idle");
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ songId: string; assetId: string; title: string } | null>(
    null
  );
  const [connectionStatus, setConnectionStatus] = useState<RoomControllerState["connectionStatus"]>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<{ queueEntryId: string; undoExpiresAt: string } | null>(null);
  const [pendingSupplementKeys, setPendingSupplementKeys] = useState<readonly string[]>([]);
  const snapshotRef = useRef<RoomControlSnapshot | null>(null);
  const songSearchQueryRef = useRef("");
  const searchRequestIdRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const clearSearchDebounce = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  }, []);

  const runSongSearch = useCallback(
    async (query: string) => {
      clearSearchDebounce();
      searchAbortRef.current?.abort();
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      songSearchQueryRef.current = query;
      const abortController = new AbortController();
      searchAbortRef.current = abortController;
      setSongSearchStatus("loading");

      try {
        const response = await searchSongs({
          roomSlug: initial.roomSlug,
          query,
          limit: 30,
          signal: abortController.signal
        });
        if (searchRequestIdRef.current === requestId && response.query === songSearchQueryRef.current) {
          setSongSearch(response);
          setSongSearchStatus("success");
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        if (searchRequestIdRef.current === requestId) {
          setSongSearchStatus("error");
          setErrorMessage(errorMessageFrom(error, "SONG_SEARCH_FAILED"));
        }
      }
    },
    [clearSearchDebounce, initial.roomSlug]
  );

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
      setSongSearchQueryState("");
      songSearchQueryRef.current = "";
      await runSongSearch("");
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
      clearSearchDebounce();
      searchAbortRef.current?.abort();
    };
  }, [clearSearchDebounce, deviceId, initial.pairingToken, initial.roomSlug, runSongSearch]);

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

  const addSongVersion = useCallback(
    async (songId: string, assetId: string) => {
      await runCommand((input) => addQueueEntry({ ...input, songId, assetId }));
    },
    [runCommand]
  );

  const requestOnlineSupplement = useCallback(
    async (provider: string, providerCandidateId: string) => {
      const key = supplementKey(provider, providerCandidateId);
      setPendingSupplementKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
      try {
        const response = await runCommand((input) =>
          requestSupplement({
            ...input,
            provider,
            providerCandidateId
          })
        );
        if (response?.task) {
          setSongSearch((current) => applySupplementTask(current, response.task));
        }
      } catch (error) {
        setErrorMessage(errorMessageFrom(error, "请求补歌失败"));
      } finally {
        setPendingSupplementKeys((keys) => keys.filter((item) => item !== key));
      }
    },
    [runCommand]
  );

  const submitSongSearch = useCallback(() => {
    void runSongSearch(songSearchQueryRef.current);
  }, [runSongSearch]);

  return {
    connectionStatus,
    deviceId,
    duplicateConfirm,
    errorMessage,
    pendingUndo,
    pendingSupplementKeys,
    roomSlug: initial.roomSlug,
    skipConfirmOpen,
    songSearch,
    songSearchQuery,
    songSearchStatus,
    snapshot,
    addSongVersion,
    cancelDuplicateAdd: () => setDuplicateConfirm(null),
    cancelSkip: () => setSkipConfirmOpen(false),
    confirmDuplicateAdd: async () => {
      const selection = duplicateConfirm;
      if (!selection) {
        return;
      }
      await addSongVersion(selection.songId, selection.assetId);
      setDuplicateConfirm(null);
    },
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
    requestAddSongVersion: (songId, assetId, title, queueState) => {
      if (queueState === "queued") {
        setDuplicateConfirm({ songId, assetId, title });
        return;
      }

      void addSongVersion(songId, assetId);
    },
    requestSupplement: requestOnlineSupplement,
    requestSkip: () => setSkipConfirmOpen(true),
    setSongSearchQuery: (query) => {
      songSearchQueryRef.current = query;
      setSongSearchQueryState(query);
      clearSearchDebounce();
      searchDebounceRef.current = setTimeout(() => {
        void runSongSearch(query);
      }, 250);
    },
    submitSongSearch,
    switchVocalMode: async () => {
      try {
        await runCommand((input) =>
          switchVocalMode({ ...input, playbackPositionMs: snapshotRef.current?.currentTarget?.resumePositionMs ?? 0 })
        );
        setErrorMessage(null);
      } catch (error) {
        if (isApiCode(error, "SWITCH_TARGET_NOT_AVAILABLE")) {
          setErrorMessage("当前歌曲暂不支持切换原唱/伴唱");
          return;
        }

        setErrorMessage(errorMessageFrom(error, "切换原唱/伴唱失败"));
      }
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

export function supplementKey(provider: string, providerCandidateId: string): string {
  return `${provider}:${providerCandidateId}`;
}

function applySupplementTask(
  current: SongSearchResponse | null,
  task: Awaited<ReturnType<typeof requestSupplement>>["task"]
): SongSearchResponse | null {
  if (!current) {
    return current;
  }

  return {
    ...current,
    online: {
      ...current.online,
      candidates: current.online.candidates.map((candidate) =>
        candidate.provider === task.provider && candidate.providerCandidateId === task.providerCandidateId
          ? {
              ...candidate,
              taskId: task.id,
              taskState: task.status
            }
          : candidate
      )
    }
  };
}
