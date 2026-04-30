import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App.js";

type RequestRecord = {
  url: string;
  method: string;
  body: unknown;
};

type CandidateStatus = "pending" | "held" | "review_required" | "conflict";

interface TestCandidate {
  id: string;
  status: CandidateStatus;
  title: string;
  artistName: string;
  language: "mandarin" | "cantonese" | "other";
  genre: string[];
  tags: string[];
  aliases: string[];
  searchHints: string[];
  releaseYear: number | null;
  sameVersionConfirmed: boolean;
  conflictSongId: string | null;
  candidateMeta: Record<string, unknown>;
  files: TestCandidateFile[];
}

interface TestCandidateFile {
  candidateFileId: string;
  importFileId: string;
  selected: boolean;
  proposedVocalMode: "original" | "instrumental" | "dual" | "unknown";
  proposedAssetKind: "video" | "audio+lyrics" | "dual-track-video";
  roleConfidence: number | null;
  probeDurationMs: number | null;
  probeSummary: Record<string, unknown>;
  rootKind: "imports_pending" | "imports_needs_review" | "songs";
  relativePath: string;
  probeStatus: "pending" | "probed" | "failed" | "skipped" | "deleted";
  durationMs: number | null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("import review workbench", () => {
  it("renders candidate groups by song-level status with file count and probe indicators", async () => {
    installFetchMock();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Pending" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Held" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Review required" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Conflict" })).toBeTruthy();

    const candidate = screen.getByRole("button", { name: /七里香.+2 files.+probed.+03:00/u });
    expect(candidate).toBeTruthy();
  });

  it("expanding a candidate shows original files, proposed roles, root kind, path, probe status, and duration", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /七里香/u }));
    await user.click(screen.getByRole("button", { name: /file details/i }));

    expect(screen.getByText("original.mp4")).toBeTruthy();
    expect(screen.getByText("instrumental.mp4")).toBeTruthy();
    expect(screen.getByText("original")).toBeTruthy();
    expect(screen.getByText("instrumental")).toBeTruthy();
    expect(screen.getAllByText("imports_pending").length).toBeGreaterThan(0);
    expect(screen.getByText("周杰伦/七里香/original.mp4")).toBeTruthy();
    expect(screen.getAllByText("probed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("03:00.000").length).toBeGreaterThan(0);
  });

  it("sends the canonical PATCH /admin/import-candidates/:candidateId metadata update request", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /七里香/u }));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "七里香 Live");
    await user.clear(screen.getByLabelText("Artist"));
    await user.type(screen.getByLabelText("Artist"), "周杰伦 & Lara");
    await user.selectOptions(screen.getByLabelText("Language"), "cantonese");
    await user.selectOptions(screen.getByLabelText("Default vocal mode"), "instrumental");
    await user.clear(screen.getByLabelText("Genre"));
    await user.type(screen.getByLabelText("Genre"), "pop, live");
    await user.clear(screen.getByLabelText("Tags"));
    await user.type(screen.getByLabelText("Tags"), "duet, family");
    await user.clear(screen.getByLabelText("Year"));
    await user.type(screen.getByLabelText("Year"), "2005");
    await user.clear(screen.getByLabelText("Aliases"));
    await user.type(screen.getByLabelText("Aliases"), "Qi Li Xiang, Orange Jasmine");
    await user.clear(screen.getByLabelText("Search hints"));
    await user.type(screen.getByLabelText("Search hints"), "qlx, jay");
    await user.click(screen.getByLabelText("Same version proof confirmed"));
    await user.selectOptions(screen.getByLabelText("Vocal role for original.mp4"), "original");
    await user.selectOptions(screen.getByLabelText("Vocal role for instrumental.mp4"), "instrumental");
    await user.click(screen.getByRole("button", { name: "Save metadata" }));

    const patchRequest = await waitFor(() =>
      requests.find((request) => request.method === "PATCH" && request.url === "/admin/import-candidates/candidate-1")
    );

    expect(patchRequest?.body).toEqual({
      title: "七里香 Live",
      artistName: "周杰伦 & Lara",
      language: "cantonese",
      defaultVocalMode: "instrumental",
      sameVersionConfirmed: true,
      genre: ["pop", "live"],
      tags: ["duet", "family"],
      releaseYear: 2005,
      aliases: ["Qi Li Xiang", "Orange Jasmine"],
      searchHints: ["qlx", "jay"],
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
    });
  });

  it("calls hold, confirmed approve, and confirmed reject-delete endpoints", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /七里香/u }));
    await user.click(screen.getByRole("button", { name: "Hold" }));
    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/import-candidates/candidate-1/hold")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("dialog", { name: "Confirm approve" })).toBeTruthy();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/import-candidates/candidate-1/approve")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Reject delete" }));
    expect(screen.getByRole("dialog", { name: "Confirm reject delete" })).toBeTruthy();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reject delete" }));

    const deleteRequest = requests.find(
      (request) => request.method === "POST" && request.url === "/admin/import-candidates/candidate-1/reject-delete"
    );
    expect(deleteRequest?.body).toEqual({ confirmDelete: true });
  });

  it("shows conflict metadata and posts merge-existing or create-version resolve-conflict requests", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Conflict" }));
    await user.click(await screen.findByRole("button", { name: /晴天/u }));

    expect(screen.getByText("formal_directory_exists")).toBeTruthy();
    expect(screen.getByText("mandarin/周杰伦/晴天")).toBeTruthy();
    expect(screen.getByText("song-existing-1")).toBeTruthy();

    await user.clear(screen.getByLabelText("Target song id"));
    await user.type(screen.getByLabelText("Target song id"), "song-existing-1");
    await user.click(screen.getByRole("button", { name: "Merge existing" }));

    await user.clear(screen.getByLabelText("Version suffix"));
    await user.type(screen.getByLabelText("Version suffix"), "live-2004");
    await user.click(screen.getByRole("button", { name: "Create version" }));

    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.url === "/admin/import-candidates/conflict-candidate/resolve-conflict" &&
          JSON.stringify(request.body) === JSON.stringify({ resolution: "merge_existing", targetSongId: "song-existing-1" })
      )
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.url === "/admin/import-candidates/conflict-candidate/resolve-conflict" &&
          JSON.stringify(request.body) === JSON.stringify({ resolution: "create_version", versionSuffix: "live-2004" })
      )
    ).toBe(true);
  });
});

