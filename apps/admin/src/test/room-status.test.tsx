import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: "Refresh pairing token" })).toBeTruthy();
    expect(screen.getByText("七里香")).toBeTruthy();
    expect(screen.getByText("晴天")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Refresh pairing token" }));

    expect(requests.some((request) => request.method === "POST" && request.url === "/admin/rooms/living-room/pairing-token/refresh")).toBe(true);
    expect(await screen.findByText("2026-05-04 18:30")).toBeTruthy();
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
            tokenExpiresAt: "2026-05-04T10:30:00.000Z",
            controllerUrl: "http://ktv.local/controller?room=living-room&token=token-2",
            qrPayload: "http://ktv.local/controller?room=living-room&token=token-2",
            token: "token-2"
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
    ]
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}
