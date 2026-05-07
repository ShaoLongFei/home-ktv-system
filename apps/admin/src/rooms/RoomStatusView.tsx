import { useEffect, useState } from "react";
import { fetchRoomStatus, refreshPairingToken } from "../api/client.js";
import type { RoomStatusResponse } from "./types.js";

export function RoomStatusView() {
  const roomSlug = "living-room";
  const [roomStatus, setRoomStatus] = useState<RoomStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchRoomStatus(roomSlug)
      .then((status) => {
        if (!cancelled) {
          setRoomStatus(status);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load room status");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = async () => {
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
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>Room status</h1>
          <p>Inspect the live control session state and refresh the pairing token.</p>
        </div>
        <button className="primary-button" type="button" onClick={handleRefresh} disabled={!roomStatus}>
          Refresh pairing token
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
  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}
