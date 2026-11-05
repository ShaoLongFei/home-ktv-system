import type {
  ControllerSongHistoryEntry,
  SongDiscoveryResponse,
  SongSearchNasQueueState,
  SongSearchQueueState,
  SongSearchResponse
} from "@home-ktv/domain";
import { DEFAULT_ROOM_VOLUME_PERCENT, type RoomControlSnapshot, type RoomInteractionKind } from "@home-ktv/player-contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addQueueEntry,
  ControllerApiError,
  type ControllerUser,
  createControlSession,
  deleteQueueEntry,
  fetchControllerSongHistory,
  fetchOnlineAssetStatus,
  fetchPublicRoomSnapshot,
  fetchSongDiscovery,
  getCurrentControllerUser,
  loginControllerUser,
  logoutControllerUser,
  promoteQueueEntry,
  queueOnlineSong,
  replayCurrent,
  registerControllerUser,
  realtimeUrl,
  restoreControlSession,
  searchSongs,
  sendRoomInteraction,
  setVolume,
  shuffleQueue,
  skipCurrent,
  switchVocalMode,
  togglePause,
  updateControllerUserProfile,
  undoDeleteQueueEntry
} from "../api/client.js";
import { getOrCreateDeviceId } from "../api/client.js";

export const fallbackPollingIntervalMs = 5000;
export const sessionRefreshIntervalMs = 15 * 60 * 1000;

interface ControllerCommandInput {
  roomSlug: string;
  deviceId: string;
  sessionVersion: number;
}

interface ControllerCommandResponse {
  status?: string;
  snapshot?: RoomControlSnapshot | null;
  undo?: { queueEntryId: string; undoExpiresAt: string };
}

export type OnlineQueueState = {
  status: "queuing" | "preparing" | "queued" | "failed";
  message: string | null;
};

export interface RoomControllerState {
  authStatus: "checking" | "authenticated" | "unauthenticated";
  authUser: ControllerUser | null;
  connectionStatus: "connecting" | "connected" | "reconnecting" | "error";
  deviceId: string;
  duplicateConfirm:
    | { kind: "canonical"; songId: string; assetId: string; title: string }
    | { kind: "nas"; assetId: string; title: string }
    | null;
  errorMessage: string | null;
  pendingNasAssetId: string | null;
  onlineQueueState: Record<string, OnlineQueueState>;
  requestAddOnlineSong(
    songNumber: string,
    title: string,
    artistName: string,
    nasAssetId?: string,
    nasQueueState?: SongSearchNasQueueState
  ): boolean;
  pendingInteractionKind: RoomInteractionKind | null;
  pendingUndo: { queueEntryId: string; undoExpiresAt: string } | null;
  roomSlug: string;
  skipConfirmOpen: boolean;
  songDiscovery: SongDiscoveryResponse | null;
  songDiscoveryStatus: "idle" | "loading" | "success" | "error";
  songHistory: ControllerSongHistoryEntry[];
  songHistoryStatus: "idle" | "loading" | "success" | "error";
  songSearch: SongSearchResponse | null;
  songSearchQuery: string;
  songSearchStatus: "idle" | "loading" | "success" | "error";
  songSearchLoadingMore: boolean;
  loadMoreSongSearch(): Promise<void>;
  snapshot: RoomControlSnapshot | null;
  volumePercent: number;
  addSongVersion(songId: string, assetId: string): Promise<void>;
  addNasAsset(assetId: string): Promise<void>;
  cancelDuplicateAdd(): void;
  confirmSkip(): Promise<void>;
  confirmDuplicateAdd(): Promise<void>;
  deleteQueueEntry(queueEntryId: string): Promise<void>;
  promoteQueueEntry(queueEntryId: string): Promise<void>;
  shuffleQueue(): Promise<void>;
  requestAddSongVersion(songId: string, assetId: string, title: string, queueState: SongSearchQueueState): boolean;
  requestAddNasAsset(assetId: string, title: string, queueState: SongSearchNasQueueState): boolean;
  sendInteraction(kind: RoomInteractionKind, message: string): Promise<void>;
  replayCurrent(): Promise<void>;
  togglePause(): Promise<void>;
  requestSkip(): void;
  refreshSongDiscovery(): void;
  refreshSongHistory(): Promise<void>;
  setSongSearchQuery(query: string): void;
  setVolumePercent(volumePercent: number): void;
  submitSongSearch(): void;
  switchVocalMode(): Promise<void>;
  undoDelete(queueEntryId: string): Promise<void>;
  cancelSkip(): void;
  login(input: { phone: string; password: string }): Promise<void>;
  register(input: { phone: string; password: string; displayName: string }): Promise<void>;
  logout(): Promise<void>;
  updateDisplayName(displayName: string): Promise<void>;
}

