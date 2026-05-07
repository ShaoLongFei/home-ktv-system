import type { RoomControlSnapshot, RoomSnapshot } from "@home-ktv/player-contracts";
import { useEffect, useState } from "react";
import type { BootstrapResult, PlayerClient } from "./player-client.js";

export interface RoomSnapshotState {
  errorMessage: string | null;
  snapshot: RoomSnapshot | null;
  status: "booting" | "ready" | "error";
}

export function useRoomSnapshot(client: PlayerClient, pollingIntervalMs = 1500): RoomSnapshotState {
  const [state, setState] = useState<RoomSnapshotState>({
    errorMessage: null,
    snapshot: null,
    status: "booting"
  });

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let websocket: WebSocket | null = null;

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const updateSnapshot = async () => {
      try {
        const snapshot = await client.fetchSnapshot();
        if (!cancelled) {
          setState({
            errorMessage: null,
            snapshot,
            status: "ready"
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            errorMessage: error instanceof Error ? error.message : "Snapshot request failed",
            snapshot: null,
            status: "error"
          });
        }
      }
    };

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(updateSnapshot, pollingIntervalMs);
      }
    };

    const openRealtime = () => {
      try {
        websocket = new WebSocket(client.createSnapshotSocketUrl());
      } catch {
        startPolling();
        return;
      }

      websocket.onopen = () => {
        stopPolling();
      };
      websocket.onmessage = (event) => {
        const snapshot = snapshotFromRealtimeMessage(event.data);
        if (!cancelled && snapshot) {
          setState({
            errorMessage: null,
            snapshot,
            status: "ready"
          });
        }
      };
      websocket.onclose = startPolling;
      websocket.onerror = startPolling;
    };

    const start = async () => {
      try {
        const bootstrap = await client.bootstrap();
        if (!cancelled && bootstrap.snapshot) {
          setState({
            errorMessage: null,
            snapshot: bootstrap.snapshot,
            status: "ready"
          });
        }
        if (!shouldContinueSnapshotPolling(bootstrap)) {
          return;
        }
        openRealtime();
      } catch (error) {
        if (!cancelled) {
          setState({
            errorMessage: error instanceof Error ? error.message : "Player bootstrap failed",
            snapshot: null,
            status: "error"
          });
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopPolling();
      websocket?.close();
    };
  }, [client, pollingIntervalMs]);

  return state;
}

export function playbackEnabledFromSnapshot(snapshot: RoomSnapshot | null): boolean {
  return Boolean(snapshot?.currentTarget) && snapshot?.state !== "conflict" && !snapshot?.conflict;
}

export function shouldContinueSnapshotPolling(bootstrap: BootstrapResult): boolean {
  return bootstrap.status !== "conflict" && bootstrap.snapshot?.state !== "conflict" && !bootstrap.snapshot?.conflict;
}

function snapshotFromRealtimeMessage(data: unknown): RoomSnapshot | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as { type?: string; payload?: RoomSnapshot | RoomControlSnapshot };
    if (parsed.type !== "room.control.snapshot.updated" || !parsed.payload) {
      return null;
    }

    return toRoomSnapshot(parsed.payload);
  } catch {
    return null;
  }
}

function toRoomSnapshot(snapshot: RoomSnapshot | RoomControlSnapshot): RoomSnapshot {
  if (snapshot.type === "room.snapshot") {
    return snapshot;
  }

  return {
    type: "room.snapshot",
    roomId: snapshot.roomId,
    roomSlug: snapshot.roomSlug,
    sessionVersion: snapshot.sessionVersion,
    state: snapshot.state,
    pairing: snapshot.pairing,
    currentTarget: snapshot.currentTarget,
    switchTarget: snapshot.switchTarget,
    targetVocalMode: snapshot.targetVocalMode ?? null,
    conflict: snapshot.tvPresence.conflict,
    notice: snapshot.notice,
    generatedAt: snapshot.generatedAt
  };
}
