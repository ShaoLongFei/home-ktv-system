import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSongCatalogRuntime } from "../songs/use-song-catalog-runtime.js";
import type {
  AdminCatalogAsset,
  AdminCatalogSong,
  CatalogValidationResult,
  SongStatus
} from "../songs/types.js";

type RequestRecord = {
  url: string;
  method: string;
  body: unknown;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useSongCatalogRuntime", () => {
  it("loads songs, selects the first song, and clears selection when filters return no songs", async () => {
    const { requests } = installFetchMock();
    const { result } = renderHook(() => useSongCatalogRuntime(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.songs).toHaveLength(2));
    expect(requests.some((request) => request.method === "GET" && request.url === "/admin/catalog/songs")).toBe(true);
    expect(result.current.selectedSongId).toBe("song-1");
    expect(result.current.selectedSong?.title).toBe("七里香");

    await act(async () => {
      result.current.setStatus("unavailable");
    });

    await waitFor(() => expect(result.current.songs).toHaveLength(0));
    expect(result.current.selectedSongId).toBeNull();
    expect(result.current.selectedSong).toBeNull();
  });

  it("requests the selected status when the status filter changes", async () => {
    const { requests } = installFetchMock();
    const { result } = renderHook(() => useSongCatalogRuntime(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.songs).toHaveLength(2));

    await act(async () => {
      result.current.setStatus("review_required");
    });

    await waitFor(() => {
      expect(
        requests.some((request) => request.method === "GET" && request.url === "/admin/catalog/songs?status=review_required")
      ).toBe(true);
    });
    await waitFor(() => expect(result.current.songs.map((song) => song.id)).toEqual(["song-2"]));
  });

  it("sets the default asset, stores evaluation, and updates the selected song cache", async () => {
    const { requests } = installFetchMock();
    const { result } = renderHook(() => useSongCatalogRuntime(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.selectedSong?.id).toBe("song-1"));

    await act(async () => {
      await result.current.setDefaultAsset("song-1", "asset-original");
    });

    expect(
      requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.url === "/admin/catalog/songs/song-1/default-asset" &&
          JSON.stringify(request.body) === JSON.stringify({ assetId: "asset-original" })
      )
    ).toBe(true);
    expect(result.current.evaluation).toEqual({ status: "verified" });
    expect(result.current.selectedSong?.defaultAssetId).toBe("asset-original");
  });

  it("validates song.json and stores the validation result", async () => {
    const { requests } = installFetchMock();
    const { result } = renderHook(() => useSongCatalogRuntime(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.selectedSong?.id).toBe("song-1"));

    await act(async () => {
      await result.current.validateSong("song-1");
    });

    expect(requests.some((request) => request.method === "GET" && request.url === "/admin/catalog/songs/song-1/validate")).toBe(true);
    expect(result.current.validation).toEqual(validationResult("song-1"));
  });
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return function TestQueryClientProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function installFetchMock() {
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

      if (method === "GET" && requestUrl.pathname === "/admin/catalog/songs") {
        const status = requestUrl.searchParams.get("status") as SongStatus | null;
        return json({ songs: status ? songs.filter((song) => song.status === status) : songs });
      }

      const defaultAssetMatch = requestUrl.pathname.match(/^\/admin\/catalog\/songs\/([^/]+)\/default-asset$/u);
      if (method === "PATCH" && defaultAssetMatch?.[1] && isRecord(body) && typeof body.assetId === "string") {
        const song = songs.find((item) => item.id === defaultAssetMatch[1]);
        if (!song) {
          return json({ error: "FORMAL_SONG_NOT_FOUND" }, 404);
        }
        song.defaultAssetId = body.assetId;
        song.defaultAsset = song.assets.find((asset) => asset.id === body.assetId) ?? null;
        return json({ song: { ...song, assets: song.assets.map((asset) => ({ ...asset })) }, evaluation: { status: "verified" } });
      }

      const validateMatch = requestUrl.pathname.match(/^\/admin\/catalog\/songs\/([^/]+)\/validate$/u);
      if (method === "GET" && validateMatch?.[1]) {
        return json(validationResult(validateMatch[1]));
      }

      return json({ error: "UNHANDLED_TEST_ROUTE" }, 500);
    })
  );

  return { requests };
}

function validationResult(songId: string): CatalogValidationResult {
  return {
    status: "review_required",
    songId,
    songJsonPath: "/library/songs/mandarin/周杰伦/七里香/song.json",
    issues: [
      {
        code: "SWITCH_PAIR_NOT_VERIFIED",
        severity: "error",
        reason: "duration-delta-over-300ms",
        message: "Original and instrumental durations differ by more than 300ms"
      }
    ]
  };
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

function createSongs(): AdminCatalogSong[] {
  const originalAsset = createAsset({ id: "asset-original", vocalMode: "original", filePath: "songs/mandarin/周杰伦/七里香/original.mp4" });
  const instrumentalAsset = createAsset({
    id: "asset-instrumental",
    vocalMode: "instrumental",
    filePath: "songs/mandarin/周杰伦/七里香/instrumental.mp4"
  });
  const reviewAsset = createAsset({
    id: "asset-review",
    songId: "song-2",
    vocalMode: "original",
    filePath: "songs/cantonese/陈奕迅/富士山下/original.mp4"
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
    },
    {
      id: "song-2",
      title: "富士山下",
      normalizedTitle: "富士山下",
      titlePinyin: "",
      titleInitials: "",
      artistId: "artist-2",
      artistName: "陈奕迅",
      language: "cantonese",
      status: "review_required",
      genre: ["pop"],
      tags: ["ktv"],
      aliases: [],
      searchHints: ["fssx"],
      releaseYear: 2006,
      canonicalDurationMs: 190000,
      searchWeight: 0,
      defaultAssetId: "asset-review",
      capabilities: { canSwitchVocalMode: false },
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
      defaultAsset: reviewAsset,
      assets: [reviewAsset]
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