export function useRoomControllerRuntime(): RoomControllerState {
  const initial = useMemo(() => readRuntimeParams(), []);
  const [deviceId] = useState(() => getOrCreateDeviceId());
  const [authStatus, setAuthStatus] = useState<RoomControllerState["authStatus"]>("checking");
  const [authUser, setAuthUser] = useState<ControllerUser | null>(null);
  const [snapshot, setSnapshot] = useState<RoomControlSnapshot | null>(null);
  const [songSearch, setSongSearch] = useState<SongSearchResponse | null>(null);
  const [songSearchQuery, setSongSearchQueryState] = useState("");
  const [songSearchStatus, setSongSearchStatus] = useState<RoomControllerState["songSearchStatus"]>("idle");
  const [songSearchLoadingMore, setSongSearchLoadingMore] = useState(false);
  const songSearchRef = useRef<SongSearchResponse | null>(null);
  const songSearchLoadingMoreRef = useRef(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<RoomControllerState["duplicateConfirm"]>(null);
  const [connectionStatus, setConnectionStatus] = useState<RoomControllerState["connectionStatus"]>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [songDiscovery, setSongDiscovery] = useState<SongDiscoveryResponse | null>(null);
  const [songDiscoveryStatus, setSongDiscoveryStatus] = useState<RoomControllerState["songDiscoveryStatus"]>("idle");
  const [songHistory, setSongHistory] = useState<ControllerSongHistoryEntry[]>([]);
  const [songHistoryStatus, setSongHistoryStatus] = useState<RoomControllerState["songHistoryStatus"]>("idle");
  const [pendingNasAssetId, setPendingNasAssetId] = useState<string | null>(null);
  const [onlineQueueState, setOnlineQueueStateMap] = useState<Record<string, OnlineQueueState>>({});
  const onlinePollTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [pendingInteractionKind, setPendingInteractionKind] = useState<RoomInteractionKind | null>(null);
  const [pendingUndo, setPendingUndo] = useState<{ queueEntryId: string; undoExpiresAt: string } | null>(null);
  const [pendingVolumePercent, setPendingVolumePercent] = useState<number | null>(null);
  const snapshotRef = useRef<RoomControlSnapshot | null>(null);
  const songSearchQueryRef = useRef("");

  useEffect(() => {
    songSearchRef.current = songSearch;
  }, [songSearch]);
  const searchRequestIdRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const discoveryAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadUser = async () => {
      try {
        const response = await getCurrentControllerUser();
        if (!cancelled) {
          setAuthUser(response.user);
          setAuthStatus("authenticated");
        }
      } catch (error) {
        if (!cancelled) {
          if (isApiCode(error, "AUTH_REQUIRED")) {
            setAuthUser(null);
            setAuthStatus("unauthenticated");
            setConnectionStatus("connecting");
            return;
          }
          setAuthUser(null);
          setAuthStatus("unauthenticated");
          setErrorMessage(errorMessageFrom(error, "登录状态检查失败"));
        }
      }
    };

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const timers = onlinePollTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const clearSearchDebounce = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  }, []);

  const clearVolumeDebounce = useCallback(() => {
    if (volumeDebounceRef.current) {
      clearTimeout(volumeDebounceRef.current);
      volumeDebounceRef.current = null;
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

  /** 搜索结果下滑续拉：在当前结果后面追加下一页。 */
  const loadMoreSongSearch = useCallback(async () => {
    const current = songSearchRef.current;
    const query = songSearchQueryRef.current;
    const nextOffset = current?.online.nextOffset ?? null;
    if (!current || !query || nextOffset == null || songSearchLoadingMoreRef.current) {
      return;
    }

    const requestId = searchRequestIdRef.current;
    songSearchLoadingMoreRef.current = true;
    setSongSearchLoadingMore(true);
    try {
      const response = await searchSongs({
        roomSlug: initial.roomSlug,
        query,
        offset: nextOffset
      });
      if (searchRequestIdRef.current !== requestId || songSearchQueryRef.current !== query) {
        return;
      }
      // 用 ref 里的首页结果做基准：setState 的 updater 拿到的 previous 可能
      // 还是 null（首页更新尚未提交），那样这一页会被静默丢掉
      const base = songSearchRef.current;
      if (!base || base.query !== response.query) {
        return;
      }
      setSongSearch({
        ...response,
        online: {
          ...response.online,
          candidates: [...base.online.candidates, ...response.online.candidates]
        }
      });
    } catch (error) {
      setErrorMessage(errorMessageFrom(error, "SONG_SEARCH_FAILED"));
    } finally {
      songSearchLoadingMoreRef.current = false;
      setSongSearchLoadingMore(false);
    }
  }, [initial.roomSlug]);

  const runSongDiscovery = useCallback(
    async (seed: string) => {
      discoveryAbortRef.current?.abort();
      const abortController = new AbortController();
      discoveryAbortRef.current = abortController;
      setSongDiscoveryStatus("loading");

      try {
        const response = await fetchSongDiscovery({
          roomSlug: initial.roomSlug,
          seed,
          signal: abortController.signal
        });
        if (!abortController.signal.aborted) {
          setSongDiscovery(response);
          setSongDiscoveryStatus("success");
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        setSongDiscoveryStatus("error");
        setErrorMessage(errorMessageFrom(error, "DISCOVERY_LOAD_FAILED"));
      }
    },
    [initial.roomSlug]
  );

  const runSongHistory = useCallback(async () => {
    setSongHistoryStatus("loading");
    try {
      const response = await fetchControllerSongHistory();
      setSongHistory(response.songs);
      setSongHistoryStatus("success");
    } catch (error) {
      if (isApiCode(error, "AUTH_REQUIRED")) {
        setSongHistory([]);
        setSongHistoryStatus("idle");
        return;
      }
      setSongHistoryStatus("error");
      setErrorMessage(errorMessageFrom(error, "点歌历史加载失败"));
    }
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setSongHistory([]);
      setSongHistoryStatus("idle");
      return;
    }
    void runSongHistory();
  }, [authStatus, runSongHistory]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }
    let cancelled = false;
    let websocket: WebSocket | null = null;
    let realtimeConnecting = false;
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
      await Promise.all([runSongSearch(""), runSongDiscovery(createDiscoverySeed())]);
    };

    const pollRestore = async () => {
      try {
        const restored = await restoreControlSession({ roomSlug: initial.roomSlug, deviceId });
        if (!cancelled) {
          setSnapshot(restored.snapshot);
          setErrorMessage(null);
          openRealtime();
        }
      } catch {
        if (!cancelled) {
          setConnectionStatus("reconnecting");
        }
      }
    };

    const startFallbackPolling = () => {
      if (cancelled) {
        return;
      }
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

      if (realtimeConnecting) {
        return;
      }

      let nextWebSocket: WebSocket;
      try {
        nextWebSocket = new WebSocket(realtimeUrl({ roomSlug: initial.roomSlug, deviceId }));
      } catch {
        startFallbackPolling();
        return;
      }
      realtimeConnecting = true;
      websocket = nextWebSocket;
      nextWebSocket.onopen = () => {
        if (cancelled) {
          return;
        }
        realtimeConnecting = false;
        stopFallbackPolling();
        stopSessionRefresh();
        setConnectionStatus("connected");
        refreshTimer = setInterval(() => {
          void restoreControlSession({ roomSlug: initial.roomSlug, deviceId }).then((response) => {
            if (!cancelled) {
              setSnapshot(response.snapshot);
            }
          });
        }, sessionRefreshIntervalMs);
      };
      nextWebSocket.onmessage = (event) => {
        if (websocket !== nextWebSocket) {
          return;
        }
        const message = parseRealtimeMessage(event.data);
        if (message?.type === "room.control.snapshot.updated" && message.payload) {
          setSnapshot(message.payload);
          setErrorMessage(null);
        }
      };
      const handleRealtimeDisconnect = () => {
        if (websocket === nextWebSocket) {
          websocket = null;
        }
        realtimeConnecting = false;
        startFallbackPolling();
      };
      nextWebSocket.onclose = handleRealtimeDisconnect;
      nextWebSocket.onerror = handleRealtimeDisconnect;
    };

    const start = async () => {
      try {
        const restored = await restoreControlSession({ roomSlug: initial.roomSlug, deviceId });
        await applySessionResponse(restored);
        openRealtime();
      } catch (restoreError) {
        const pairingToken = await resolvePairingToken(initial.roomSlug, initial.pairingToken);
        if (!pairingToken) {
          setConnectionStatus("error");
          setErrorMessage(errorMessageFrom(restoreError, "CONTROL_SESSION_REQUIRED"));
          return;
        }

        try {
          const created = await createControlSession({
            roomSlug: initial.roomSlug,
            pairingToken,
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
      clearVolumeDebounce();
      searchAbortRef.current?.abort();
      discoveryAbortRef.current?.abort();
    };
  }, [authStatus, clearSearchDebounce, clearVolumeDebounce, deviceId, initial.pairingToken, initial.roomSlug, runSongDiscovery, runSongSearch]);

  useEffect(() => {
    if (pendingVolumePercent != null && snapshot?.volumePercent === pendingVolumePercent) {
      setPendingVolumePercent(null);
    }
  }, [pendingVolumePercent, snapshot?.volumePercent]);

  const runCommand = useCallback(
    async <TResponse extends ControllerCommandResponse>(
      command: (input: ControllerCommandInput) => Promise<TResponse>,
      options: { retryOnConflict?: boolean } = {}
    ) => {
      const current = snapshotRef.current;
      if (!current) {
        return null;
      }

      const applyResponse = (response: TResponse) => {
        if (response?.snapshot) {
          setSnapshot(response.snapshot);
        }
        if (response?.undo) {
          setPendingUndo(response.undo);
        }
      };

      try {
        const response = await command({
          roomSlug: initial.roomSlug,
          deviceId,
          sessionVersion: current.sessionVersion
        });
        applyResponse(response);
        return response;
      } catch (error) {
        if (isApiCode(error, "SESSION_VERSION_CONFLICT") && error instanceof ControllerApiError) {
          const payload = error.payload as { snapshot?: RoomControlSnapshot };
          if (payload.snapshot) {
            setSnapshot(payload.snapshot);
          }
          if (!options.retryOnConflict || !payload.snapshot) {
            return null;
          }

          try {
            const response = await command({
              roomSlug: initial.roomSlug,
              deviceId,
              sessionVersion: payload.snapshot.sessionVersion
            });
            applyResponse(response);
            return response;
          } catch (retryError) {
            if (isApiCode(retryError, "SESSION_VERSION_CONFLICT") && retryError instanceof ControllerApiError) {
              const retryPayload = retryError.payload as { snapshot?: RoomControlSnapshot };
              if (retryPayload.snapshot) {
                setSnapshot(retryPayload.snapshot);
              }
              return null;
            }

            throw retryError;
          }
        }

        throw error;
      }
    },
    [deviceId, initial.roomSlug]
  );

  const addSongVersion = useCallback(
    async (songId: string, assetId: string) => {
      await runCommand((input) => addQueueEntry({ ...input, sourceType: "nas", assetId }), { retryOnConflict: true });
      await runSongHistory();
    },
    [runCommand, runSongHistory]
  );

  const addNasAsset = useCallback(
    async (assetId: string) => {
      setPendingNasAssetId(assetId);
      try {
        await runCommand((input) => addQueueEntry({ ...input, sourceType: "nas", assetId }), { retryOnConflict: true });
        const restored = await restoreControlSession({ roomSlug: initial.roomSlug, deviceId });
        setSnapshot(restored.snapshot);
        await runSongSearch(songSearchQueryRef.current);
        await runSongHistory();
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(errorMessageFrom(error, "点歌失败"));
      } finally {
        setPendingNasAssetId((current) => (current === assetId ? null : current));
      }
    },
    [deviceId, initial.roomSlug, runCommand, runSongHistory, runSongSearch]
  );

  const sendInteraction = useCallback(
    async (kind: RoomInteractionKind, message: string) => {
      const normalizedMessage = message.trim();
      if (!normalizedMessage) {
        return;
      }

      setPendingInteractionKind(kind);
      try {
        await sendRoomInteraction({
          roomSlug: initial.roomSlug,
          deviceId,
          kind,
          message: normalizedMessage
        });
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(errorMessageFrom(error, "互动发送失败"));
      } finally {
        setPendingInteractionKind((current) => (current === kind ? null : current));
      }
    },
    [deviceId, initial.roomSlug]
  );

  const submitSongSearch = useCallback(() => {
    void runSongSearch(songSearchQueryRef.current);
  }, [runSongSearch]);

  const commitVolumePercent = useCallback(
    async (volumePercent: number) => {
      try {
        const response = await runCommand((input) => setVolume({ ...input, volumePercent }));
        if (!response?.snapshot || response.snapshot.volumePercent !== volumePercent) {
          setPendingVolumePercent(null);
        }
        setErrorMessage(null);
      } catch (error) {
        setPendingVolumePercent(null);
        setErrorMessage(errorMessageFrom(error, "音量调整失败"));
      }
    },
    [runCommand]
  );

  const setOnlineQueueState = useCallback((songNumber: string, state: OnlineQueueState) => {
    setOnlineQueueStateMap((current) => ({ ...current, [songNumber]: state }));
  }, []);

  const pollOnlineAsset = useCallback(
    (songNumber: string, assetId: string) => {
      const startedAt = Date.now();
      setOnlineQueueState(songNumber, { status: "preparing", message: null });

      const tick = async (): Promise<void> => {
        try {
          const response = await fetchOnlineAssetStatus({ roomSlug: initial.roomSlug, assetId });
          if (response.asset.status === "ready") {
            setOnlineQueueState(songNumber, { status: "queued", message: null });
            return;
          }
          if (response.asset.status === "failed" || response.asset.status === "unavailable") {
            setOnlineQueueState(songNumber, {
              status: "failed",
              message: response.asset.errorReason
            });
            return;
          }
          if (Date.now() - startedAt > 180000) {
            setOnlineQueueState(songNumber, { status: "failed", message: "timeout" });
            return;
          }
          onlinePollTimersRef.current[songNumber] = setTimeout(() => {
            void tick();
          }, 2000);
        } catch {
          if (Date.now() - startedAt > 180000) {
            setOnlineQueueState(songNumber, { status: "failed", message: "network" });
            return;
          }
          onlinePollTimersRef.current[songNumber] = setTimeout(() => {
            void tick();
          }, 3000);
        }
      };

      void tick();
    },
    [initial.roomSlug, setOnlineQueueState]
  );

  const requestAddOnlineSong = useCallback(
    (
      songNumber: string,
      title: string,
      artistName: string,
      nasAssetId?: string,
      nasQueueState?: SongSearchNasQueueState
    ): boolean => {
      // NAS 曲库里已经有的歌，直接排本库资产，不走在线导入和等待转码。
      if (nasAssetId) {
        if (nasQueueState === "queued") {
          setDuplicateConfirm({ kind: "nas", assetId: nasAssetId, title });
          return false;
        }

        setOnlineQueueState(songNumber, { status: "queuing", message: null });
        void (async () => {
          try {
            await runCommand(
              (input) => addQueueEntry({ ...input, sourceType: "nas", assetId: nasAssetId }),
              { retryOnConflict: true }
            );
            setOnlineQueueState(songNumber, { status: "queued", message: null });
            await runSongSearch(songSearchQueryRef.current);
            await runSongHistory();
          } catch (error) {
            setOnlineQueueState(songNumber, {
              status: "failed",
              message: errorMessageFrom(error, "点歌失败")
            });
          }
        })();
        return true;
      }

      setOnlineQueueState(songNumber, { status: "queuing", message: null });
      void (async () => {
        try {
          const response = await queueOnlineSong({
            roomSlug: initial.roomSlug,
            songNumber,
            title,
            artistName,
            ...(authUser ? { requestedByName: authUser.displayName } : {})
          });
          if (response.queued) {
            setOnlineQueueState(songNumber, { status: "queued", message: null });
            return;
          }
          pollOnlineAsset(songNumber, response.assetId);
        } catch (error) {
          setOnlineQueueState(songNumber, {
            status: "failed",
            message: errorMessageFrom(error, "在线点歌失败")
          });
        }
      })();
      return true;
    },
    [
      authUser,
      initial.roomSlug,
      pollOnlineAsset,
      runCommand,
      runSongHistory,
      runSongSearch,
      setOnlineQueueState
    ]
  );

  return {
    authStatus,
    authUser,
    connectionStatus,
    deviceId,
    duplicateConfirm,
    errorMessage,
    pendingNasAssetId,
    onlineQueueState,
    requestAddOnlineSong,
    pendingInteractionKind,
    pendingUndo,
    roomSlug: initial.roomSlug,
    skipConfirmOpen,
    songDiscovery,
    songDiscoveryStatus,
    songHistory,
    songHistoryStatus,
    loadMoreSongSearch,
    songSearch,
    songSearchLoadingMore,
    songSearchQuery,
    songSearchStatus,
    snapshot,
    volumePercent: pendingVolumePercent ?? snapshot?.volumePercent ?? DEFAULT_ROOM_VOLUME_PERCENT,
    addSongVersion,
    addNasAsset,
    cancelDuplicateAdd: () => setDuplicateConfirm(null),
    cancelSkip: () => setSkipConfirmOpen(false),
    login: async (input) => {
      try {
        const response = await loginControllerUser(input);
        setAuthUser(response.user);
        setAuthStatus("authenticated");
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(authErrorMessageFrom(error, "登录失败"));
        throw error;
      }
    },
    register: async (input) => {
      try {
        const response = await registerControllerUser(input);
        setAuthUser(response.user);
        setAuthStatus("authenticated");
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(authErrorMessageFrom(error, "注册失败"));
        throw error;
      }
    },
    logout: async () => {
      try {
        await logoutControllerUser();
      } finally {
        setAuthUser(null);
        setAuthStatus("unauthenticated");
        setSnapshot(null);
        setSongSearch(null);
        setSongDiscovery(null);
        setSongHistory([]);
        setSongHistoryStatus("idle");
        setSongSearchQueryState("");
        songSearchQueryRef.current = "";
        setErrorMessage(null);
      }
    },
    updateDisplayName: async (displayName) => {
      try {
        const response = await updateControllerUserProfile({ displayName });
        setAuthUser(response.user);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(authErrorMessageFrom(error, "昵称修改失败"));
        throw error;
      }
    },
    confirmDuplicateAdd: async () => {
      const selection = duplicateConfirm;
      if (!selection) {
        return;
      }
      if (selection.kind === "nas") {
        await addNasAsset(selection.assetId);
      } else {
        await addSongVersion(selection.songId, selection.assetId);
      }
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
    shuffleQueue: async () => {
      await runCommand((input) => shuffleQueue(input));
    },
    requestAddSongVersion: (songId, assetId, title, queueState) => {
      if (queueState === "queued") {
        setDuplicateConfirm({ kind: "canonical", songId, assetId, title });
        return false;
      }

      void addSongVersion(songId, assetId);
      return true;
    },
    requestAddNasAsset: (assetId, title, queueState) => {
      if (queueState === "queued") {
        setDuplicateConfirm({ kind: "nas", assetId, title });
        return false;
      }

      void addNasAsset(assetId);
      return true;
    },
    sendInteraction,
    replayCurrent: async () => {
      await runCommand((input) => replayCurrent(input));
    },
    togglePause: async () => {
      await runCommand((input) => togglePause(input));
    },
    requestSkip: () => setSkipConfirmOpen(true),
    refreshSongDiscovery: () => {
      void runSongDiscovery(createDiscoverySeed());
    },
    refreshSongHistory: runSongHistory,
    setSongSearchQuery: (query) => {
      songSearchQueryRef.current = query;
      setSongSearchQueryState(query);
      clearSearchDebounce();
      searchDebounceRef.current = setTimeout(() => {
        void runSongSearch(query);
      }, 250);
    },
    setVolumePercent: (volumePercent) => {
      const normalized = normalizeVolumePercent(volumePercent);
      setPendingVolumePercent(normalized);
      clearVolumeDebounce();
      volumeDebounceRef.current = setTimeout(() => {
        void commitVolumePercent(normalized);
      }, 180);
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

function normalizeVolumePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ROOM_VOLUME_PERCENT;
  }
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

/**
 * 扫码进入时 URL 自带 token；直接打开控制端时退化为读取公共房间快照里的当前 token。
 * 这样局域网内不扫二维码也能配对（快照本来就对 TV 公开）。
 */
async function resolvePairingToken(roomSlug: string, queryToken: string | null): Promise<string | null> {
  if (queryToken) {
    return queryToken;
  }
  try {
    const snapshot = await fetchPublicRoomSnapshot(roomSlug);
    return snapshot.pairing?.token?.trim() || null;
  } catch {
    return null;
  }
}

const controllerRoomStorageKey = "home_ktv_controller_room";

function readRuntimeParams(): { roomSlug: string; pairingToken: string | null } {
  const search = new URLSearchParams(window.location.search);
  const queryRoom = normalizeRoomSlug(search.get("room"));
  let storedRoom: string | null = null;
  try {
    storedRoom = normalizeRoomSlug(window.localStorage.getItem(controllerRoomStorageKey));
  } catch {
    storedRoom = null;
  }

  const roomSlug = queryRoom ?? storedRoom ?? "living-room";
  if (queryRoom) {
    try {
      window.localStorage.setItem(controllerRoomStorageKey, queryRoom);
    } catch {}
  }

  return {
    roomSlug,
    pairingToken: search.get("token")
  };
}

function normalizeRoomSlug(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/[^a-z0-9-]/gu, "");
  return normalized.length >= 2 ? normalized.slice(0, 40) : null;
}

function createDiscoverySeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  if (error instanceof ControllerApiError) {
    if (error.code === "CONTROL_SESSION_REQUIRED") {
      return "请从电视端二维码重新进入控制端";
    }
    if (error.code === "INVALID_PAIRING_TOKEN") {
      return "配对码已失效，请重新扫描电视端二维码";
    }
  }

  return error instanceof Error ? error.message : fallback;
}

function authErrorMessageFrom(error: unknown, fallback: string): string {
  if (error instanceof ControllerApiError) {
    if (error.code === "INVALID_CREDENTIALS") {
      return "手机号或密码不正确";
    }
    if (error.code === "USER_ALREADY_EXISTS") {
      return "这个手机号已经注册";
    }
    if (error.code === "INVALID_PASSWORD") {
      return "密码至少 5 位";
    }
    if (error.code === "INVALID_PHONE") {
      return "请输入正确的手机号";
    }
    if (error.code === "INVALID_DISPLAY_NAME") {
      return "昵称不能为空";
    }
  }
  return error instanceof Error ? error.message : fallback;
}
