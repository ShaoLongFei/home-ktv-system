import { useEffect, useState } from "react";
import {
  cleanFailedOnlineTask,
  getOrCreateAdminDeviceId,
  promoteOnlineTaskResource,
  refreshPairingToken,
  refreshRoomStatus,
  retryFailedOnlineTask,
  roomRealtimeUrl
} from "../api/client.js";
import type { RoomControlSnapshotMessage, RoomControlSnapshotPayload, RoomOnlineTaskSummaryRow, RoomStatusResponse } from "./types.js";

const realtimeFallbackPollingMs = 5000;

export function RoomStatusView() {
  const roomSlug = "living-room";
  const [roomStatus, setRoomStatus] = useState<RoomStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshingRoom, setIsRefreshingRoom] = useState(false);
  const [isRefreshingPairing, setIsRefreshingPairing] = useState(false);
  const [busyTaskAction, setBusyTaskAction] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let websocket: WebSocket | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const loadRoomStatus = async () => {
      try {
        const status = await refreshRoomStatus(roomSlug);
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
    setIsRefreshingRoom(true);
    try {
      const status = await refreshRoomStatus(roomSlug);
      setRoomStatus(status);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh room state");
    } finally {
      setIsRefreshingRoom(false);
    }
  };

  const handlePairingRefresh = async () => {
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

  const handleTaskAction = async (task: RoomOnlineTaskSummaryRow, action: "retry" | "clean" | "promote") => {
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
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Failed to ${action} task`);
    } finally {
      setBusyTaskAction(null);
    }
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>Room status</h1>
          <p>Inspect the live control session state and refresh the pairing token.</p>
        </div>
        <div className="admin-header-actions">
          <button className="secondary-button" type="button" onClick={handleRefresh} disabled={isRefreshingRoom}>
            {isRefreshingRoom ? "Refreshing..." : "Refresh room state"}
          </button>
          <button className="primary-button" type="button" onClick={handlePairingRefresh} disabled={!roomStatus || isRefreshingPairing}>
          {isRefreshingPairing ? "Refreshing..." : "Refresh pairing token"}
          </button>
        </div>
      </header>

      <section className="room-status-grid" aria-label="Room status">
        {errorMessage ? <p className="room-status-error">{errorMessage}</p> : null}
        <dl className="room-status-summary">
          <div>
            <dt>Room state</dt>
            <dd>{roomStatus ? roomStatus.room.status : "Loading..."}</dd>
          </div>
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

        <section className="room-status-panel room-status-wide" aria-label="Online tasks">
          <div className="room-section-header">
            <h2>Online tasks</h2>
            <span>
              <strong>Task counts</strong> {formatTaskCounts(roomStatus?.onlineTasks.counts)}
            </span>
          </div>
          <div className="room-task-list">
            {(roomStatus?.onlineTasks.tasks ?? []).map((task) => (
              <article className="room-task-row" key={task.taskId}>
                <div className="room-task-main">
                  <strong>{task.title}</strong>
                  <span>{task.artistName} / {task.sourceLabel}</span>
                  <small>
                    {task.provider}:{task.providerCandidateId} / event {task.recentEventAt ? formatTime(task.recentEventAt) : "unknown"}
                  </small>
                  {task.failureReason ? <small className="room-status-error">{task.failureReason}</small> : null}
                </div>
                <div className="room-task-state">
                  <span className={`state-chip ${task.status}`}>{task.status}</span>
                  <div className="task-action-group">
                    {canRetryTask(task) ? (
                      <button
                        aria-label={`Retry task ${task.taskId}`}
                        className="secondary-button compact-button"
                        disabled={busyTaskAction !== null}
                        type="button"
                        onClick={() => void handleTaskAction(task, "retry")}
                      >
                        Retry
                      </button>
                    ) : null}
                    {canCleanTask(task) ? (
                      <button
                        aria-label={`Clean task ${task.taskId}`}
                        className="danger-button compact-button"
                        disabled={busyTaskAction !== null}
                        type="button"
                        onClick={() => void handleTaskAction(task, "clean")}
                      >
                        Clean
                      </button>
                    ) : null}
                    {task.status === "ready" ? (
                      <button
                        aria-label={`Promote task ${task.taskId}`}
                        className="secondary-button compact-button"
                        disabled={busyTaskAction !== null}
                        type="button"
                        onClick={() => void handleTaskAction(task, "promote")}
                      >
                        Promote
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="room-status-panel room-status-wide" aria-label="Recent events">
          <h2>Recent events</h2>
          <ol className="room-event-list">
            {(roomStatus?.recentEvents ?? []).map((event) => (
              <li key={event.id}>
                <strong>{event.eventType}</strong>
                <span>{event.queueEntryId ?? "room"} / {formatTime(event.createdAt)}</span>
                <small>{formatPayload(event.eventPayload)}</small>
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

function formatTaskCounts(counts: Record<string, number> | undefined): string {
  if (!counts) {
    return "total 0";
  }
  return Object.entries(counts)
    .map(([status, count]) => `${status} ${count}`)
    .join(" / ");
}

function canRetryTask(task: RoomOnlineTaskSummaryRow): boolean {
  return task.status === "failed" || task.status === "stale" || task.status === "review_required";
}

function canCleanTask(task: RoomOnlineTaskSummaryRow): boolean {
  return task.status === "failed" || task.status === "stale";
}

function formatPayload(payload: Record<string, unknown>): string {
  const reason = typeof payload.reason === "string" ? payload.reason : null;
  const recovery = typeof payload.recovery === "string" ? payload.recovery : null;
  return [reason, recovery].filter(Boolean).join(" / ") || "no payload";
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
