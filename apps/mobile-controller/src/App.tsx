import { useRoomController } from "./runtime/use-room-controller.js";

export function App() {
  const controller = useRoomController();
  const snapshot = controller.snapshot;
  const current = snapshot?.currentTarget;
  const switchTarget = snapshot?.switchTarget;
  const switchLabel = switchTarget?.vocalMode === "original" ? "切到原唱" : "切到伴唱";
  const currentModeLabel = vocalModeLabel(current?.vocalMode ?? "unknown");

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
          <span>{currentModeLabel}</span>
        </div>
        <div className="mode-summary" aria-label="current-vocal-mode">
          <span className="mode-summary-label">当前模式</span>
          <span className={`mode-summary-value ${current?.vocalMode ?? "unknown"}`}>{currentModeLabel}</span>
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

      <section className="panel search-panel" aria-label="Song search">
        <div className="panel-heading">
          <h2>搜索歌曲</h2>
          {controller.songSearchStatus === "loading" ? <span className="search-status">搜索中</span> : null}
        </div>
        <form
          role="search"
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            controller.submitSongSearch();
          }}
        >
          <input
            aria-label="搜索歌曲"
            className="search-input"
            value={controller.songSearchQuery}
            onChange={(event) => controller.setSongSearchQuery(event.currentTarget.value)}
            placeholder="歌名 / 歌手 / 拼音 / 首字母"
          />
          <button type="submit">搜索</button>
        </form>

        <div className="song-list">
          {controller.songSearch?.online ? (
            <section className="online-panel" aria-label="Online supplement">
              <div className="panel-heading">
                <h3>在线补歌</h3>
                <span className={`search-status ${controller.songSearch.online.status}`}>{controller.songSearch.online.message}</span>
              </div>

              {controller.songSearch.online.requestSupplement?.visible ? (
                <div className="request-supplement-entry">
                  <button type="button" disabled>
                    {controller.songSearch.online.requestSupplement.label}
                  </button>
                </div>
              ) : null}

              <div className="online-candidate-list">
                {controller.songSearch.online.candidates.map((candidate) => (
                  <article className="song-row online-candidate-row" key={`${candidate.provider}:${candidate.providerCandidateId}`}>
                    <div className="result-main">
                      <strong>{candidate.title}</strong>
                      <p>{candidate.artistName}</p>
                      <div className="result-meta">
                        <span className="online-source">{candidate.sourceLabel}</span>
                        <span>{formatDuration(candidate.durationMs ?? 0)}</span>
                        <span>{candidate.candidateType}</span>
                        <span>{candidate.reliabilityLabel}</span>
                        <span>{candidate.riskLabel}</span>
                        <span>{candidate.taskState}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => void controller.requestSupplement(candidate.provider, candidate.providerCandidateId)}>
                      请求补歌
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {controller.songSearch?.local.map((result) => {
            const isQueued = result.queueState === "queued";
            const statusLabel = isQueued ? "已点 / 队列中" : "本地可播";

            return (
              <article className="song-row search-result-row" key={result.songId}>
                <div className="result-main">
                  <strong>{result.title}</strong>
                  <p>{result.artistName}</p>
                  <div className="result-meta">
                    <span className={isQueued ? "queued-badge" : "local-badge"}>{statusLabel}</span>
                    <span>{result.versions.length} 个版本</span>
                  </div>
                </div>

                {result.versions.length === 1 && result.versions[0] ? (
                  <button
                    type="button"
                    onClick={() =>
                      controller.requestAddSongVersion(
                        result.songId,
                        result.versions[0]!.assetId,
                        result.title,
                        result.queueState
                      )
                    }
                  >
                    {isQueued ? "加点" : "点歌"}
                  </button>
                ) : null}

                {result.versions.length > 1 ? (
                  <div className="version-list">
                    {result.versions.map((version) => (
                      <div className="version-row" key={version.assetId}>
                        <div>
                          <strong>{version.displayName}</strong>
                          <p>
                            {version.sourceLabel} · {formatDuration(version.durationMs)} · {version.qualityLabel}
                            {version.isRecommended ? <span className="recommended-mark">推荐</span> : null}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            controller.requestAddSongVersion(result.songId, version.assetId, result.title, result.queueState)
                          }
                        >
                          点这个版本
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}

          {controller.songSearch && controller.songSearch.local.length === 0 ? (
            <p className="empty-state local-empty">本地未找到</p>
          ) : null}
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

      {controller.duplicateConfirm ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
            <h2 id="duplicate-title">重复点歌</h2>
            <p>{controller.duplicateConfirm.title} 已在队列中，仍要再点一次吗？</p>
            <div className="command-row">
              <button type="button" onClick={controller.cancelDuplicateAdd}>
                取消
              </button>
              <button type="button" onClick={() => void controller.confirmDuplicateAdd()}>
                确认加点
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

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function vocalModeLabel(mode: string): string {
  if (mode === "original") {
    return "原唱";
  }

  if (mode === "instrumental") {
    return "伴唱";
  }

  if (mode === "dual") {
    return "双轨";
  }

  return "unknown";
}
