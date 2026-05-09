import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchAdmin } from "../api/client.js";
import type {
  ConflictResolution,
  ImportCandidate,
  ImportCandidateDetailResponse,
  ImportCandidateListResponse,
  ImportCandidateStatus,
  MetadataUpdateInput
} from "./types.js";

export const importCandidateStatusFilters: Array<{ status: ImportCandidateStatus }> = [
  { status: "pending" },
  { status: "held" },
  { status: "review_required" },
  { status: "conflict" }
];

interface UseImportWorkbenchRuntimeResult {
  activeStatus: ImportCandidateStatus;
  setActiveStatus: (status: ImportCandidateStatus) => void;
  selectedCandidateId: string | null;
  setSelectedCandidateId: (candidateId: string) => void;
  candidatesByStatus: Record<ImportCandidateStatus, ImportCandidate[]>;
  queueReady: boolean;
  queueHasError: boolean;
  selectedCandidate: ImportCandidate | null;
  selectedDetail: ImportCandidate | null;
  isScanning: boolean;
  scanImports: () => Promise<void>;
  saveMetadata: (candidateId: string, input: MetadataUpdateInput) => Promise<void>;
  holdCandidate: (candidateId: string) => Promise<void>;
  approveCandidate: (candidateId: string) => Promise<void>;
  rejectDeleteCandidate: (candidateId: string) => Promise<void>;
  resolveConflict: (candidateId: string, input: ConflictResolution) => Promise<void>;
  isBusy: boolean;
}

export function useImportWorkbenchRuntime(): UseImportWorkbenchRuntimeResult {
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState<ImportCandidateStatus>("pending");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const queueQueries = useQueries({
    queries: importCandidateStatusFilters.map(({ status }) => ({
      queryKey: ["import-candidates", status],
      queryFn: async () =>
        (await fetchAdmin<ImportCandidateListResponse>(`/admin/import-candidates?status=${status}`)).candidates,
      retry: false
    }))
  });

  const candidatesByStatus = useMemo(() => {
    return importCandidateStatusFilters.reduce<Record<ImportCandidateStatus, ImportCandidate[]>>(
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
    () =>
      importCandidateStatusFilters
        .flatMap(({ status }) => candidatesByStatus[status])
        .find((candidate) => candidate.id === selectedCandidateId) ?? null,
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
    queryFn: async () => {
      if (!selectedCandidateId) {
        throw new Error("No selected import candidate");
      }
      return (await fetchAdmin<ImportCandidateDetailResponse>(`/admin/import-candidates/${selectedCandidateId}`)).candidate;
    },
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

  return {
    activeStatus,
    setActiveStatus,
    selectedCandidateId,
    setSelectedCandidateId,
    candidatesByStatus,
    queueReady,
    queueHasError,
    selectedCandidate,
    selectedDetail,
    isScanning: scanMutation.isPending,
    scanImports: async () => {
      await scanMutation.mutateAsync();
    },
    saveMetadata: async (candidateId, input) => {
      await saveMutation.mutateAsync({ candidateId, input });
    },
    holdCandidate: async (candidateId) => {
      await holdMutation.mutateAsync(candidateId);
    },
    approveCandidate: async (candidateId) => {
      await approveMutation.mutateAsync(candidateId);
    },
    rejectDeleteCandidate: async (candidateId) => {
      await rejectDeleteMutation.mutateAsync(candidateId);
    },
    resolveConflict: async (candidateId, input) => {
      await resolveConflictMutation.mutateAsync({ candidateId, input });
    },
    isBusy
  };
}

async function invalidateQueues(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all(
    importCandidateStatusFilters.map(({ status }) => queryClient.invalidateQueries({ queryKey: ["import-candidates", status] }))
  );
}

function cacheCandidate(queryClient: ReturnType<typeof useQueryClient>, candidate: ImportCandidate | null) {
  if (!candidate) {
    return;
  }

  queryClient.setQueryData(["import-candidate", candidate.id], candidate);
  for (const { status } of importCandidateStatusFilters) {
    queryClient.setQueryData<ImportCandidate[] | undefined>(["import-candidates", status], (current) =>
      current?.map((item) => (item.id === candidate.id ? candidate : item))
    );
  }
}
