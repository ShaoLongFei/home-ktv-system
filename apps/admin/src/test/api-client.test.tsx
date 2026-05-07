import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanFailedOnlineTask,
  promoteOnlineTaskResource,
  refreshPairingToken,
  refreshRoomStatus,
  retryFailedOnlineTask
} from "../api/client.js";

type RequestRecord = {
  url: string;
  method: string;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin api client", () => {
  it("exposes room recovery helpers with room- and task-scoped routes", async () => {
    const requests: RequestRecord[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = new URL(String(input), "http://admin.test");
        requests.push({ url: `${requestUrl.pathname}${requestUrl.search}`, method: init?.method ?? "GET" });

        if (requestUrl.pathname === "/admin/rooms/living-room") {
          return json({ room: { roomId: "living-room", roomSlug: "living-room", status: "active" } });
        }
        if (requestUrl.pathname === "/admin/rooms/living-room/pairing-token/refresh") {
          return json({ pairing: { tokenExpiresAt: "2026-05-04T10:30:45.000Z", controllerUrl: "url", qrPayload: "url" } });
        }
        return json({
          task: {
            id: "task-1",
            roomId: "living-room",
            status: "selected"
          }
        });
      })
    );

    await refreshRoomStatus("living-room");
    await refreshPairingToken("living-room");
    const retry = await retryFailedOnlineTask("living-room", "task-1");
    await cleanFailedOnlineTask("living-room", "task-1");
    await promoteOnlineTaskResource("living-room", "task-1");

    expect(retry.task.status).toBe("selected");
    expect(requests).toEqual([
      { url: "/admin/rooms/living-room", method: "GET" },
      { url: "/admin/rooms/living-room/pairing-token/refresh", method: "POST" },
      { url: "/admin/rooms/living-room/online-tasks/task-1/retry", method: "POST" },
      { url: "/admin/rooms/living-room/online-tasks/task-1/clean", method: "POST" },
      { url: "/admin/rooms/living-room/online-tasks/task-1/promote", method: "POST" }
    ]);
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
