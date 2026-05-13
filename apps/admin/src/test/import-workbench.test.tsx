import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  compatibilityStatus?: string;
  compatibilityReasons?: Array<Record<string, unknown>>;
  mediaInfoSummary?: {
    container: string | null;
    durationMs: number | null;
    videoCodec: string | null;
    resolution: { width: number; height: number } | null;
    fileSizeBytes: number;
    audioTracks: Array<Record<string, unknown>>;
  } | null;
  mediaInfoProvenance?: Record<string, unknown> | null;
  trackRoles?: Record<string, unknown>;
  playbackProfile?: Record<string, unknown>;
  realMv?: {
    metadataSources?: Array<Record<string, unknown>>;
    metadataConflicts?: Array<Record<string, unknown>>;
    scannerReasons?: Array<Record<string, unknown>>;
    sidecars?: Record<string, unknown>;
  };
  coverPreviewUrl?: string;
}

const languageStorageKey = "home_ktv_language_v2";

beforeEach(() => {
  try {
    localStorage.removeItem(languageStorageKey);
  } catch {}
});

afterEach(() => {
  cleanup();
  try {
    localStorage.removeItem?.(languageStorageKey);
  } catch {}
  vi.unstubAllGlobals();
});

describe("import review workbench", () => {
  it("declares the DOM test stack and opens directly to the import workbench", async () => {
    installFetchMock();
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

    expect(packageJson.scripts?.build).toContain("vite build");
    expect(packageJson.dependencies?.react).toBe("19.2.5");
    expect(packageJson.dependencies?.["react-dom"]).toBe("19.2.5");
    expect(packageJson.dependencies?.["@tanstack/react-query"]).toBe("5.100.6");
    expect(packageJson.devDependencies?.["@testing-library/react"]).toBeDefined();
    expect(packageJson.devDependencies?.["happy-dom"]).toBeDefined();
    expect(viteConfig).toContain('environment: "happy-dom"');

    render(<App />);

    expect(await screen.findByRole("heading", { name: "导入审核工作台" })).toBeTruthy();
    expect(screen.queryByText(/landing page|marketing/i)).toBeNull();
  });

  it("renders candidate groups by song-level status with file count and probe indicators", async () => {
    installFetchMock();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "待处理" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "已暂存" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "需复核" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "冲突" })).toBeTruthy();

    const candidate = screen.getByRole("button", { name: /七里香.+2 个文件.+probed.+03:00/u });
    expect(candidate).toBeTruthy();
  });

  it("disables scan imports while pending and shows queue load errors", async () => {
    const user = userEvent.setup();
    const scanResponse = deferred<Response>();
    installFetchMock({ scanResponse });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "导入审核工作台" })).toBeTruthy();
    const scanButton = screen.getByRole("button", { name: "扫描导入目录" }) as HTMLButtonElement;
    await user.click(scanButton);

    const pendingButton = await screen.findByRole("button", { name: "扫描中..." });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);

    scanResponse.resolve(json({ accepted: true, scope: "imports" }, 202));
    await waitFor(() => expect((screen.getByRole("button", { name: "扫描导入目录" }) as HTMLButtonElement).disabled).toBe(false));

    cleanup();
    installFetchMock({ candidateListStatus: 500 });
    render(<App />);

    expect(await screen.findByText("候选加载失败，请稍后重试。")).toBeTruthy();
  });

  it("expanding a candidate shows original files, proposed roles, root kind, path, probe status, and duration", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /七里香/u }));
    await user.click(screen.getByRole("button", { name: "文件详情" }));

    expect(screen.getByText("original.mp4")).toBeTruthy();
    expect(screen.getByText("instrumental.mp4")).toBeTruthy();
    expect(screen.getByText("original")).toBeTruthy();
    expect(screen.getByText("instrumental")).toBeTruthy();
    expect(screen.getAllByText("imports_pending").length).toBeGreaterThan(0);
    expect(screen.getByText("周杰伦/七里香/original.mp4")).toBeTruthy();
    expect(screen.getAllByText("probed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("03:00.000").length).toBeGreaterThan(0);
  });

  it("renders real MV cover, media facts, provenance, and review warnings", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /想你的夜/u }));

    const cover = await screen.findByAltText("MV 封面");
    expect(cover.getAttribute("src")).toBe("/admin/import-candidates/real-mv-candidate/files/candidate-file-real-mv/cover");
    expect(screen.getByRole("heading", { name: "媒体信息" })).toBeTruthy();
    expect(screen.getByText("matroska,webm")).toBeTruthy();
    expect(screen.getByText("1920 x 1080")).toBeTruthy();
    expect(screen.getByText("2 条音轨")).toBeTruthy();
    expect(screen.getByText("来源")).toBeTruthy();
    expect(screen.getByText("filename")).toBeTruthy();
    expect(screen.getAllByText("需要确认").length).toBeGreaterThan(0);
    expect(screen.getByText("sidecar-json-invalid")).toBeTruthy();
    expect(screen.getByText("原始音轨")).toBeTruthy();
    expect(screen.getByText("#0")).toBeTruthy();
    expect(screen.getAllByText("Original vocal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("aac").length).toBeGreaterThan(0);
    expect(screen.getAllByText("zh").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getByText("元数据冲突")).toBeTruthy();
    expect(screen.getByText("filename: 想你的夜")).toBeTruthy();
    expect(screen.getByText("sidecar: 想你的夜 Live")).toBeTruthy();
    expect(screen.getByText("歌名和歌手完整后可入库为需复核。")).toBeTruthy();
  });

  it("saves reviewed real MV original and accompaniment track roles", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /想你的夜/u }));

    const originalTrack = await screen.findByLabelText("原唱声轨");
    const instrumentalTrack = screen.getByLabelText("伴唱声轨");
    expect(originalTrack).toHaveProperty("value", "0x1100");
    expect(instrumentalTrack).toHaveProperty("value", "0x1101");

    expect(screen.getAllByText(/#0 Original vocal aac/u).length).toBeGreaterThan(0);
    await user.selectOptions(instrumentalTrack, "0x1100");
    await user.click(screen.getByRole("button", { name: "保存元数据" }));

    const patchRequest = await waitFor(() =>
      requests.find((request) => request.method === "PATCH" && request.url === "/admin/import-candidates/real-mv-candidate")
    );

    expect(patchRequest?.body).toEqual(
      expect.objectContaining({
        files: [
          {
            candidateFileId: "candidate-file-real-mv",
            selected: true,
            proposedVocalMode: "dual",
            proposedAssetKind: "dual-track-video",
            trackRoles: {
              original: { index: 0, id: "0x1100", label: "Original vocal" },
              instrumental: { index: 0, id: "0x1100", label: "Original vocal" }
            }
          }
        ]
      })
    );
  });

  it("only disables approval when title or artist is blank", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /想你的夜/u }));

    const approveButton = screen.getByRole("button", { name: "批准入库" }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(false);

    await user.clear(screen.getByLabelText("歌名"));
    expect(approveButton.disabled).toBe(true);
    expect(screen.getByText("批准入库前必须填写歌名和歌手。")).toBeTruthy();

    await user.type(screen.getByLabelText("歌名"), "想你的夜");
    expect(approveButton.disabled).toBe(false);

    await user.clear(screen.getByLabelText("歌手"));
    expect(approveButton.disabled).toBe(true);
  });

  it("sends the canonical PATCH /admin/import-candidates/:candidateId metadata update request", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /七里香/u }));
    await user.clear(screen.getByLabelText("歌名"));
    await user.type(screen.getByLabelText("歌名"), "七里香 Live");
    await user.clear(screen.getByLabelText("歌手"));
    await user.type(screen.getByLabelText("歌手"), "周杰伦 & Lara");
    await user.selectOptions(screen.getByLabelText("语言"), "cantonese");
    await user.selectOptions(screen.getByLabelText("默认声轨"), "instrumental");
    await user.clear(screen.getByLabelText("流派"));
    await user.type(screen.getByLabelText("流派"), "pop, live");
    await user.clear(screen.getByLabelText("标签"));
    await user.type(screen.getByLabelText("标签"), "duet, family");
    await user.clear(screen.getByLabelText("年份"));
    await user.type(screen.getByLabelText("年份"), "2005");
    await user.clear(screen.getByLabelText("别名"));
    await user.type(screen.getByLabelText("别名"), "Qi Li Xiang, Orange Jasmine");
    await user.clear(screen.getByLabelText("搜索提示"));
    await user.type(screen.getByLabelText("搜索提示"), "qlx, jay");
    await user.click(screen.getByLabelText("已确认同版本证据"));
    await user.selectOptions(screen.getByLabelText("original.mp4 的声轨角色"), "original");
    await user.selectOptions(screen.getByLabelText("instrumental.mp4 的声轨角色"), "instrumental");
    await user.click(screen.getByRole("button", { name: "保存元数据" }));

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
          proposedAssetKind: "video",
          trackRoles: { original: null, instrumental: null }
        },
        {
          candidateFileId: "candidate-file-instrumental",
          selected: true,
          proposedVocalMode: "instrumental",
          proposedAssetKind: "video",
          trackRoles: { original: null, instrumental: null }
        }
      ]
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("calls hold, confirmed approve, and confirmed reject-delete endpoints", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /七里香/u }));
    await user.click(screen.getByRole("button", { name: "暂存" }));
    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/import-candidates/candidate-1/hold")).toBe(true);

    await user.click(screen.getByRole("button", { name: "批准入库" }));
    expect(screen.getByRole("dialog", { name: "确认批准入库" })).toBeTruthy();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "批准入库" }));
    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/import-candidates/candidate-1/approve")).toBe(true);

    await user.click(screen.getByRole("button", { name: "拒绝并删除" }));
    expect(screen.getByRole("dialog", { name: "确认拒绝并删除" })).toBeTruthy();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "拒绝并删除" }));

    const deleteRequest = requests.find(
      (request) => request.method === "POST" && request.url === "/admin/import-candidates/candidate-1/reject-delete"
    );
    expect(deleteRequest?.body).toEqual({ confirmDelete: true });
  });

  it("shows conflict metadata and posts merge-existing or create-version resolve-conflict requests", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "冲突" }));
    await user.click(await screen.findByRole("button", { name: /晴天/u }));

    expect(screen.getByText("formal_directory_exists")).toBeTruthy();
    expect(screen.getByText("mandarin/周杰伦/晴天")).toBeTruthy();
    expect(screen.getByText("song-existing-1")).toBeTruthy();

    await user.clear(screen.getByLabelText("目标歌曲 ID"));
    await user.type(screen.getByLabelText("目标歌曲 ID"), "song-existing-1");
    await user.click(screen.getByRole("button", { name: "合并到现有歌曲" }));

    await user.clear(screen.getByLabelText("版本后缀"));
    await user.type(screen.getByLabelText("版本后缀"), "live-2004");
    await user.click(screen.getByRole("button", { name: "创建新版本" }));

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

