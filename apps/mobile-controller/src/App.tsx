import { useRoomController } from "./runtime/use-room-controller.js";

export function App() {
  const controller = useRoomController();
  const snapshot = controller.snapshot;
  const current = snapshot?.currentTarget;
  const switchTarget = snapshot?.switchTarget;
  const switchLabel = switchTarget?.vocalMode === "original" ? "切到原唱" : "切到伴唱";

  return (
    <main className="app-shell" aria-label="Home KTV controller">
      <header className="top-bar">
        <div>
          <p className="eyebrow">{controller.roomSlug}</p>
          <h1>点歌控制台</h1>
        </div>
        <span className={snapshot?.tvPresence.online ? "status-pill online" : "status-pill offline"}>
          {snapshot?.tvPresence.online ? "电视在线" : "电视离线"}
        </span>
      </header>

      {controller.connectionStatus === "reconnecting" ? (
        <div className="offline-banner">连接中断，正在重连</div>
      ) : null}

      {controller.errorMessage ? <div className="error-banner">{controller.errorMessage}</div> : null}

      <section className="panel current-panel" aria-label="Current playback">
        <div>
          <p className="eyebrow">正在播放</p>
          <h2>{current?.currentQueueEntryPreview.songTitle ?? "等待点歌"}</h2>
          <p>{current?.currentQueueEntryPreview.artistName ?? "队列为空"}</p>
        </div>
        <div className="current-meta">
          <span>{snapshot?.state ?? "连接中"}</span>
          <span>{current?.vocalMode ?? "unknown"}</span>
        </div>
        <div className="command-row">
          <button type="button" disabled={!switchTarget} onClick={() => void controller.switchVocalMode()}>
            {switchLabel}
          </button>
          <button type="button" disabled={!current} onClick={controller.requestSkip}>
            切歌
          </button>
        </div>
      </section>

      <section className="panel" aria-label="Queue">
        <h2>播放队列</h2>
        <div className="queue-list">
          {snapshot?.queue.length ? (
            snapshot.queue.map((entry) => {
              const undoExpiresAt =
                entry.undoExpiresAt ??
                (controller.pendingUndo?.queueEntryId === entry.queueEntryId ? controller.pendingUndo.undoExpiresAt : null);
              return (
                <article className="queue-row" key={entry.queueEntryId}>
                  <div>
                    <strong>{entry.songTitle}</strong>
                    <p>{entry.artistName}</p>
                    {undoExpiresAt ? <small>可撤销至 {formatTime(undoExpiresAt)}</small> : null}
                  </div>
                  <div className="row-actions">
                    <button type="button" disabled={!entry.canPromote} onClick={() => void controller.promoteQueueEntry(entry.queueEntryId)}>
                      顶歌
                    </button>
                    <button type="button" disabled={!entry.canDelete} onClick={() => void controller.deleteQueueEntry(entry.queueEntryId)}>
                      删除
                    </button>
                    {undoExpiresAt ? (
                      <button type="button" onClick={() => void controller.undoDelete(entry.queueEntryId)}>
                        撤销
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="empty-state">暂无排队歌曲</p>
          )}
        </div>
      </section>

      <section className="panel" aria-label="Ready songs">
        <h2>可点歌曲</h2>
        <div className="song-list">
          {controller.availableSongs.map((song) => (
            <article className="song-row" key={song.songId}>
              <div>
                <strong>{song.title}</strong>
                <p>{song.artistName}</p>
              </div>
              <button type="button" onClick={() => void controller.addSong(song.songId)}>
                点歌
              </button>
            </article>
          ))}
        </div>
      </section>

      {controller.skipConfirmOpen ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="skip-title">
            <h2 id="skip-title">确认切歌</h2>
            <p>{current?.currentQueueEntryPreview.songTitle ?? "当前歌曲"} 将结束播放。</p>
            <div className="command-row">
              <button type="button" onClick={controller.cancelSkip}>
                取消
              </button>
              <button type="button" onClick={() => void controller.confirmSkip()}>
                确认
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
