import type { RoomControlSnapshot, RoomSnapshot } from "@home-ktv/player-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PlayerClient } from "../runtime/player-client.js";
import { shouldContinueSnapshotPolling, useRoomSnapshot } from "../runtime/use-room-snapshot.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRoomSnapshot realtime sync", () => {
  it("opens the TV realtime stream and applies room.control.snapshot.updated payloads", async () => {
    const sockets = installWebSocketMock();
    const client = createClient({
      bootstrapSnapshot: roomSnapshot("token-first"),
      fetchSnapshots: [roomSnapshot("token-polled")]
    });

    const { result } = renderHook(() => useRoomSnapshot(asPlayerClient(client)));

    await waitFor(() => expect(result.current.snapshot?.pairing.token).toBe("token-first"));
    expect(sockets[0]?.url).toBe("ws://ktv.local/rooms/living-room/realtime?deviceId=tv-active&client=tv");

    sockets[0]?.emitMessage(controlSnapshot("token-refreshed", 2));

    await waitFor(() => expect(result.current.snapshot?.pairing.token).toBe("token-refreshed"));
    expect(result.current.snapshot?.type).toBe("room.snapshot");
  });

  it("falls back to 1500ms polling after the realtime stream closes", async () => {
    vi.useFakeTimers();
    const sockets = installWebSocketMock();
    const fetchSnapshots = [roomSnapshot("token-fallback", "living-room", 2)];
    const client = createClient({
      bootstrapSnapshot: roomSnapshot("token-first"),
      fetchSnapshots
    });

    const { result } = renderHook(() => useRoomSnapshot(asPlayerClient(client), 1500));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.snapshot?.pairing.token).toBe("token-first");

    act(() => {
      sockets[0]?.emitClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(result.current.snapshot?.pairing.token).toBe("token-fallback");
    expect(client.fetchSnapshot).toHaveBeenCalled();
  });

  it("does not open realtime or polling after a conflict bootstrap", async () => {
    const sockets = installWebSocketMock();
    const client = createClient({
      bootstrapStatus: "conflict",
      bootstrapSnapshot: conflictSnapshot(),
      fetchSnapshots: [roomSnapshot("token-polled")]
    });

    const { result } = renderHook(() => useRoomSnapshot(asPlayerClient(client)));

    await waitFor(() => expect(result.current.snapshot?.state).toBe("conflict"));
    expect(sockets).toHaveLength(0);
    expect(client.fetchSnapshot).not.toHaveBeenCalled();
  });
});

describe("shouldContinueSnapshotPolling", () => {
  it("stops polling after a conflict bootstrap so conflict state is not overwritten", () => {
    expect(
      shouldContinueSnapshotPolling({
        status: "conflict",
        snapshot: conflictSnapshot()
      })
    ).toBe(false);
  });

  it("continues polling after a registered bootstrap", () => {
    expect(
      shouldContinueSnapshotPolling({
        status: "registered",
        snapshot: roomSnapshot("token-first")
      })
    ).toBe(true);
  });
});

function roomSnapshot(token: string, roomSlug = "living-room", sessionVersion = 1): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: roomSlug,
    roomSlug,
    sessionVersion,
    state: "idle",
    pairing: {
      roomSlug,
      controllerUrl: `http://192.168.5.58:4000/controller?room=${roomSlug}&token=${token}`,
      qrPayload: `http://192.168.5.58:4000/controller?room=${roomSlug}&token=${token}`,
      token,
      tokenExpiresAt: "2026-04-29T13:50:00.000Z"
    },
    currentTarget: null,
    switchTarget: null,
    conflict: null,
    notice: null,
    generatedAt: token === "token-first" ? "2026-04-29T13:45:00.000Z" : "2026-04-29T13:45:02.000Z"
  };
}

function controlSnapshot(token: string, sessionVersion: number): RoomControlSnapshot {
  const snapshot = roomSnapshot(token);
  return {
    ...snapshot,
    type: "room.control.snapshot",
    sessionVersion,
    tvPresence: { online: true, deviceName: "Living Room TV", lastSeenAt: "2026-04-29T13:45:03.000Z", conflict: null },
    controllers: { onlineCount: 1 },
    queue: []
  };
}

function conflictSnapshot(): RoomSnapshot {
  return {
    ...roomSnapshot("token-conflict"),
    sessionVersion: 0,
    state: "conflict",
    conflict: {
      kind: "active-player-conflict",
      reason: "active-player-exists",
      roomId: "living-room",
      activeDeviceId: "web-tv-active",
      activeDeviceName: "LivingRoomTV",
      message: "This room already has an active TV player."
    }
  };
}

function createClient(input: {
  bootstrapSnapshot: RoomSnapshot;
  bootstrapStatus?: "registered" | "conflict";
  fetchSnapshots: RoomSnapshot[];
}) {
  return {
    bootstrap: vi.fn(async () => ({
      status: input.bootstrapStatus ?? "registered",
      snapshot: input.bootstrapSnapshot
    })),
    createSnapshotSocketUrl: vi.fn(() => "ws://ktv.local/rooms/living-room/realtime?deviceId=tv-active&client=tv"),
    fetchSnapshot: vi.fn(async () => input.fetchSnapshots.shift() ?? input.bootstrapSnapshot)
  };
}

function asPlayerClient(client: ReturnType<typeof createClient>): PlayerClient {
  return client as unknown as PlayerClient;
}

class FakeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {}

  close(): void {}

  emitClose(): void {
    this.onclose?.();
  }

  emitMessage(snapshot: RoomControlSnapshot): void {
    this.onmessage?.({
      data: JSON.stringify({
        type: "room.control.snapshot.updated",
        payload: snapshot
      })
    });
  }
}

function installWebSocketMock(): FakeWebSocket[] {
  const sockets: FakeWebSocket[] = [];
  vi.stubGlobal(
    "WebSocket",
    class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    }
  );
  return sockets;
}