function installFetchMock(options: { scanResponse?: { promise: Promise<Response> }; candidateListStatus?: number } = {}) {
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
        if (options.candidateListStatus && options.candidateListStatus >= 400) {
          return json({ error: "IMPORT_CANDIDATES_FAILED" }, options.candidateListStatus);
        }
        const status = requestUrl.searchParams.get("status") as CandidateStatus | null;
        return json({ candidates: candidates.filter((candidate) => !status || candidate.status === status) });
      }

      const detailMatch = requestUrl.pathname.match(/^\/admin\/import-candidates\/([^/]+)$/u);
      if (method === "GET" && detailMatch?.[1]) {
        return json({ candidate: candidates.find((candidate) => candidate.id === detailMatch[1]) });
      }

      if (method === "PATCH" && detailMatch?.[1]) {
        const candidate = candidates.find((item) => item.id === detailMatch[1]);
        return json({ candidate: candidate ? patchedCandidate(candidate, body) : null });
      }

      if (method === "POST" && requestUrl.pathname === "/admin/imports/scan") {
        if (options.scanResponse) {
          return options.scanResponse.promise;
        }
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

function patchedCandidate(candidate: TestCandidate, body: unknown): TestCandidate {
  const patch = body as Partial<TestCandidate>;
  const filePatches = Array.isArray(patch.files) ? patch.files : [];

  return {
    ...candidate,
    ...patch,
    files: candidate.files.map((file) => ({
      ...file,
      ...(filePatches.find((item) => item.candidateFileId === file.candidateFileId) ?? {})
    }))
  };
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
      id: "real-mv-candidate",
      status: "review_required",
      title: "想你的夜",
      artistName: "关喆",
      language: "mandarin",
      genre: ["流行"],
      tags: ["真实MV"],
      aliases: [],
      searchHints: ["xiang ni de ye"],
      releaseYear: 2012,
      sameVersionConfirmed: false,
      conflictSongId: null,
      candidateMeta: {},
      files: [
        {
          candidateFileId: "candidate-file-real-mv",
          importFileId: "import-file-real-mv",
          selected: true,
          proposedVocalMode: "dual",
          proposedAssetKind: "dual-track-video",
          roleConfidence: 0.95,
          probeDurationMs: 60041,
          probeSummary: {},
          rootKind: "imports_pending",
          relativePath: "关喆-想你的夜.mkv",
          probeStatus: "probed",
          durationMs: 60041,
          compatibilityStatus: "review_required",
          compatibilityReasons: [{ code: "instrumental-track-unmapped", severity: "warning", message: "未识别伴奏声轨", source: "scanner" }],
          mediaInfoSummary: {
            container: "matroska,webm",
            durationMs: 60041,
            videoCodec: "h264",
            resolution: { width: 1920, height: 1080 },
            fileSizeBytes: 104857600,
            audioTracks: [
              { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
              { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
            ]
          },
          mediaInfoProvenance: {
            source: "ffprobe",
            sourceVersion: "6.1",
            probedAt: "2026-05-12T00:00:00.000Z",
            importedFrom: "ffprobe-json"
          },
          trackRoles: {
            original: { index: 0, id: "0x1100", label: "Original vocal" },
            instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
          },
          playbackProfile: {
            kind: "single_file_audio_tracks",
            container: "matroska,webm",
            videoCodec: "h264",
            audioCodecs: ["aac"],
            requiresAudioTrackSelection: true
          },
          realMv: {
            metadataSources: [
              { field: "title", source: "filename" },
              { field: "artistName", source: "sidecar" }
            ],
            metadataConflicts: [
              { field: "title", values: [{ source: "filename", value: "想你的夜" }, { source: "sidecar", value: "想你的夜 Live" }] }
            ],
            scannerReasons: [{ code: "sidecar-json-invalid", severity: "warning", message: "song.json 无法解析", source: "scanner" }],
            sidecars: {
              cover: { relativePath: "关喆-想你的夜.jpg", contentType: "image/jpeg" }
            }
          },
          coverPreviewUrl: "/admin/import-candidates/real-mv-candidate/files/candidate-file-real-mv/cover"
        }
      ]
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
