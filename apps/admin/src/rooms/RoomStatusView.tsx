import { useEffect, useState } from "react";
import { fetchRoomStatus, getOrCreateAdminDeviceId, refreshPairingToken, roomRealtimeUrl } from "../api/client.js";
import type { RoomControlSnapshotMessage, RoomControlSnapshotPayload, RoomStatusResponse } from "./types.js";

const realtimeFallbackPollingMs = 5000;

export function RoomStatusView() {
  const roomSlug = "living-room";
  const [roomStatus, setRoomStatus] = useState<RoomStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshingPairing, setIsRefreshingPairing] = useState(false);

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
          setErrorMessage(error instanceof Error ? error.message : "Failed to load room status");
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

      websocket = new WebSocket(roomRealtimeUrl({ roomSlug, deviceId: getOrCreateAdminDeviceId() }));
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
  }, []);

  const handleRefresh = async () => {
    setIsRefreshingPairing(true);
    try {
      const refreshed = await refreshPairingToken(roomSlug);
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
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh pairing token");
    } finally {
      setIsRefreshingPairing(false);
    }
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>Room status</h1>
          <p>Inspect the live control session state and refresh the pairing token.</p>
        </div>
        <button className="primary-button" type="button" onClick={handleRefresh} disabled={!roomStatus || isRefreshingPairing}>
          {isRefreshingPairing ? "Refreshing..." : "Refresh pairing token"}
        </button>
      </header>

      <section className="room-status-grid" aria-label="Room status">
        {errorMessage ? <p className="room-status-error">{errorMessage}</p> : null}
        <dl className="room-status-summary">
          <div>
            <dt>Token expires</dt>
            <dd>{roomStatus ? formatTime(roomStatus.pairing.tokenExpiresAt) : "Loading..."}</dd>
          </div>
          <div>
            <dt>Online controllers</dt>
            <dd>{roomStatus ? roomStatus.controllers.onlineCount : "Loading..."}</dd>
          </div>
          <div>
            <dt>TV status</dt>
            <dd>{roomStatus ? (roomStatus.tvPresence.online ? "在线" : "离线") : "Loading..."}</dd>
          </div>
          <div>
            <dt>Session version</dt>
            <dd>{roomStatus ? roomStatus.sessionVersion : "Loading..."}</dd>
          </div>
        </dl>

        <section className="room-status-panel" aria-label="Current song">
          <h2>Current song</h2>
          {roomStatus?.current ? (
            <p>
              {roomStatus.current.songTitle} - {roomStatus.current.artistName} ({roomStatus.current.vocalMode})
            </p>
          ) : (
            <p>No current song</p>
          )}
        </section>

        <section className="room-status-panel" aria-label="Queue summary">
          <h2>Queue summary</h2>
          <ol className="room-status-queue">
            {(roomStatus?.queue ?? []).slice(0, 5).map((entry) => (
              <li key={entry.queueEntryId}>
                <strong>{entry.songTitle}</strong>
                <span>{entry.artistName}</span>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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
    queue: snapshot.queue.map((entry) => ({ ...entry }))
  };
}
