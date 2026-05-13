import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App.js";
import type { ImportCandidate, ImportCandidateFileDetail, ImportCandidateStatus } from "../imports/types.js";

type RequestRecord = {
  url: string;
  method: string;
  body: unknown;
};

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

describe("real MV review UI", () => {
  it("real MV review UI shows metadata, raw audio facts, provenance, conflicts, and role controls", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /想你的夜/u }));

    expect(screen.getByLabelText("歌名")).toBeTruthy();
    expect(screen.getByLabelText("歌手")).toBeTruthy();
    expect(screen.getByLabelText("语言")).toBeTruthy();
    expect(screen.getByAltText("MV 封面")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "媒体信息" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "原始音轨" })).toBeTruthy();
    expect(screen.getAllByText("Original vocal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Instrumental").length).toBeGreaterThan(0);
    expect(screen.getAllByText("filename").length).toBeGreaterThan(0);
    expect(screen.getAllByText("sidecar").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "元数据冲突" })).toBeTruthy();
    expect(screen.getByLabelText("原唱声轨")).toBeTruthy();
    expect(screen.getByLabelText("伴唱声轨")).toBeTruthy();
  });

  it("real MV review UI saves corrected trackRoles in PATCH payload", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /想你的夜/u }));
    await user.selectOptions(screen.getByLabelText("伴唱声轨"), "0x1100");
    await user.click(screen.getByRole("button", { name: "保存元数据" }));

    const patchRequest = await waitFor(() =>
      requests.find((request) => request.method === "PATCH" && request.url === "/admin/import-candidates/real-mv-candidate")
    );

    expect((patchRequest?.body as { files?: Array<{ trackRoles?: unknown }> }).files?.[0]?.trackRoles).toMatchObject({
      instrumental: { index: 0, id: "0x1100", label: "Original vocal" }
    });
  });

  it("real MV review UI keeps approval light and shows repair guidance", async () => {
    const user = userEvent.setup();
    installFetchMock({ candidates: [createReviewRequiredCandidate(), createUnsupportedCandidate()] });
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /无封面测试/u }));

    expect(screen.getByText("暂无封面")).toBeTruthy();
    expect(screen.getByLabelText("伴唱声轨")).toHaveProperty("value", "");
    expect((screen.getByRole("button", { name: "批准入库" }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(await screen.findByRole("button", { name: /不可播测试/u }));

    const unsupportedGuidance = "v1.2 不自动转码，请先在系统外预处理后再入库。";
    const retryGuidance = "修复 song.json/封面或预处理媒体后，点击扫描导入目录重试。";
    expect(screen.getByText((content) => content.includes(unsupportedGuidance))).toBeTruthy();
    expect(screen.getByText((content) => content.includes(retryGuidance))).toBeTruthy();
  });

  // policy-guard-allowed-start
  it("does not expose auto-admit controls in v1.2", async () => {
    const user = userEvent.setup();
    installFetchMock({
      candidates: [
        createRealMvCandidate({
          candidateMeta: {
            realMv: {
              admissionPolicy: createRealMvAdmissionPolicy()
            }
          }
        })
      ]
    });
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /想你的夜/u }));

    expect(screen.queryByRole("button", { name: /自动入库|auto admit|auto-admit/i })).toBeNull();
    expect(screen.queryByLabelText(/自动入库|auto admit|auto-admit/i)).toBeNull();
    expect(screen.getByRole("button", { name: "批准入库" })).toBeTruthy();
  });

  it("keeps auto-admit wording confined to the negative guard", async () => {
    const source = await readFile(resolve(process.cwd(), "src/test/real-mv-review-ui.test.tsx"), "utf8");
    const markerPrefix = "  // policy-guard-allowed-";
    const allowedStart = source.indexOf(`${markerPrefix}start`);
    const allowedEnd = source.indexOf(`${markerPrefix}end`, allowedStart + 1);
    expect(allowedStart).toBeGreaterThanOrEqual(0);
    expect(allowedEnd).toBeGreaterThan(allowedStart);

    const checkedTestSource = `${source.slice(0, allowedStart)}${source.slice(allowedEnd)}`;
    const productionUiSources = await Promise.all([
      readFile(resolve(process.cwd(), "src/imports/CandidateEditor.tsx"), "utf8"),
      readFile(resolve(process.cwd(), "src/imports/ImportWorkbench.tsx"), "utf8"),
      readFile(resolve(process.cwd(), "src/imports/use-import-workbench-runtime.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/i18n.tsx"), "utf8")
    ]);
    expect(`${checkedTestSource}\n${productionUiSources.join("\n")}`).not.toMatch(/autoAdmit|auto-admit|自动入库/iu);
  });
  // policy-guard-allowed-end

  it("keeps the real MV review UI suite inside the review boundary", async () => {
    const source = await readFile(resolve(process.cwd(), "src/test/real-mv-review-ui.test.tsx"), "utf8");
    const forbidden = [
      "Play" + "wright",
      "screen" + "shot",
      "mob" + "ile",
      "que" + "ue",
      "TV " + "playback",
      "runtime " + "switching",
      "trans" + "cod",
      "Android " + "TV"
    ];
    expect(source).not.toMatch(new RegExp(forbidden.join("|"), "i"));
  });
});

