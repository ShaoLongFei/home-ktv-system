import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useImportWorkbenchRuntime } from "../imports/use-import-workbench-runtime.js";
import type { ImportCandidate, ImportCandidateStatus, MetadataUpdateInput } from "../imports/types.js";

type RequestRecord = {
  url: string;
  method: string;
  body: unknown;
};

const candidateStatuses: ImportCandidateStatus[] = ["pending", "held", "review_required", "conflict"];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useImportWorkbenchRuntime", () => {
  it("loads all candidate queues and selects the first active candidate", async () => {
    const { requests } = installFetchMock();
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useImportWorkbenchRuntime(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.queueReady).toBe(true));

    expect(result.current.candidatesByStatus.pending).toHaveLength(1);
    expect(result.current.candidatesByStatus.held).toHaveLength(1);
    expect(result.current.candidatesByStatus.review_required).toHaveLength(1);
    expect(result.current.candidatesByStatus.conflict).toHaveLength(1);
    expect(result.current.selectedCandidateId).toBe("candidate-1");
    expect(result.current.selectedCandidate?.id).toBe("candidate-1");
    expect(result.current.selectedDetail?.files).toHaveLength(2);
    expect(candidateStatuses.every((status) => requests.some((request) => request.url === `/admin/import-candidates?status=${status}`))).toBe(
      true
    );
  });

  it("scans imports and refreshes candidate queues after success", async () => {
    const scanResponse = deferred<Response>();
    const { requests } = installFetchMock({ scanResponse });
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useImportWorkbenchRuntime(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.queueReady).toBe(true));

    let scanPromise!: Promise<void>;
    act(() => {
      scanPromise = result.current.scanImports();
    });

    await waitFor(() => expect(result.current.isScanning).toBe(true));
    scanResponse.resolve(json({ accepted: true, scope: "imports" }, 202));
    await act(async () => {
      await scanPromise;
    });

    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.url === "/admin/imports/scan" &&
          JSON.stringify(request.body) === JSON.stringify({ scope: "imports" })
      )
    ).toBe(true);
    await waitFor(() =>
      expect(candidateStatuses.every((status) => requests.filter((request) => request.url === `/admin/import-candidates?status=${status}`).length > 1)).toBe(
        true
      )
    );
    expect(result.current.isScanning).toBe(false);
  });

  it("saves metadata and updates detail and queue caches for the selected candidate", async () => {
    const { requests } = installFetchMock();
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useImportWorkbenchRuntime(), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(result.current.selectedDetail?.id).toBe("candidate-1"));

    const input: MetadataUpdateInput = {
      title: "七里香 Live",
      artistName: "周杰伦 & Lara",
      language: "cantonese",
      defaultVocalMode: "instrumental",
      sameVersionConfirmed: true,
      genre: ["pop", "live"],
      tags: ["duet"],
      releaseYear: 2005,
      aliases: ["Qi Li Xiang"],
      searchHints: ["qlx"],
      files: [
        {
          candidateFileId: "candidate-file-original",
          selected: true,
          proposedVocalMode: "original",
          proposedAssetKind: "video"
        },
        {
          candidateFileId: "candidate-file-instrumental",
          selected: true,
          proposedVocalMode: "instrumental",
          proposedAssetKind: "video"
        }
      ]
    };

    await act(async () => {
      await result.current.saveMetadata("candidate-1", input);
    });

    const patchRequest = requests.find((request) => request.method === "PATCH" && request.url === "/admin/import-candidates/candidate-1");
    expect(patchRequest?.body).toEqual(input);
    await waitFor(() => expect(result.current.selectedDetail?.title).toBe("七里香 Live"));
    expect(result.current.candidatesByStatus.pending[0]?.title).toBe("七里香 Live");
    expect(result.current.selectedCandidate?.artistName).toBe("周杰伦 & Lara");
    expect(result.current.selectedCandidateId).toBe("candidate-1");
  });
});

