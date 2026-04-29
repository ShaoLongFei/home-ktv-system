import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { PlayerClient } from "../runtime/player-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PlayerClient", () => {
  it("keeps browser fetch bound to globalThis when no custom fetch is provided", async () => {
    const seenThisValues: unknown[] = [];
    globalThis.fetch = function browserLikeFetch(this: unknown) {
      seenThisValues.push(this);
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }

      return Promise.resolve(
        new Response(JSON.stringify(roomSnapshot()), {
          headers: {
            "Content-Type": "application/json"
          },
          status: 200
        })
      );
    } as typeof fetch;

    const client = new PlayerClient({
      apiBaseUrl: "http://192.168.5.58:4000",
      deviceId: "tv-active",
      deviceName: "Living Room TV",
      roomSlug: "living-room"
    });

    await expect(client.fetchSnapshot()).resolves.toMatchObject({
      roomSlug: "living-room",
      state: "idle"
    });
    expect(seenThisValues[0]).toBe(globalThis);
  });
});

function roomSnapshot(): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: 1,
    state: "idle",
    pairing: {
      roomSlug: "living-room",
      controllerUrl: "http://192.168.5.58:4000/controller?room=living-room",
      qrPayload: "http://192.168.5.58:4000/controller?room=living-room",
      token: "living-room.test",
      tokenExpiresAt: "2026-04-29T13:50:00.000Z"
    },
    currentTarget: null,
    switchTarget: null,
    conflict: null,
    notice: null,
    generatedAt: "2026-04-29T13:45:00.000Z"
  };
}
