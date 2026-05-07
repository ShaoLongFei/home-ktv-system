import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

describe("room status view", () => {
  it("defaults to Imports and switches to Rooms without reloading", async () => {
    const user = userEvent.setup();
    installFetchMock();
    render(<App />);

    expect(await screen.findByRole("heading", { name: /import review workbench/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Rooms" }));

    expect(await screen.findByRole("heading", { name: "Room status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imports" })).toBeTruthy();
  });

  it("renders room status fields and refreshes the pairing token", async () => {
    const user = userEvent.setup();
    const { requests } = installFetchMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Rooms" }));

    expect(await screen.findByText("Token expires")).toBeTruthy();
    expect(screen.getByText("Online controllers")).toBeTruthy();
    expect(screen.getByText("TV status")).toBeTruthy();
    expect(screen.getByText("Session version")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh room state" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh pairing token" })).toBeTruthy();
    expect(screen.getByText("七里香")).toBeTruthy();
    expect(screen.getByText("晴天")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Online tasks" })).toBeTruthy();
    expect(screen.getByText("Task counts")).toBeTruthy();
    expect(screen.getByText("稻香")).toBeTruthy();
    expect(screen.getByText("provider-timeout")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent events" })).toBeTruthy();
    expect(screen.getByText("player.failed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Promote ready resource" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Refresh pairing token" }));

    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/rooms/living-room/pairing-token/refresh")).toBe(true);
    expect(await screen.findByText("2026-05-04 18:30:45")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Refresh room state" }));
    await user.click(screen.getByRole("button", { name: "Retry task task-failed" }));
    await user.click(screen.getByRole("button", { name: "Clean task task-failed" }));
    await user.click(screen.getByRole("button", { name: "Promote task task-ready" }));

    expect(requests.filter((request) => request.method === "GET" && request.url === "/admin/rooms/living-room")).toHaveLength(2);
    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/rooms/living-room/online-tasks/task-failed/retry")).toBe(true);
    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/rooms/living-room/online-tasks/task-failed/clean")).toBe(true);
    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/rooms/living-room/online-tasks/task-ready/promote")).toBe(true);
  });

  it("updates room status from realtime snapshot messages", async () => {
    const user = userEvent.setup();
    installFetchMock();
    const webSockets = installWebSocketMock();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Rooms" }));

    expect(await screen.findByText("七里香")).toBeTruthy();
    await waitFor(() => expect(webSockets.instances).toHaveLength(1));
    expect(webSockets.instances[0]?.url).toContain("/rooms/living-room/realtime");
    expect(webSockets.instances[0]?.url).toContain("client=admin");

    act(() => {
      webSockets.instances[0]?.emitJson({
        type: "room.control.snapshot.updated",
        payload: realtimeSnapshot()
      });
    });

    expect(await screen.findByText("夜空中最亮的星")).toBeTruthy();
    expect(screen.getByText("后来")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.queryByText("晴天")).toBeNull();
  });
});

function installFetchMock() {
  const requests: RequestRecord[] = [];
  let refreshed = false;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(input), "http://admin.test");
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url: `${requestUrl.pathname}${requestUrl.search}`, method, body });

      if (method === "GET" && requestUrl.pathname === "/admin/rooms/living-room") {
        return json(roomStatus(refreshed ? "2026-05-04T10:30:00.000Z" : "2026-05-04T10:15:00.000Z"));
      }

      if (method === "POST" && requestUrl.pathname === "/admin/rooms/living-room/pairing-token/refresh") {
        refreshed = true;
        return json({
          pairing: {
            tokenExpiresAt: "2026-05-04T10:30:45.000Z",
            controllerUrl: "http://ktv.local/controller?room=living-room&token=token-2",
            qrPayload: "http://ktv.local/controller?room=living-room&token=token-2",
            token: "token-2"
          }
        });
      }

      if (method === "POST" && requestUrl.pathname.includes("/online-tasks/")) {
        return json({
          task: {
            id: requestUrl.pathname.includes("task-ready") ? "task-ready" : "task-failed",
            roomId: "living-room",
            status: requestUrl.pathname.endsWith("/promote") ? "promoted" : "selected",
            provider: "fixture-provider",
            providerCandidateId: "fixture",
            title: "稻香",
            artistName: "周杰伦",
            sourceLabel: "Fixture Provider",
            durationMs: 210000,
            candidateType: "karaoke",
            reliabilityLabel: "high",
            riskLabel: "normal",
            failureReason: null,
            recentEvent: {},
            providerPayload: {},
            readyAssetId: "asset-online-ready",
            createdAt: "2026-05-04T10:00:00.000Z",
            updatedAt: "2026-05-04T10:02:00.000Z",
            selectedAt: null,
            reviewRequiredAt: null,
            fetchingAt: null,
            fetchedAt: null,
            readyAt: null,
            failedAt: null,
            staleAt: null,
            promotedAt: null,
            purgedAt: null
          }
        });
      }

      return json({ error: "NOT_FOUND" }, 404);
    })
  );

  return { requests };
}