function createWrapper(queryClient: QueryClient) {
  return function TestQueryClientProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

function installFetchMock(options: { scanResponse?: { promise: Promise<Response> } } = {}) {
  const requests: RequestRecord[] = [];
  const candidates = createCandidates();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(input), "http://admin.test");
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url: `${requestUrl.pathname}${requestUrl.search}`, method, body });

      if (method === "GET" && requestUrl.pathname === "/admin/import-candidates") {
        const status = requestUrl.searchParams.get("status") as ImportCandidateStatus | null;
        return json({ candidates: candidates.filter((candidate) => !status || candidate.status === status) });
      }

      const detailMatch = requestUrl.pathname.match(/^\/admin\/import-candidates\/([^/]+)$/u);
      if (method === "GET" && detailMatch?.[1]) {
        return json({ candidate: candidates.find((candidate) => candidate.id === detailMatch[1]) ?? null });
      }

      if (method === "PATCH" && detailMatch?.[1]) {
        const candidateIndex = candidates.findIndex((candidate) => candidate.id === detailMatch[1]);
        const candidate = candidateIndex >= 0 ? patchedCandidate(candidates[candidateIndex], body) : null;
        if (candidate) {
          candidates[candidateIndex] = candidate;
        }
        return json({ candidate });
      }

      if (method === "POST" && requestUrl.pathname === "/admin/imports/scan") {
        if (options.scanResponse) {
          return options.scanResponse.promise;
        }
        return json({ accepted: true, scope: "imports" }, 202);
      }

      return json({ error: "UNHANDLED_TEST_ROUTE" }, 500);
    })
  );

  return { requests };
}

function patchedCandidate(candidate: ImportCandidate, body: unknown): ImportCandidate {
  const patch = body as Partial<MetadataUpdateInput>;
  const filePatches = Array.isArray(patch.files) ? patch.files : [];

  return {
    ...candidate,
    title: patch.title ?? candidate.title,
    artistName: patch.artistName ?? candidate.artistName,
    language: patch.language ?? candidate.language,
    genre: patch.genre ?? candidate.genre,
    tags: patch.tags ?? candidate.tags,
    aliases: patch.aliases ?? candidate.aliases,
    searchHints: patch.searchHints ?? candidate.searchHints,
    releaseYear: patch.releaseYear ?? candidate.releaseYear,
    sameVersionConfirmed: patch.sameVersionConfirmed ?? candidate.sameVersionConfirmed,
    files: candidate.files.map((file) => ({
      ...file,
      ...(filePatches.find((item) => item.candidateFileId === file.candidateFileId) ?? {})
    }))
  };
}

function createCandidates(): ImportCandidate[] {
  return [
    createCandidate({
      id: "candidate-1",
      status: "pending",
      title: "七里香",
      artistName: "周杰伦",
      files: [
        createCandidateFile("candidate-file-original", "周杰伦/七里香/original.mp4", "original", 180000),
        createCandidateFile("candidate-file-instrumental", "周杰伦/七里香/instrumental.mp4", "instrumental", 180200)
      ]
    }),
    createCandidate({ id: "held-candidate", status: "held", title: "小幸运", artistName: "田馥甄", files: [] }),
    createCandidate({ id: "review-candidate", status: "review_required", title: "后来", artistName: "刘若英", files: [] }),
    createCandidate({ id: "conflict-candidate", status: "conflict", title: "晴天", artistName: "周杰伦", files: [] })
  ];
}

function createCandidate(input: {
  id: string;
  status: ImportCandidateStatus;
  title: string;
  artistName: string;
  files: ImportCandidate["files"];
}): ImportCandidate {
  return {
    id: input.id,
    status: input.status,
    title: input.title,
    normalizedTitle: input.title,
    titlePinyin: "",
    titleInitials: "",
    artistId: null,
    artistName: input.artistName,
    language: "mandarin",
    genre: ["pop"],
    tags: ["ktv"],
    aliases: [],
    searchHints: [],
    releaseYear: 2004,
    canonicalDurationMs: null,
    defaultCandidateFileId: input.files[0]?.candidateFileId ?? null,
    sameVersionConfirmed: false,
    conflictSongId: null,
    reviewNotes: null,
    candidateMeta: {},
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    files: input.files
  };
}

function createCandidateFile(
  candidateFileId: string,
  relativePath: string,
  proposedVocalMode: ImportCandidate["files"][number]["proposedVocalMode"],
  durationMs: number
): ImportCandidate["files"][number] {
  return {
    candidateFileId,
    importFileId: `import-${candidateFileId}`,
    selected: true,
    proposedVocalMode,
    proposedAssetKind: "video",
    roleConfidence: 0.9,
    probeDurationMs: durationMs,
    probeSummary: { codec: "h264" },
    rootKind: "imports_pending",
    relativePath,
    sizeBytes: 1024,
    mtimeMs: 1778343726000,
    quickHash: null,
    probeStatus: "probed",
    probePayload: {},
    durationMs,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}
