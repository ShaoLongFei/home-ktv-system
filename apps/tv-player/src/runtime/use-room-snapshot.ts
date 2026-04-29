import type { RoomSnapshot } from "@home-ktv/player-contracts";
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

    const updateSnapshot = async () => {
      try {
        const snapshot = await client.fetchSnapshot();
        if (!cancelled) {
          setState((previous) => ({
            errorMessage: null,
            snapshot: stabilizeSnapshotPairing(previous.snapshot, snapshot),
            status: "ready"
          }));
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

    const start = async () => {
      try {
        const bootstrap = await client.bootstrap();
        if (!cancelled && bootstrap.snapshot) {
          const snapshot = bootstrap.snapshot;
          setState((previous) => ({
            errorMessage: null,
            snapshot: stabilizeSnapshotPairing(previous.snapshot, snapshot),
            status: "ready"
          }));
        }
        if (!shouldContinueSnapshotPolling(bootstrap)) {
          return;
        }
        await updateSnapshot();
        intervalId = setInterval(updateSnapshot, pollingIntervalMs);
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
      if (intervalId) {
        clearInterval(intervalId);
      }
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

export function stabilizeSnapshotPairing(previous: RoomSnapshot | null, incoming: RoomSnapshot): RoomSnapshot {
  if (!previous || previous.roomSlug !== incoming.roomSlug) {
    return incoming;
  }

  return {
    ...incoming,
    pairing: previous.pairing
  };
}
