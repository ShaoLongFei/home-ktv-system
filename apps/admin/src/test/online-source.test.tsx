import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../i18n.js";
import { OnlineSourceView } from "../online/OnlineSourceView.js";

type RequestRecord = { url: string; method: string; body: unknown };

function installOnlineFetchMock(): { requests: RequestRecord[] } {
  const requests: RequestRecord[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://admin.test");
      const path = url.pathname;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url: `${path}${url.search}`, method, body });

      if (path === "/admin/online/sources") {
        return json({
          provider: "igeba",
          enabled: true,
          cacheDir: "/data/online-cache/igeba",
          pendingJobs: 1,
          activeJobs: 1,
          stats: { total: 2, ready: 1, caching: 1, failed: 0, unavailable: 0, bytes: 56_135_055 },
          quota: { maxBytes: 53_687_091_200, maxItems: 200, ttlDays: 30, usedBytes: 56_135_055, usedItems: 1 },
          metrics: { downloads: 3, evictions: 1, failures: 0, lastPruneAt: null }
        });
      }

      if (path === "/admin/online/assets") {
        return json({
          assets: [
            {
              id: "online-asset-1",
              provider: "igeba",
              providerAssetId: "20040098",
              status: "ready",
              cachePath: "/data/online-cache/igeba/20040098.mkv",
              cacheBytes: 56_135_055,
              audioTrackCount: 2,
              durationMs: 248000,
              errorReason: null,
              catalogSongId: "ktv-online-igeba-20040098",
              metadata: { title: "孤勇者", artistName: "腾格尔" }
            }
          ]
        });
      }

      if (path === "/admin/online/discovery") {
        return json({
          hotModules: [
            {
              headId: "26",
              title: "团建必点",
              subTitle: "团队就是力量",
              pictureUrl: null,
              link: "app://Object=Playlist&ObjectId=13166",
              objectType: "Playlist",
              objectId: "13166"
            }
          ]
        });
      }

      if (method === "POST" && path.endsWith("/evict")) {
        return json({ assetId: "online-asset-1", status: "unavailable", evicted: true });
      }

      if (method === "POST" && path === "/admin/online/import") {
        return json({ queued: 1, items: [] });
      }

      if (method === "POST" && path === "/admin/online/prune") {
        return json({ evicted: 1, stale: 0 });
      }

      return json({});
    })
  );

  return { requests };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin online source view", () => {
  it("renders provider stats, cached songs, and hot modules", async () => {
    installOnlineFetchMock();
    render(
      <I18nProvider defaultLanguage="zh">
        <OnlineSourceView />
      </I18nProvider>
    );

    expect(await screen.findByRole("heading", { name: "在线补歌源" })).toBeTruthy();
    expect(await screen.findByText("igeba · 已启用")).toBeTruthy();
    expect((await screen.findAllByText(/53.5 MB/)).length).toBeGreaterThanOrEqual(1);

    const table = screen.getByRole("table");
    expect(within(table).getByText("孤勇者")).toBeTruthy();
    expect(within(table).getByText("ready")).toBeTruthy();

    expect(screen.getByText("团建必点")).toBeTruthy();
  });

  it("evicts a cached song and loads a hot module", async () => {
    const { requests } = installOnlineFetchMock();
    render(
      <I18nProvider defaultLanguage="zh">
        <OnlineSourceView />
      </I18nProvider>
    );
    await screen.findByRole("heading", { name: "在线补歌源" });

    await userEvent.click(screen.getByRole("button", { name: "淘汰" }));
    await waitFor(() =>
      expect(
        requests.some((request) => request.method === "POST" && request.url === "/admin/online/assets/online-asset-1/evict")
      ).toBe(true)
    );

    await userEvent.click(screen.getByRole("button", { name: "预载该模块" }));
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.method === "POST" &&
            request.url === "/admin/online/import" &&
            (request.body as { packageId?: string } | undefined)?.packageId === "13166"
        )
      ).toBe(true)
    );
  });
});
