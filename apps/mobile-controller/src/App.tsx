import { I18nProvider, LanguageSwitch, useI18n, vocalModeName } from "./i18n.js";
import { supplementKey, useRoomController } from "./runtime/use-room-controller.js";

export function App() {
  return (
    <I18nProvider defaultLanguage="zh">
      <ControllerApp />
    </I18nProvider>
  );
}

function ControllerApp() {
  const { t } = useI18n();
  const controller = useRoomController();
  const snapshot = controller.snapshot;
  const current = snapshot?.currentTarget;
  const online = controller.songSearch?.online;
  const switchTarget = snapshot?.switchTarget;
  const switchLabel = switchTarget?.vocalMode === "original" ? t("button.switchToOriginal") : t("button.switchToInstrumental");
  const currentModeLabel = vocalModeName(current?.vocalMode ?? "unknown", t);

  return (
    <main className="app-shell" aria-label={t("app.aria")}>
      <header className="top-bar">
        <div>
          <p className="eyebrow">{controller.roomSlug}</p>
          <h1>{t("header.title")}</h1>
        </div>
        <div className="top-actions">
          <span className={snapshot?.tvPresence.online ? "status-pill online" : "status-pill offline"}>
            {snapshot?.tvPresence.online ? t("status.tvOnline") : t("status.tvOffline")}
          </span>
          <LanguageSwitch />
        </div>
      </header>

      {controller.connectionStatus === "reconnecting" ? (
        <div className="offline-banner">{t("status.reconnecting")}</div>
      ) : null}

      {controller.errorMessage ? <div className="error-banner">{controller.errorMessage}</div> : null}

      <section className="panel current-panel" aria-label={t("current.aria")}>
        <div>
          <p className="eyebrow">{t("current.eyebrow")}</p>
          <h2>{current?.currentQueueEntryPreview.songTitle ?? t("current.waiting")}</h2>
          <p>{current?.currentQueueEntryPreview.artistName ?? t("current.emptyQueue")}</p>
        </div>
        <div className="current-meta">
          <span>{snapshot?.state ?? t("current.connecting")}</span>
          <span>{currentModeLabel}</span>
        </div>
        <div className="mode-summary" aria-label={t("current.modeAria")}>
          <span className="mode-summary-label">{t("current.currentMode")}</span>
          <span className={`mode-summary-value ${current?.vocalMode ?? "unknown"}`}>{currentModeLabel}</span>
        </div>
        <div className="command-row">
          <button type="button" disabled={!switchTarget} onClick={() => void controller.switchVocalMode()}>
            {switchLabel}
          </button>
          <button type="button" disabled={!current} onClick={controller.requestSkip}>
            {t("button.skip")}
          </button>
        </div>
      </section>

      <section className="panel" aria-label={t("queue.aria")}>
        <h2>{t("queue.title")}</h2>
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
                    {undoExpiresAt ? <small>{t("queue.undoUntil", { time: formatTime(undoExpiresAt) })}</small> : null}
                  </div>
                  <div className="row-actions">
                    <button type="button" disabled={!entry.canPromote} onClick={() => void controller.promoteQueueEntry(entry.queueEntryId)}>
                      {t("button.promote")}
                    </button>
                    <button type="button" disabled={!entry.canDelete} onClick={() => void controller.deleteQueueEntry(entry.queueEntryId)}>
                      {t("button.delete")}
                    </button>
                    {undoExpiresAt ? (
                      <button type="button" onClick={() => void controller.undoDelete(entry.queueEntryId)}>
                        {t("button.undo")}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="empty-state">{t("queue.empty")}</p>
          )}
        </div>
      </section>

      <section className="panel search-panel" aria-label={t("search.aria")}>
        <div className="panel-heading">
          <h2>{t("search.title")}</h2>
          {controller.songSearchStatus === "loading" ? <span className="search-status">{t("search.loading")}</span> : null}
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
            aria-label={t("search.inputAria")}
            className="search-input"
            value={controller.songSearchQuery}
            onChange={(event) => controller.setSongSearchQuery(event.currentTarget.value)}
            placeholder={t("search.placeholder")}
          />
          <button type="submit">{t("search.submit")}</button>
        </form>

        <div className="song-list">
          {controller.songSearch?.local.map((result) => {
            const isQueued = result.queueState === "queued";
            const statusLabel = isQueued ? t("search.queued") : t("search.localPlayable");

            return (
              <article className="song-row search-result-row" key={result.songId}>
                <div className="result-main">
                  <strong>{result.title}</strong>
                  <p>{result.artistName}</p>
                  <div className="result-meta">
                    <span className={isQueued ? "queued-badge" : "local-badge"}>{statusLabel}</span>
                    <span>{t("search.versionCount", { count: result.versions.length })}</span>
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
                    {isQueued ? t("button.addAgain") : t("button.add")}
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
                            {version.isRecommended ? <span className="recommended-mark">{t("search.recommended")}</span> : null}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            controller.requestAddSongVersion(result.songId, version.assetId, result.title, result.queueState)
                          }
                        >
                          {t("button.addVersion")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}

          {controller.songSearch && controller.songSearch.local.length === 0 ? (
            <p className="empty-state local-empty">{t("search.localEmpty")}</p>
          ) : null}

          {online ? (
            <section className="online-panel" aria-label={t("online.aria")}>
              <div className="panel-heading">
                <h3>{t("online.title")}</h3>
                <span className={`search-status ${online.status}`}>{online.message}</span>
              </div>

              {online.candidates.length > 0 ? (
                <div className="online-candidate-list">
                  {online.candidates.map((candidate) => {
                    const isPending = controller.pendingSupplementKeys.includes(
                      supplementKey(candidate.provider, candidate.providerCandidateId)
                    );
                    const isReady = candidate.taskState === "ready";

                    return (
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
                        <button
                          type="button"
                          disabled={isPending || isReady}
                          onClick={() => void controller.requestSupplement(candidate.provider, candidate.providerCandidateId)}
                        >
                          {isPending ? t("button.submitting") : isReady ? t("button.ready") : t("button.requestSupplement")}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : online.requestSupplement?.visible ? (
                <div className="online-placeholder">
                  <strong>{t("online.emptyTitle")}</strong>
                  <p>{t("online.emptyBody")}</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>

      {controller.skipConfirmOpen ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="skip-title">
            <h2 id="skip-title">{t("dialog.skipTitle")}</h2>
            <p>{t("dialog.skipBody", { title: current?.currentQueueEntryPreview.songTitle ?? t("current.eyebrow") })}</p>
            <div className="command-row">
              <button type="button" onClick={controller.cancelSkip}>
                {t("button.cancel")}
              </button>
              <button type="button" onClick={() => void controller.confirmSkip()}>
                {t("button.confirm")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {controller.duplicateConfirm ? (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title">
            <h2 id="duplicate-title">{t("dialog.duplicateTitle")}</h2>
            <p>{t("dialog.duplicateBody", { title: controller.duplicateConfirm.title })}</p>
            <div className="command-row">
              <button type="button" onClick={controller.cancelDuplicateAdd}>
                {t("button.cancel")}
              </button>
              <button type="button" onClick={() => void controller.confirmDuplicateAdd()}>
                {t("button.confirmAddAgain")}
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