function installFetchMock() {
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
        const status = requestUrl.searchParams.get("status") as CandidateStatus | null;
        return json({ candidates: candidates.filter((candidate) => !status || candidate.status === status) });
      }

      const detailMatch = requestUrl.pathname.match(/^\/admin\/import-candidates\/([^/]+)$/u);
      if (method === "GET" && detailMatch?.[1]) {
        return json({ candidate: candidates.find((candidate) => candidate.id === detailMatch[1]) });
      }

      if (method === "PATCH" && detailMatch?.[1]) {
        const candidate = candidates.find((item) => item.id === detailMatch[1]);
        return json({ candidate: candidate ? { ...candidate, ...(body as object) } : null });
      }

      if (method === "POST" && requestUrl.pathname === "/admin/imports/scan") {
        return json({ accepted: true, scope: "imports" }, 202);
      }

      const actionMatch = requestUrl.pathname.match(/^\/admin\/import-candidates\/([^/]+)\/([^/]+)$/u);
      if (method === "POST" && actionMatch?.[1]) {
        return json({ candidate: candidates.find((candidate) => candidate.id === actionMatch[1]) });
      }

      return json({ error: "UNHANDLED_TEST_ROUTE" }, 500);
    })
  );

  return { requests };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createCandidates(): TestCandidate[] {
  return [
    {
      id: "candidate-1",
      status: "pending",
      title: "七里香",
      artistName: "周杰伦",
      language: "mandarin",
      genre: ["pop"],
      tags: ["ktv"],
      aliases: ["Qi Li Xiang"],
      searchHints: ["qlx"],
      releaseYear: 2004,
      sameVersionConfirmed: false,
      conflictSongId: null,
      candidateMeta: { warning: "duration_delta_review" },
      files: [
        {
          candidateFileId: "candidate-file-original",
          importFileId: "import-file-original",
          selected: true,
          proposedVocalMode: "original",
          proposedAssetKind: "video",
          roleConfidence: 0.96,
          probeDurationMs: 180000,
          probeSummary: { codec: "h264" },
          rootKind: "imports_pending",
          relativePath: "周杰伦/七里香/original.mp4",
          probeStatus: "probed",
          durationMs: 180000
        },
        {
          candidateFileId: "candidate-file-instrumental",
          importFileId: "import-file-instrumental",
          selected: true,
          proposedVocalMode: "instrumental",
          proposedAssetKind: "video",
          roleConfidence: 0.93,
          probeDurationMs: 180200,
          probeSummary: { codec: "h264" },
          rootKind: "imports_pending",
          relativePath: "周杰伦/七里香/instrumental.mp4",
          probeStatus: "probed",
          durationMs: 180200
        }
      ]
    },
    {
      id: "held-candidate",
      status: "held",
      title: "小幸运",
      artistName: "田馥甄",
      language: "mandarin",
      genre: [],
      tags: [],
      aliases: [],
      searchHints: [],
      releaseYear: null,
      sameVersionConfirmed: false,
      conflictSongId: null,
      candidateMeta: {},
      files: []
    },
    {
      id: "review-candidate",
      status: "review_required",
      title: "后来",
      artistName: "刘若英",
      language: "mandarin",
      genre: [],
      tags: [],
      aliases: [],
      searchHints: [],
      releaseYear: null,
      sameVersionConfirmed: false,
      conflictSongId: null,
      candidateMeta: { warning: "same_version_unproven" },
      files: []
    },
    {
      id: "conflict-candidate",
      status: "conflict",
      title: "晴天",
      artistName: "周杰伦",
      language: "mandarin",
      genre: ["pop"],
      tags: [],
      aliases: [],
      searchHints: [],
      releaseYear: 2003,
      sameVersionConfirmed: true,
      conflictSongId: "song-existing-1",
      candidateMeta: {
        targetDirectory: "mandarin/周杰伦/晴天",
        conflictType: "formal_directory_exists",
        songId: "song-existing-1"
      },
      files: [
        {
          candidateFileId: "candidate-file-conflict",
          importFileId: "import-file-conflict",
          selected: true,
          proposedVocalMode: "instrumental",
          proposedAssetKind: "video",
          roleConfidence: 0.91,
          probeDurationMs: 210000,
          probeSummary: {},
          rootKind: "imports_pending",
          relativePath: "周杰伦/晴天/instrumental.mp4",
          probeStatus: "probed",
          durationMs: 210000
        }
      ]
    }
  ];
}
