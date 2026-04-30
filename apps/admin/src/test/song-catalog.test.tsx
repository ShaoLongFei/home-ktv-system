import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App.js";

type RequestRecord = {
  url: string;
  method: string;
  body: unknown;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("song catalog maintenance", () => {
  it("defaults to Imports and switches to Songs without reloading", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    expect(await screen.findByRole("heading", { name: /import review workbench/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Songs" }));

    expect(await screen.findByRole("heading", { name: "Song catalog" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imports" })).toBeTruthy();
  });

  it("renders formal songs with resource maintenance fields", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Songs" }));

    const row = await screen.findByRole("button", { name: /七里香.+ready.+2 assets/u });
    expect(row).toBeTruthy();
    expect(screen.getAllByText(/周杰伦/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mandarin/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText("asset-instrumental").length).toBeGreaterThan(0);
    expect(screen.getAllByText("original").length).toBeGreaterThan(0);
    expect(screen.getAllByText("instrumental").length).toBeGreaterThan(0);
    expect(screen.getAllByText("hard_sub").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ready").length).toBeGreaterThan(0);
    expect(screen.getAllByText("main").length).toBeGreaterThan(0);
    expect(screen.getAllByText("verified").length).toBeGreaterThan(0);
  });

  it("filters song status through /admin/catalog/songs?status=...", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Songs" }));
    await screen.findByRole("heading", { name: "Song catalog" });
    await user.selectOptions(screen.getByLabelText("Song status"), "review_required");

    await waitFor(() => {
      expect(
        requests.some((request) => request.method === "GET" && request.url === "/admin/catalog/songs?status=review_required")
      ).toBe(true);
    });
  });
});

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

      if (method === "GET" && requestUrl.pathname === "/admin/import-candidates") {
        return json({ candidates: [] });
      }

      if (method === "GET" && requestUrl.pathname === "/admin/catalog/songs") {
        const status = requestUrl.searchParams.get("status");
        return json({ songs: status ? songs.filter((song) => song.status === status) : songs });
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

function createSongs() {
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
      defaultAsset: {
        id: "asset-instrumental",
        vocalMode: "instrumental",
        switchQualityStatus: "verified"
      },
      assets: [
        createAsset({ id: "asset-original", vocalMode: "original", filePath: "songs/mandarin/周杰伦/七里香/original.mp4" }),
        createAsset({
          id: "asset-instrumental",
          vocalMode: "instrumental",
          filePath: "songs/mandarin/周杰伦/七里香/instrumental.mp4"
        })
      ]
    }
  ];
}

function createAsset(overrides: Record<string, unknown> = {}) {
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
