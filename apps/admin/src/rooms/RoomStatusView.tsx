import { eventTypeText, roomStateText, taskStateText, useI18n, vocalModeName } from "../i18n.js";
import type { RoomOnlineTaskSummaryRow } from "./types.js";
import { useRoomStatus } from "./use-room-status.js";

export function RoomStatusView() {
  const { t } = useI18n();
  const roomSlug = "living-room";
  const {
    busyTaskAction,
    errorMessage,
    isRefreshingPairing,
    isRefreshingRoom,
    refreshPairingToken,
    refreshRoomStatus,
    roomStatus,
    runTaskAction
  } = useRoomStatus(roomSlug, t);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>{t("rooms.title")}</h1>
          <p>{t("rooms.description")}</p>
        </div>
        <div className="admin-header-actions">
          <button className="secondary-button" type="button" onClick={() => void refreshRoomStatus()} disabled={isRefreshingRoom}>
            {isRefreshingRoom ? t("common.refreshing") : t("rooms.refreshState")}
          </button>
          <button className="primary-button" type="button" onClick={() => void refreshPairingToken()} disabled={!roomStatus || isRefreshingPairing}>
            {isRefreshingPairing ? t("common.refreshing") : t("rooms.refreshToken")}
          </button>
        </div>
      </header>

      <section className="room-status-grid" aria-label={t("rooms.gridAria")}>
        {errorMessage ? <p className="room-status-error">{errorMessage}</p> : null}
        <dl className="room-status-summary">
          <div>
            <dt>{t("rooms.state")}</dt>
            <dd>{roomStatus ? roomStateText(roomStatus.room.status, t) : t("common.loading")}</dd>
          </div>
          <div>
            <dt>{t("rooms.tokenExpires")}</dt>
            <dd>{roomStatus ? formatTime(roomStatus.pairing.tokenExpiresAt) : t("common.loading")}</dd>
          </div>
          <div>
            <dt>{t("rooms.onlineControllers")}</dt>
            <dd>{roomStatus ? roomStatus.controllers.onlineCount : t("common.loading")}</dd>
          </div>
          <div>
            <dt>{t("rooms.tvStatus")}</dt>
            <dd>{roomStatus ? (roomStatus.tvPresence.online ? t("rooms.tvOnline") : t("rooms.tvOffline")) : t("common.loading")}</dd>
          </div>
          <div>
            <dt>{t("rooms.sessionVersion")}</dt>
            <dd>{roomStatus ? roomStatus.sessionVersion : t("common.loading")}</dd>
          </div>
        </dl>

        <section className="room-status-panel" aria-label={t("rooms.currentSong")}>
          <h2>{t("rooms.currentSong")}</h2>
          {roomStatus?.current ? (
            <p>
              {roomStatus.current.songTitle} - {roomStatus.current.artistName} ({vocalModeName(roomStatus.current.vocalMode, t)})
            </p>
          ) : (
            <p>{t("rooms.noCurrentSong")}</p>
          )}
        </section>

        <section className="room-status-panel" aria-label={t("rooms.queueSummary")}>
          <h2>{t("rooms.queueSummary")}</h2>
          <ol className="room-status-queue">
            {(roomStatus?.queue ?? []).slice(0, 5).map((entry) => (
              <li key={entry.queueEntryId}>
                <strong>{entry.songTitle}</strong>
                <span>{entry.artistName}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="room-status-panel room-status-wide" aria-label={t("rooms.onlineTasks")}>
          <div className="room-section-header">
            <h2>{t("rooms.onlineTasks")}</h2>
            <span>
              <strong>{t("rooms.taskCounts")}</strong> {formatTaskCounts(roomStatus?.onlineTasks.counts, t)}
            </span>
          </div>
          <div className="room-task-list">
            {(roomStatus?.onlineTasks.tasks ?? []).map((task) => (
              <article className="room-task-row" key={task.taskId}>
                <div className="room-task-main">
                  <strong>{task.title}</strong>
                  <span>{task.artistName} / {task.sourceLabel}</span>
                  <small>
                    {task.provider}:{task.providerCandidateId} / {t("rooms.event")} {task.recentEventAt ? formatTime(task.recentEventAt) : t("common.unknown")}
                  </small>
                  {task.failureReason ? <small className="room-status-error">{task.failureReason}</small> : null}
                </div>
                <div className="room-task-state">
                  <span className={`state-chip ${task.status}`}>{taskStateText(task.status, t)}</span>
                  <div className="task-action-group">
                    {canRetryTask(task) ? (
                      <button
                        aria-label={t("rooms.retryTaskAria", { taskId: task.taskId })}
                        className="secondary-button compact-button"
                        disabled={busyTaskAction !== null}
                        type="button"
                        onClick={() => void runTaskAction(task, "retry")}
                      >
                        {busyTaskAction === `retry:${task.taskId}` ? "重试中..." : t("rooms.retry")}
                      </button>
                    ) : null}
                    {canCleanTask(task) ? (
                      <button
                        aria-label={t("rooms.cleanTaskAria", { taskId: task.taskId })}
                        className="danger-button compact-button"
                        disabled={busyTaskAction !== null}
                        type="button"
                        onClick={() => void runTaskAction(task, "clean")}
                      >
                        {busyTaskAction === `clean:${task.taskId}` ? "清理中..." : t("rooms.clean")}
                      </button>
                    ) : null}
                    {task.status === "ready" ? (
                      <button
                        aria-label={t("rooms.promoteTaskAria", { taskId: task.taskId })}
                        className="secondary-button compact-button"
                        disabled={busyTaskAction !== null}
                        type="button"
                        onClick={() => void runTaskAction(task, "promote")}
                      >
                        {busyTaskAction === `promote:${task.taskId}` ? "入库中..." : t("rooms.promote")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="room-status-panel room-status-wide" aria-label={t("rooms.recentEvents")}>
          <h2>{t("rooms.recentEvents")}</h2>
          <ol className="room-event-list">
            {(roomStatus?.recentEvents ?? []).map((event) => (
              <li key={event.id}>
                <strong>{eventTypeText(event.eventType, t)}</strong>
                <span>
                  <code>{event.eventType}</code> / {event.queueEntryId ?? t("rooms.roomFallback")} / {formatTime(event.createdAt)}
                </span>
                <small>{formatPayload(event.eventPayload, t)}</small>
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

function formatTaskCounts(counts: Record<string, number> | undefined, t: ReturnType<typeof useI18n>["t"]): string {
  if (!counts) {
    return `${taskStateText("total", t)} 0`;
  }
  return Object.entries(counts)
    .map(([status, count]) => `${taskStateText(status, t)} ${count}`)
    .join(" / ");
}

function canRetryTask(task: RoomOnlineTaskSummaryRow): boolean {
  return task.status === "failed" || task.status === "stale" || task.status === "review_required";
}

function canCleanTask(task: RoomOnlineTaskSummaryRow): boolean {
  return task.status === "failed" || task.status === "stale";
}

function formatPayload(payload: Record<string, unknown>, t: ReturnType<typeof useI18n>["t"]): string {
  const reason = typeof payload.reason === "string" ? payload.reason : null;
  const recovery = typeof payload.recovery === "string" ? payload.recovery : null;
  return [reason, recovery].filter(Boolean).join(" / ") || t("common.noPayload");
}
