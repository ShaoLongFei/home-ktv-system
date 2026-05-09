import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App.js";
import type { AdminCatalogAsset, AdminCatalogSong } from "../songs/types.js";

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

describe("song catalog maintenance", () => {
  it("defaults to Imports and switches to Songs without reloading", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "导入审核工作台" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "歌曲" }));

    expect(await screen.findByRole("heading", { name: "歌曲目录" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "导入" })).toBeTruthy();
  });

  it("renders formal songs with resource maintenance fields", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "歌曲" }));

    const row = await screen.findByRole("button", { name: /七里香.+国语.+已准备.+2 个资源/u });
    expect(row).toBeTruthy();
    expect(screen.getAllByText(/周杰伦/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/国语/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText("asset-instrumental").length).toBeGreaterThan(0);
    expect(screen.getAllByText("原唱").length).toBeGreaterThan(0);
    expect(screen.getAllByText("伴唱").length).toBeGreaterThan(0);
    expect(screen.getAllByText("hard_sub").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已准备").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("main").length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, element) => element?.textContent === "切换质量: verified").length).toBeGreaterThan(0);
  });

  it("filters song status through /admin/catalog/songs?status=...", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "歌曲" }));
    await screen.findByRole("heading", { name: "歌曲目录" });
    await user.selectOptions(screen.getByLabelText("歌曲状态"), "review_required");

    await waitFor(() => {
      expect(
        requests.some((request) => request.method === "GET" && request.url === "/admin/catalog/songs?status=review_required")
      ).toBe(true);
    });
  });

  it("edits formal song metadata and updates rendered detail after success", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "歌曲" }));
    await screen.findByRole("heading", { name: "歌曲目录" });
    await screen.findByRole("button", { name: /七里香/u });
    const detail = screen.getByRole("region", { name: "歌曲资源详情" });
    await user.clear(within(detail).getByLabelText("歌名"));
    await user.type(within(detail).getByLabelText("歌名"), "七里香 Live");
    await user.clear(within(detail).getByLabelText("歌手"));
    await user.type(within(detail).getByLabelText("歌手"), "周杰伦 & Lara");
    await user.selectOptions(within(detail).getByLabelText("语言"), "cantonese");
    await user.clear(within(detail).getByLabelText("流派"));
    await user.type(within(detail).getByLabelText("流派"), "pop, live");
    await user.clear(within(detail).getByLabelText("标签"));
    await user.type(within(detail).getByLabelText("标签"), "ktv, family");
    await user.clear(within(detail).getByLabelText("年份"));
    await user.type(within(detail).getByLabelText("年份"), "2005");
    await user.clear(within(detail).getByLabelText("别名"));
    await user.type(within(detail).getByLabelText("别名"), "Qi Li Xiang");
    await user.clear(within(detail).getByLabelText("搜索提示"));
    await user.type(within(detail).getByLabelText("搜索提示"), "qlx, jay");
    await user.selectOptions(within(detail).getByLabelText("目录状态"), "review_required");
    await user.click(screen.getByRole("button", { name: "保存歌曲元数据" }));

    await screen.findByRole("heading", { name: /周杰伦 & Lara - 七里香 Live/u });
    const patchRequest = requests.find((request) => request.method === "PATCH" && request.url === "/admin/catalog/songs/song-1");
    expect(patchRequest?.body).toMatchObject({
      title: "七里香 Live",
      artistName: "周杰伦 & Lara",
      language: "cantonese",
      genre: ["pop", "live"],
      tags: ["ktv", "family"],
      releaseYear: 2005,
      aliases: ["Qi Li Xiang"],
      searchHints: ["qlx", "jay"],
      status: "review_required"
    });
  });

  it("changes the default asset through the default-asset endpoint", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "歌曲" }));
    await screen.findByRole("heading", { name: "歌曲目录" });
    await screen.findByRole("button", { name: /七里香/u });
    await user.selectOptions(screen.getByLabelText("默认资源"), "asset-original");
    await user.click(screen.getByRole("button", { name: "设为默认资源" }));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === "PATCH" &&
            request.url === "/admin/catalog/songs/song-1/default-asset" &&
            JSON.stringify(request.body) === JSON.stringify({ assetId: "asset-original" })
        )
      ).toBe(true);
    });
  });

  it("disables catalog actions while default asset update is pending and shows load errors", async () => {
    const user = userEvent.setup();
    const defaultAssetResponse = deferred<Response>();
    installFetchMock({ defaultAssetResponse });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "歌曲" }));
    await screen.findByRole("heading", { name: "歌曲目录" });
    await screen.findByRole("button", { name: /七里香/u });
    await user.selectOptions(screen.getByLabelText("默认资源"), "asset-original");
    await user.click(screen.getByRole("button", { name: "设为默认资源" }));

    expect((screen.getByRole("button", { name: "设为默认资源" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "重新校验歌曲" }) as HTMLButtonElement).disabled).toBe(true);

    defaultAssetResponse.resolve(json({ song: createSongs()[0], evaluation: { status: "verified" } }));
    await waitFor(() => expect((screen.getByRole("button", { name: "设为默认资源" }) as HTMLButtonElement).disabled).toBe(false));

    cleanup();
    installFetchMock({ catalogStatus: 500 });
    render(<App />);
    await user.click(screen.getByRole("button", { name: "歌曲" }));

    expect(await screen.findByText("歌曲加载失败，请稍后重试。")).toBeTruthy();
  });

  it("confirms dangerous asset changes before sending the asset PATCH request", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "歌曲" }));
    await screen.findByRole("heading", { name: "歌曲目录" });
    await screen.findByRole("button", { name: /七里香/u });
    await user.selectOptions(screen.getByLabelText("asset-original 的状态"), "unavailable");
    await user.click(screen.getByRole("button", { name: "更新 asset-original" }));

    expect(requests.some((request) => request.method === "PATCH" && request.url === "/admin/catalog/assets/asset-original")).toBe(false);

    const dialog = screen.getByRole("dialog", { name: "确认修改目录资源" });
    await user.click(within(dialog).getByRole("button", { name: "应用修改" }));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === "PATCH" &&
            request.url === "/admin/catalog/assets/asset-original" &&
            JSON.stringify(request.body) === JSON.stringify({ status: "unavailable" })
        )
      ).toBe(true);
    });
  });

  it("shows revalidation and song.json validation review results without manual override controls", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "歌曲" }));
    await screen.findByRole("heading", { name: "歌曲目录" });
    await screen.findByRole("button", { name: /七里香/u });
    await user.click(screen.getByRole("button", { name: "重新校验歌曲" }));
    await user.click(screen.getByRole("button", { name: "校验 song.json" }));

    expect((await screen.findAllByText(/duration-delta-over-300ms/u)).length).toBeGreaterThan(0);
    expect(await screen.findByText("SWITCH_PAIR_NOT_VERIFIED")).toBeTruthy();
    expect(screen.queryByText(/force verified|manual override|manualOverride/i)).toBeNull();
  });
});