function roomStatus(tokenExpiresAt: string) {
  return {
    room: {
      roomId: "living-room",
      roomSlug: "living-room",
      status: "active"
    },
    pairing: {
      tokenExpiresAt,
      controllerUrl: "http://ktv.local/controller?room=living-room&token=token-1",
      qrPayload: "http://ktv.local/controller?room=living-room&token=token-1"
    },
    tvPresence: {
      online: true,
      deviceName: null,
      lastSeenAt: "2026-05-04T10:00:00.000Z",
      conflict: null
    },
    controllers: { onlineCount: 1 },
    sessionVersion: 8,
    current: {
      queueEntryId: "queue-current",
      songTitle: "七里香",
      artistName: "周杰伦",
      vocalMode: "instrumental"
    },
    queue: [
      {
        queueEntryId: "queue-current",
        songTitle: "七里香",
        artistName: "周杰伦"
      },
      {
        queueEntryId: "queue-next",
        songTitle: "晴天",
        artistName: "周杰伦"
      }
    ],
    recentEvents: [
      {
        id: "playback-event-failed",
        roomId: "living-room",
        queueEntryId: "queue-current",
        eventType: "player.failed",
        eventPayload: { reason: "media-error", recovery: "skipped-to-next" },
        createdAt: "2026-05-04T10:03:00.000Z"
      }
    ],
    onlineTasks: {
      counts: { total: 2, ready: 1, failed: 1 },
      tasks: [
        {
          taskId: "task-ready",
          roomId: "living-room",
          provider: "fixture-provider",
          providerCandidateId: "fixture-ready",
          title: "稻香",
          artistName: "周杰伦",
          sourceLabel: "Fixture Provider",
          durationMs: 210000,
          candidateType: "karaoke",
          reliabilityLabel: "high",
          riskLabel: "normal",
          status: "ready",
          failureReason: null,
          recentEvent: { type: "ready" },
          recentEventAt: "2026-05-04T10:02:00.000Z",
          readyAssetId: "asset-online-ready",
          createdAt: "2026-05-04T10:00:00.000Z",
          updatedAt: "2026-05-04T10:02:00.000Z"
        },
        {
          taskId: "task-failed",
          roomId: "living-room",
          provider: "fixture-provider",
          providerCandidateId: "fixture-failed",
          title: "倒带",
          artistName: "蔡依林",
          sourceLabel: "Fixture Provider",
          durationMs: 198000,
          candidateType: "mv",
          reliabilityLabel: "medium",
          riskLabel: "normal",
          status: "failed",
          failureReason: "provider-timeout",
          recentEvent: { type: "failed" },
          recentEventAt: "2026-05-04T10:01:00.000Z",
          readyAssetId: null,
          createdAt: "2026-05-04T09:59:00.000Z",
          updatedAt: "2026-05-04T10:01:00.000Z"
        }
      ]
    }
  };
}

function realtimeSnapshot() {
  return {
    type: "room.control.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: 9,
    state: "playing",
    pairing: {
      tokenExpiresAt: "2026-05-04T10:45:00.000Z",
      controllerUrl: "http://ktv.local/controller?room=living-room&token=token-3",
      qrPayload: "http://ktv.local/controller?room=living-room&token=token-3",
      token: "token-3"
    },
    tvPresence: {
      online: true,
      deviceName: "Living Room TV",
      lastSeenAt: "2026-05-04T10:40:00.000Z",
      conflict: null
    },
    controllers: { onlineCount: 2 },
    currentTarget: {
      roomId: "living-room",
      sessionVersion: 9,
      queueEntryId: "queue-new",
      assetId: "asset-new",
      currentQueueEntryPreview: {
        queueEntryId: "queue-new",
        songTitle: "夜空中最亮的星",
        artistName: "逃跑计划"
      },
      playbackUrl: "http://ktv.local/media/asset-new",
      resumePositionMs: 12000,
      vocalMode: "original",
      switchFamily: "family-new",
      nextQueueEntryPreview: {
        queueEntryId: "queue-after",
        songTitle: "后来",
        artistName: "刘若英"
      }
    },
    switchTarget: null,
    targetVocalMode: "original",
    queue: [
      {
        queueEntryId: "queue-new",
        songId: "song-new",
        assetId: "asset-new",
        songTitle: "夜空中最亮的星",
        artistName: "逃跑计划",
        requestedBy: "mobile-1",
        queuePosition: 1,
        status: "playing",
        canPromote: false,
        canDelete: false,
        undoExpiresAt: null
      },
      {
        queueEntryId: "queue-after",
        songId: "song-after",
        assetId: "asset-after",
        songTitle: "后来",
        artistName: "刘若英",
        requestedBy: "mobile-1",
        queuePosition: 2,
        status: "queued",
        canPromote: true,
        canDelete: true,
        undoExpiresAt: null
      }
    ],
    notice: null,
    generatedAt: "2026-05-04T10:40:00.000Z"
  };
}

function installWebSocketMock() {
  class MockWebSocket {
    static instances: MockWebSocket[] = [];
    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(readonly url: string) {
      MockWebSocket.instances.push(this);
    }

    close() {}

    emitJson(payload: unknown) {
      this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }

  vi.stubGlobal("WebSocket", MockWebSocket);
  return { instances: MockWebSocket.instances };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
