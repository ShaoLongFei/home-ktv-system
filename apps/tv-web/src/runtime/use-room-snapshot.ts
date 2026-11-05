import type { RoomControlSnapshot, RoomInteractionEvent, RoomSnapshot } from "@home-ktv/player-contracts";
import { useEffect, useState } from "react";
import type { PlayerClient } from "./player-client.js";

export interface RoomSnapshotState {
  errorMessage: string | null;
  interactions: readonly RoomInteractionEvent[];
  snapshot: RoomSnapshot | null;
  status: "booting" | "ready" | "error";
}

export function useRoomSnapshot(client: PlayerClient, pollingIntervalMs = 1500): RoomSnapshotState {
  const [state, setState] = useState<RoomSnapshotState>({
    errorMessage: null,
    interactions: [],
    snapshot: null,
    status: "booting"
  });

  useEffect(() => {
    let cancelled = false;
    let bootstrapInFlight = false;
    let bootstrapRetryIntervalId: ReturnType<typeof setInterval> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const interactionTimers = new Map<string, ReturnType<typeof setTimeout>>();
    let websocket: WebSocket | null = null;

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const stopBootstrapRetry = () => {
      if (bootstrapRetryIntervalId) {
        clearInterval(bootstrapRetryIntervalId);
        bootstrapRetryIntervalId = null;
      }
    };

    const updateSnapshot = async () => {
      try {
        const snapshot = await client.fetchSnapshot();
        if (!cancelled) {
          setState((current) => ({
            ...current,
            errorMessage: null,
            snapshot,
            status: "ready"
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            errorMessage: error instanceof Error ? error.message : "Snapshot request failed",
            snapshot: null,
            status: "error"
          }));
        }
      }
    };

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(updateSnapshot, pollingIntervalMs);
      }
    };

    const addInteraction = (interaction: RoomInteractionEvent) => {
      const existingTimer = interactionTimers.get(interaction.id);
      if (existingTimer) {
        globalThis.clearTimeout(existingTimer);
        interactionTimers.delete(interaction.id);
      }

      setState((current) => ({
        ...current,
        interactions: [...current.interactions.filter((item) => item.id !== interaction.id), interaction]
      }));

      const ttlMs = Math.max(1000, new Date(interaction.expiresAt).getTime() - Date.now());
      const timer = globalThis.setTimeout(() => {
        if (interactionTimers.get(interaction.id) !== timer) {
          return;
        }
        interactionTimers.delete(interaction.id);
        setState((current) => ({
          ...current,
          interactions: current.interactions.filter((item) => item.id !== interaction.id)
        }));
      }, ttlMs);
      interactionTimers.set(interaction.id, timer);
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
        const realtimeMessage = parseRealtimeMessage(event.data);
        if (cancelled || !realtimeMessage) {
          return;
        }

        const snapshot = realtimeMessage.snapshot;
        if (snapshot) {
          setState((current) => ({
            ...current,
            errorMessage: null,
            snapshot,
            status: "ready"
          }));
        }

        if (realtimeMessage.interaction) {
          addInteraction(realtimeMessage.interaction);
        }
      };
      websocket.onclose = startPolling;
      websocket.onerror = startPolling;
    };

    const startBootstrapRetry = () => {
      if (!bootstrapRetryIntervalId) {
        bootstrapRetryIntervalId = setInterval(() => {
          void start();
        }, pollingIntervalMs);
      }
    };

    const start = async () => {
      if (bootstrapInFlight) {
        return;
      }

      bootstrapInFlight = true;
      try {
        const bootstrap = await client.bootstrap();
        if (cancelled) {
          return;
        }

        stopBootstrapRetry();
        if (!cancelled && bootstrap.snapshot) {
          setState((current) => ({
            ...current,
            errorMessage: null,
            snapshot: bootstrap.snapshot,
            status: "ready"
          }));
        }
        openRealtime();
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            errorMessage: error instanceof Error ? error.message : "Player bootstrap failed",
            snapshot: null,
            status: "error"
          }));
          startBootstrapRetry();
        }
      } finally {
        bootstrapInFlight = false;
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopBootstrapRetry();
      stopPolling();
      for (const timer of interactionTimers.values()) {
        globalThis.clearTimeout(timer);
      }
      websocket?.close();
    };
  }, [client, pollingIntervalMs]);

  return state;
}

export function playbackEnabledFromSnapshot(snapshot: RoomSnapshot | null): boolean {
  return Boolean(snapshot?.currentTarget);
}

function parseRealtimeMessage(data: unknown): { snapshot?: RoomSnapshot; interaction?: RoomInteractionEvent } | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as { type?: string; payload?: RoomSnapshot | RoomControlSnapshot | RoomInteractionEvent };
    if (parsed.type === "room.control.snapshot.updated" && parsed.payload) {
      return { snapshot: toRoomSnapshot(parsed.payload as RoomSnapshot | RoomControlSnapshot) };
    }

    if (parsed.type === "room.interaction.created" && isRoomInteractionEvent(parsed.payload)) {
      return { interaction: parsed.payload };
    }

    return null;
  } catch {
    return null;
  }
}

function isRoomInteractionEvent(payload: unknown): payload is RoomInteractionEvent {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      typeof (payload as RoomInteractionEvent).id === "string" &&
      ((payload as RoomInteractionEvent).kind === "emoji" ||
        (payload as RoomInteractionEvent).kind === "bullet" ||
        (payload as RoomInteractionEvent).kind === "rainbow_praise" ||
        (payload as RoomInteractionEvent).kind === "roast" ||
        (payload as RoomInteractionEvent).kind === "blessing") &&
      typeof (payload as RoomInteractionEvent).message === "string"
  );
}

function toRoomSnapshot(snapshot: RoomSnapshot | RoomControlSnapshot): RoomSnapshot {
  if (snapshot.type === "room.snapshot") {
    return snapshot;
  }

  // 控制快照比播放快照多带了 tvPresence/controllers/queue，但少了 conflict，
  // 而音量、暂停、重唱标记必须原样透传：TV 端只从这三项知道要做什么，
  // 丢一项就会出现「手机调音量电视没反应」这类静默失效。
  // 这三项在契约里是可选的，undefined 时必须整个省略（exactOptionalPropertyTypes）。
  return {
    type: "room.snapshot",
    roomId: snapshot.roomId,
    roomSlug: snapshot.roomSlug,
    sessionVersion: snapshot.sessionVersion,
    state: snapshot.state,
    ...(snapshot.volumePercent != null ? { volumePercent: snapshot.volumePercent } : {}),
    pairing: snapshot.pairing,
    currentTarget: snapshot.currentTarget,
    switchTarget: snapshot.switchTarget,
    targetVocalMode: snapshot.targetVocalMode ?? null,
    ...(snapshot.playbackPaused != null ? { playbackPaused: snapshot.playbackPaused } : {}),
    ...(snapshot.replayToken != null ? { replayToken: snapshot.replayToken } : {}),
    conflict: snapshot.tvPresence.conflict,
    notice: snapshot.notice,
    generatedAt: snapshot.generatedAt
  };
}