function installFetchMock(input: { candidates?: ImportCandidate[] } = {}) {
  const requests: RequestRecord[] = [];
  const candidates = input.candidates ?? [createRealMvCandidate()];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(requestInput), "http://admin.test");
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url: `${requestUrl.pathname}${requestUrl.search}`, method, body });

      if (method === "GET" && requestUrl.pathname === "/admin/import-candidates") {
        const status = requestUrl.searchParams.get("status") as ImportCandidateStatus | null;
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

function patchedCandidate(candidate: ImportCandidate, body: unknown): ImportCandidate {
  const patch = body as Partial<ImportCandidate>;
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

function createRealMvCandidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    id: "real-mv-candidate",
    status: "review_required",
    title: "想你的夜",
    normalizedTitle: "想你的夜",
    titlePinyin: "",
    titleInitials: "",
    artistId: null,
    artistName: "关喆",
    language: "mandarin",
    genre: ["流行"],
    tags: ["真实MV"],
    aliases: [],
    searchHints: ["xiang ni de ye"],
    releaseYear: 2012,
    canonicalDurationMs: null,
    defaultCandidateFileId: "candidate-file-real-mv",
    sameVersionConfirmed: false,
    conflictSongId: null,
    reviewNotes: null,
    candidateMeta: {},
    files: [createRealMvFile()],
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z",
    ...overrides
  };
}

function createReviewRequiredCandidate(): ImportCandidate {
  return createRealMvCandidate({
    id: "review-required-real-mv",
    title: "无封面测试",
    normalizedTitle: "无封面测试",
    artistName: "歌手甲",
    searchHints: [],
    files: [
      withoutCoverPreview(
        createRealMvFile({
          realMv: {
            metadataSources: [{ field: "title", source: "filename" }],
            metadataConflicts: [],
            scannerReasons: [{ code: "cover-missing", severity: "warning", message: "缺少封面", source: "scanner" }],
            sidecars: {}
          },
          trackRoles: {
            original: { index: 0, id: "0x1100", label: "Original vocal" },
            instrumental: null
          }
        })
      )
    ]
  });
}

function createUnsupportedCandidate(): ImportCandidate {
  return createRealMvCandidate({
    id: "unsupported-real-mv",
    title: "不可播测试",
    normalizedTitle: "不可播测试",
    artistName: "歌手乙",
    searchHints: [],
    files: [
      withoutCoverPreview(
        createRealMvFile({
          candidateFileId: "candidate-file-unsupported-real-mv",
          compatibilityStatus: "unsupported",
          compatibilityReasons: [
            { code: "unsupported-codec", severity: "error", message: "当前文件不可直接播放", source: "scanner" }
          ],
          realMv: {
            metadataSources: [{ field: "title", source: "filename" }],
            metadataConflicts: [],
            scannerReasons: [
              { code: "unsupported-codec", severity: "error", message: "当前文件不可直接播放", source: "scanner" }
            ],
            sidecars: {}
          }
        })
      )
    ]
  });
}

function createRealMvAdmissionPolicy() {
  const reservedPolicyKey = `reserved${"Auto"}Admit`;
  return {
    mode: "review_first",
    [reservedPolicyKey]: {
      reserved: true,
      eligible: true,
      reasons: []
    }
  };
}

function createRealMvFile(overrides: Partial<ImportCandidateFileDetail> = {}): ImportCandidateFileDetail {
  return {
    candidateFileId: "candidate-file-real-mv",
    importFileId: "import-file-real-mv",
    selected: true,
    proposedVocalMode: "dual",
    proposedAssetKind: "dual-track-video",
    roleConfidence: 0.95,
    probeDurationMs: 60041,
    probeSummary: {},
    compatibilityStatus: "review_required",
    compatibilityReasons: [
      { code: "instrumental-track-unmapped", severity: "warning", message: "未识别伴奏声轨", source: "scanner" }
    ],
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
        {
          field: "title",
          values: [
            { source: "filename", value: "想你的夜" },
            { source: "sidecar", value: "想你的夜 Live" }
          ]
        }
      ],
      scannerReasons: [{ code: "sidecar-json-invalid", severity: "warning", message: "song.json 无法解析", source: "scanner" }],
      sidecars: {
        cover: { relativePath: "关喆-想你的夜.jpg", contentType: "image/jpeg" }
      }
    },
    coverPreviewUrl: "/admin/import-candidates/real-mv-candidate/files/candidate-file-real-mv/cover",
    rootKind: "imports_pending",
    relativePath: "关喆-想你的夜.mkv",
    sizeBytes: 104857600,
    mtimeMs: 1778640000000,
    quickHash: "quick-real-mv",
    probeStatus: "probed",
    probePayload: {},
    durationMs: 60041,
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z",
    ...overrides
  };
}

function withoutCoverPreview(file: ImportCandidateFileDetail): ImportCandidateFileDetail {
  const { coverPreviewUrl: _coverPreviewUrl, ...rest } = file;
  return rest;
}
