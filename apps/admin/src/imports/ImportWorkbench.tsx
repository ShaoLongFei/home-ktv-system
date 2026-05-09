import { statusText, useI18n } from "../i18n.js";
import { CandidateEditor } from "./CandidateEditor.js";
import type { ImportCandidate, ImportCandidateStatus } from "./types.js";
import { importCandidateStatusFilters, useImportWorkbenchRuntime } from "./use-import-workbench-runtime.js";

export function ImportWorkbench() {
  const { t } = useI18n();
  const {
    activeStatus,
    setActiveStatus,
    selectedCandidateId,
    setSelectedCandidateId,
    candidatesByStatus,
    queueReady,
    queueHasError,
    selectedDetail,
    isScanning,
    scanImports,
    saveMetadata,
    holdCandidate,
    approveCandidate,
    rejectDeleteCandidate,
    resolveConflict,
    isBusy
  } = useImportWorkbenchRuntime();

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>{t("imports.title")}</h1>
          <p>{t("imports.description")}</p>
        </div>
        <button className="primary-button" disabled={isScanning} type="button" onClick={() => void scanImports()}>
          {isScanning ? "扫描中..." : t("imports.scan")}
        </button>
      </header>

      <section className="admin-workbench" aria-label={t("imports.workbenchAria")}>
        <aside className="queue-pane" aria-label={t("imports.queueAria")}>
          <p className="pane-title">{t("imports.queueTitle")}</p>
          <div className="status-strip" aria-label={t("imports.statusFiltersAria")}>
            {importCandidateStatusFilters.map(({ status }) => (
              <button
                className={status === activeStatus ? "status-chip active" : "status-chip"}
                key={status}
                type="button"
                onClick={() => setActiveStatus(status)}
              >
                {statusText(status, t)} <strong aria-hidden="true">{candidatesByStatus[status].length}</strong>
              </button>
            ))}
          </div>
          {queueHasError ? <p className="queue-error-text">候选加载失败，请稍后重试。</p> : null}
          {queueReady ? (
            <div className="queue-groups">
              {importCandidateStatusFilters.map(({ status }) => (
                <CandidateGroup
                  activeStatus={activeStatus}
                  candidates={candidatesByStatus[status]}
                  key={status}
                  selectedCandidateId={selectedCandidateId}
                  status={status}
                  t={t}
                  onSelect={setSelectedCandidateId}
                />
              ))}
            </div>
          ) : (
            <p className="queue-empty-text">{t("imports.loadingCandidates")}</p>
          )}
        </aside>

        <section className="detail-pane" aria-label={t("imports.detailAria")}>
          <CandidateEditor
            candidate={selectedDetail}
            isBusy={isBusy}
            onApprove={async (candidateId) => {
              await approveCandidate(candidateId);
            }}
            onHold={async (candidateId) => {
              await holdCandidate(candidateId);
            }}
            onRejectDelete={async (candidateId) => {
              await rejectDeleteCandidate(candidateId);
            }}
            onResolveConflict={async (candidateId, input) => {
              await resolveConflict(candidateId, input);
            }}
            onSaveMetadata={async (candidateId, input) => {
              await saveMetadata(candidateId, input);
            }}
          />
        </section>
      </section>
    </main>
  );
}

function CandidateGroup({
  status,
  candidates,
  selectedCandidateId,
  activeStatus,
  t,
  onSelect
}: {
  status: ImportCandidateStatus;
  candidates: ImportCandidate[];
  selectedCandidateId: string | null;
  activeStatus: ImportCandidateStatus;
  t: ReturnType<typeof useI18n>["t"];
  onSelect: (candidateId: string) => void;
}) {
  const isActive = status === activeStatus;
  const label = statusText(status, t);

  return (
    <section className={isActive ? "queue-group active" : "queue-group"} aria-label={t("imports.groupAria", { status: label })}>
      <h2>{label}</h2>
      {candidates.length === 0 ? (
        <p className="queue-empty-text">{t("imports.noCandidates")}</p>
      ) : (
        <div className="candidate-list">
          {candidates.map((candidate) => (
            <button
              className={candidate.id === selectedCandidateId ? "candidate-row selected" : "candidate-row"}
              key={candidate.id}
              type="button"
              onClick={() => onSelect(candidate.id)}
            >
              <span className="candidate-main">
                <strong>
                  {candidate.artistName} - {candidate.title}
                </strong>
                <small>
                  {candidate.files.length} {t("imports.files")} · {probeSummary(candidate, t)} · {durationSummary(candidate, t)}
                </small>
              </span>
              <span className={`status-dot ${candidate.status}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function probeSummary(candidate: ImportCandidate, t: ReturnType<typeof useI18n>["t"]): string {
  const statuses = new Set(candidate.files.map((file) => file.probeStatus));
  if (statuses.size === 0) {
    return t("imports.noProbe");
  }
  return Array.from(statuses).join("/");
}

function durationSummary(candidate: ImportCandidate, t: ReturnType<typeof useI18n>["t"]): string {
  const durations = candidate.files.map((file) => file.durationMs ?? file.probeDurationMs).filter((value): value is number => value !== null);
  if (durations.length === 0) {
    return t("common.unknown");
  }
  return formatDuration(Math.min(...durations));
}

function formatDuration(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  const milliseconds = durationMs % 1_000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}
