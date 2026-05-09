import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchAdmin } from "../api/client.js";
import { statusText, useI18n } from "../i18n.js";
import { CandidateEditor } from "./CandidateEditor.js";
import type {
  ConflictResolution,
  ImportCandidate,
  ImportCandidateDetailResponse,
  ImportCandidateListResponse,
  ImportCandidateStatus,
  MetadataUpdateInput
} from "./types.js";

const STATUS_FILTERS: Array<{ status: ImportCandidateStatus }> = [
  { status: "pending" },
  { status: "held" },
  { status: "review_required" },
  { status: "conflict" }
];

export function ImportWorkbench() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState<ImportCandidateStatus>("pending");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const queueQueries = useQueries({
    queries: STATUS_FILTERS.map(({ status }) => ({
      queryKey: ["import-candidates", status],
      queryFn: async () =>
        (await fetchAdmin<ImportCandidateListResponse>(`/admin/import-candidates?status=${status}`)).candidates,
      retry: false
    }))
  });

  const candidatesByStatus = useMemo(() => {
    return STATUS_FILTERS.reduce<Record<ImportCandidateStatus, ImportCandidate[]>>(
      (groups, { status }, index) => ({
        ...groups,
        [status]: queueQueries[index]?.data ?? []
      }),
      { pending: [], held: [], review_required: [], conflict: [] }
    );
  }, [queueQueries]);

  const queueReady = queueQueries.every((query) => query.isSuccess || query.isError);
  const queueHasError = queueQueries.some((query) => query.isError);

  const selectedCandidate = useMemo(
    () => STATUS_FILTERS.flatMap(({ status }) => candidatesByStatus[status]).find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [candidatesByStatus, selectedCandidateId]
  );

  useEffect(() => {
    if (selectedCandidateId) {
      return;
    }

    const firstActiveCandidate = candidatesByStatus[activeStatus][0];
    if (firstActiveCandidate) {
      setSelectedCandidateId(firstActiveCandidate.id);
    }
  }, [activeStatus, candidatesByStatus, selectedCandidateId]);

  const detailQuery = useQuery({
    enabled: selectedCandidateId !== null,
    queryKey: ["import-candidate", selectedCandidateId],
    queryFn: async () =>
      (await fetchAdmin<ImportCandidateDetailResponse>(`/admin/import-candidates/${selectedCandidateId}`)).candidate,
    retry: false
  });

  const selectedDetail = detailQuery.data ?? selectedCandidate;

  const scanMutation = useMutation({
    mutationFn: async () =>
      fetchAdmin<{ accepted: boolean; scope: string }>("/admin/imports/scan", {
        method: "POST",
        body: JSON.stringify({ scope: "imports" })
      }),
    onSuccess: () => void invalidateQueues(queryClient)
  });

  const saveMutation = useMutation({
    mutationFn: async ({ candidateId, input }: { candidateId: string; input: MetadataUpdateInput }) =>
      // PATCH /admin/import-candidates/:candidateId is the canonical D-07 update route.
      fetchAdmin<ImportCandidateDetailResponse>(`/admin/import-candidates/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      }),
    onSuccess: (result) => {
      cacheCandidate(queryClient, result.candidate);
    }
  });

  const holdMutation = useMutation({
    mutationFn: async (candidateId: string) =>
      fetchAdmin<ImportCandidateDetailResponse>(`/admin/import-candidates/${candidateId}/hold`, { method: "POST" }),
    onSuccess: (result) => {
      cacheCandidate(queryClient, result.candidate);
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (candidateId: string) =>
      fetchAdmin<ImportCandidateDetailResponse>(`/admin/import-candidates/${candidateId}/approve`, { method: "POST" }),
    onSuccess: (result) => {
      cacheCandidate(queryClient, result.candidate);
    }
  });

  const rejectDeleteMutation = useMutation({
    mutationFn: async (candidateId: string) =>
      fetchAdmin<ImportCandidateDetailResponse>(`/admin/import-candidates/${candidateId}/reject-delete`, {
        method: "POST",
        body: JSON.stringify({ confirmDelete: true })
      }),
    onSuccess: (result) => {
      cacheCandidate(queryClient, result.candidate);
    }
  });

  const resolveConflictMutation = useMutation({
    mutationFn: async ({ candidateId, input }: { candidateId: string; input: ConflictResolution }) =>
      fetchAdmin<ImportCandidateDetailResponse>(`/admin/import-candidates/${candidateId}/resolve-conflict`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: (result) => {
      cacheCandidate(queryClient, result.candidate);
    }
  });

  const isBusy =
    saveMutation.isPending ||
    holdMutation.isPending ||
    approveMutation.isPending ||
    rejectDeleteMutation.isPending ||
    resolveConflictMutation.isPending;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>{t("imports.title")}</h1>
          <p>{t("imports.description")}</p>
        </div>
        <button className="primary-button" disabled={scanMutation.isPending} type="button" onClick={() => scanMutation.mutate()}>
          {scanMutation.isPending ? "扫描中..." : t("imports.scan")}
        </button>
      </header>

      <section className="admin-workbench" aria-label={t("imports.workbenchAria")}>
        <aside className="queue-pane" aria-label={t("imports.queueAria")}>
          <p className="pane-title">{t("imports.queueTitle")}</p>
          <div className="status-strip" aria-label={t("imports.statusFiltersAria")}>
            {STATUS_FILTERS.map(({ status }) => (
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
              {STATUS_FILTERS.map(({ status }) => (
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
              await approveMutation.mutateAsync(candidateId);
            }}
            onHold={async (candidateId) => {
              await holdMutation.mutateAsync(candidateId);
            }}
            onRejectDelete={async (candidateId) => {
              await rejectDeleteMutation.mutateAsync(candidateId);
            }}
            onResolveConflict={async (candidateId, input) => {
              await resolveConflictMutation.mutateAsync({ candidateId, input });
            }}
            onSaveMetadata={async (candidateId, input) => {
              await saveMutation.mutateAsync({ candidateId, input });
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

async function invalidateQueues(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all(
    STATUS_FILTERS.map(({ status }) => queryClient.invalidateQueries({ queryKey: ["import-candidates", status] }))
  );
}

function cacheCandidate(queryClient: ReturnType<typeof useQueryClient>, candidate: ImportCandidate | null) {
  if (!candidate) {
    return;
  }

  queryClient.setQueryData(["import-candidate", candidate.id], candidate);
  for (const { status } of STATUS_FILTERS) {
    queryClient.setQueryData<ImportCandidate[] | undefined>(["import-candidates", status], (current) =>
      current?.map((item) => (item.id === candidate.id ? candidate : item))
    );
  }
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