function installFetchMock(options: { defaultAssetResponse?: { promise: Promise<Response> }; catalogStatus?: number } = {}) {
  const requests: RequestRecord[] = [];
  const songs = createSongs();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(input), "http://admin.test");
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const url = `${requestUrl.pathname}${requestUrl.search}`;
      requests.push({ url, method, body });

      if (method === "GET" && requestUrl.pathname === "/admin/import-candidates") {
        return json({ candidates: [] });
      }

      if (method === "GET" && requestUrl.pathname === "/admin/catalog/songs") {
        if (options.catalogStatus && options.catalogStatus >= 400) {
          return json({ error: "CATALOG_SONGS_FAILED" }, options.catalogStatus);
        }
        const status = requestUrl.searchParams.get("status");
        return json({ songs: status ? songs.filter((song) => song.status === status) : songs });
      }

      const songMatch = requestUrl.pathname.match(/^\/admin\/catalog\/songs\/([^/]+)$/u);
      if (method === "PATCH" && songMatch?.[1]) {
        const song = findSong(songs, songMatch[1]);
        if (!song) {
          return json({ error: "FORMAL_SONG_NOT_FOUND" }, 404);
        }
        Object.assign(song, body);
        return json({ song });
      }

      const defaultAssetMatch = requestUrl.pathname.match(/^\/admin\/catalog\/songs\/([^/]+)\/default-asset$/u);
      if (method === "PATCH" && defaultAssetMatch?.[1] && isRecord(body) && typeof body.assetId === "string") {
        if (options.defaultAssetResponse) {
          return options.defaultAssetResponse.promise;
        }
        const song = findSong(songs, defaultAssetMatch[1]);
        if (!song) {
          return json({ error: "FORMAL_SONG_NOT_FOUND" }, 404);
        }
        song.defaultAssetId = body.assetId;
        song.defaultAsset = song.assets.find((asset) => asset.id === body.assetId) ?? null;
        return json({ song, evaluation: { status: "verified" } });
      }

      const assetMatch = requestUrl.pathname.match(/^\/admin\/catalog\/assets\/([^/]+)$/u);
      if (method === "PATCH" && assetMatch?.[1] && isRecord(body)) {
        const song = findSongByAsset(songs, assetMatch[1]);
        if (!song) {
          return json({ error: "FORMAL_ASSET_NOT_FOUND" }, 404);
        }
        const asset = song.assets.find((item) => item.id === assetMatch[1]);
        if (asset) {
          Object.assign(asset, body);
        }
        return json({
          song,
          asset,
          evaluation: { status: "review_required", reason: "duration-delta-over-300ms" }
        });
      }

      const revalidateMatch = requestUrl.pathname.match(/^\/admin\/catalog\/songs\/([^/]+)\/revalidate$/u);
      if (method === "POST" && revalidateMatch?.[1]) {
        const song = findSong(songs, revalidateMatch[1]);
        if (!song) {
          return json({ error: "FORMAL_SONG_NOT_FOUND" }, 404);
        }
        song.status = "review_required";
        return json({
          song,
          evaluation: { status: "review_required", reason: "duration-delta-over-300ms" }
        });
      }

      const validateMatch = requestUrl.pathname.match(/^\/admin\/catalog\/songs\/([^/]+)\/validate$/u);
      if (method === "GET" && validateMatch?.[1]) {
        return json({
          status: "review_required",
          songId: validateMatch[1],
          songJsonPath: "/library/songs/mandarin/周杰伦/七里香/song.json",
          issues: [
            {
              code: "SWITCH_PAIR_NOT_VERIFIED",
              severity: "error",
              reason: "duration-delta-over-300ms",
              message: "Original and instrumental durations differ by more than 300ms"
            }
          ]
        });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function findSong(songs: AdminCatalogSong[], songId: string): AdminCatalogSong | undefined {
  return songs.find((song) => song.id === songId);
}

function findSongByAsset(songs: AdminCatalogSong[], assetId: string): AdminCatalogSong | undefined {
  return songs.find((song) => song.assets.some((asset) => asset.id === assetId));
}

function createSongs(): AdminCatalogSong[] {
  const originalAsset = createAsset({ id: "asset-original", vocalMode: "original", filePath: "songs/mandarin/周杰伦/七里香/original.mp4" });
  const instrumentalAsset = createAsset({
    id: "asset-instrumental",
    vocalMode: "instrumental",
    filePath: "songs/mandarin/周杰伦/七里香/instrumental.mp4"
  });

  return [
    {
      id: "song-1",
      title: "七里香",
      normalizedTitle: "七里香",
      titlePinyin: "",
      titleInitials: "",
      artistId: "artist-1",
      artistName: "周杰伦",
      language: "mandarin",
      status: "ready",
      genre: ["pop"],
      tags: ["ktv"],
      aliases: ["Qi Li Xiang"],
      searchHints: ["qlx"],
      releaseYear: 2004,
      canonicalDurationMs: 180000,
      searchWeight: 0,
      defaultAssetId: "asset-instrumental",
      capabilities: { canSwitchVocalMode: true },
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
      defaultAsset: instrumentalAsset,
      assets: [originalAsset, instrumentalAsset]
    }
  ];
}

function createAsset(overrides: Partial<AdminCatalogAsset> = {}): AdminCatalogAsset {
  return {
    id: "asset-original",
    songId: "song-1",
    sourceType: "local",
    assetKind: "video",
    displayName: "七里香",
    filePath: "songs/mandarin/周杰伦/七里香/original.mp4",
    durationMs: 180000,
    lyricMode: "hard_sub",
    vocalMode: "original",
    status: "ready",
    switchFamily: "main",
    switchQualityStatus: "verified",
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    ...overrides
  };
}
