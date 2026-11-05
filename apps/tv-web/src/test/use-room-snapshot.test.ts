import type { RoomControlSnapshot, RoomInteractionEvent, RoomSnapshot } from "@home-ktv/player-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PlayerClient } from "../runtime/player-client.js";
import { useRoomSnapshot } from "../runtime/use-room-snapshot.js";

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

  it("carries volume, pause and replay flags through the control snapshot", async () => {
    const sockets = installWebSocketMock();
    const client = createClient({
      bootstrapSnapshot: roomSnapshot("token-first"),
      fetchSnapshots: []
    });

    const { result } = renderHook(() => useRoomSnapshot(asPlayerClient(client)));

    await waitFor(() => expect(result.current.snapshot?.pairing.token).toBe("token-first"));

    sockets[0]?.emitMessage({
      ...controlSnapshot("token-first", 3),
      volumePercent: 82,
      playbackPaused: true,
      replayToken: "7"
    });

    await waitFor(() => expect(result.current.snapshot?.volumePercent).toBe(82));
    expect(result.current.snapshot?.playbackPaused).toBe(true);
    expect(result.current.snapshot?.replayToken).toBe("7");
  });

  it("collects room interaction realtime events and expires them locally", async () => {
    vi.useFakeTimers();
    const sockets = installWebSocketMock();
    const client = createClient({
      bootstrapSnapshot: roomSnapshot("token-first"),
      fetchSnapshots: []
    });

    const { result } = renderHook(() => useRoomSnapshot(asPlayerClient(client)));

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      sockets[0]?.emitInteraction(roomInteraction("interaction-1", "bullet", "今晚开唱"));
    });

    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]).toMatchObject({
      kind: "bullet",
      message: "今晚开唱"
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(result.current.interactions).toHaveLength(0);
  });

  it("keeps all active realtime interactions until their own expiry instead of dropping after five", async () => {
    vi.useFakeTimers();
    const sockets = installWebSocketMock();
    const client = createClient({
      bootstrapSnapshot: roomSnapshot("token-first"),
      fetchSnapshots: []
    });

    const { result } = renderHook(() => useRoomSnapshot(asPlayerClient(client)));

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      for (let index = 1; index <= 6; index += 1) {
        sockets[0]?.emitInteraction(roomInteraction(`interaction-${index}`, "bullet", `弹幕 ${index}`));
      }
    });

    expect(result.current.interactions).toHaveLength(6);
    expect(result.current.interactions.map((interaction) => interaction.message)).toEqual([
      "弹幕 1",
      "弹幕 2",
      "弹幕 3",
      "弹幕 4",
      "弹幕 5",
      "弹幕 6"
    ]);
  });

  it("reschedules duplicate interaction ids so a replacement is not expired by an old timer", async () => {
    vi.useFakeTimers();
    const sockets = installWebSocketMock();
    const client = createClient({
      bootstrapSnapshot: roomSnapshot("token-first"),
      fetchSnapshots: []
    });

    const { result } = renderHook(() => useRoomSnapshot(asPlayerClient(client)));

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      sockets[0]?.emitInteraction(roomInteraction("interaction-1", "bullet", "第一条"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    act(() => {
      sockets[0]?.emitInteraction(roomInteraction("interaction-1", "bullet", "第二条"));
    });

    expect(result.current.interactions).toHaveLength(1);
    expect(result.current.interactions[0]?.message).toBe("第二条");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.interactions).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.interactions).toHaveLength(0);
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

  it("retries bootstrap after a transient startup failure", async () => {
    vi.useFakeTimers();
    const sockets = installWebSocketMock();
    const bootstrap = vi
      .fn()
      .mockRejectedValueOnce(new Error("bootstrap unavailable"))
      .mockResolvedValueOnce({
        status: "registered",
        snapshot: roomSnapshot("token-recovered")
      });
    const client = {
      bootstrap,
      createSnapshotSocketUrl: vi.fn(() => "ws://ktv.local/rooms/living-room/realtime?deviceId=tv-active&client=tv"),
      deviceId: "tv-active",
      fetchSnapshot: vi.fn(async () => roomSnapshot("token-polled")),
      roomSlug: "living-room",
      sendHeartbeat: vi.fn(),
      sendTelemetry: vi.fn()
    } as unknown as PlayerClient;

    const { result } = renderHook(() => useRoomSnapshot(client, 1500));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe("error");
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("ready");
    expect(result.current.snapshot?.pairing.token).toBe("token-recovered");
    expect(sockets).toHaveLength(1);
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
      controllerUrl: `http://192.168.5.58:4000/controller?token=${token}`,
      qrPayload: `http://192.168.5.58:4000/controller?token=${token}`,
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
    tvPresence: {
      online: true,
      deviceName: "Living Room TV",
      lastSeenAt: "2026-04-29T13:45:03.000Z",
      onlineCount: 1,
      devices: [{ deviceId: "tv-1", deviceName: "Living Room TV", lastSeenAt: "2026-04-29T13:45:03.000Z" }],
      conflict: null
    },
    controllers: { onlineCount: 1 },
    queue: []
  };
}

function createClient(input: {
  bootstrapSnapshot: RoomSnapshot;
  bootstrapStatus?: "registered";
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

  emitInteraction(interaction: RoomInteractionEvent): void {
    this.onmessage?.({
      data: JSON.stringify({
        type: "room.interaction.created",
        payload: interaction
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

function roomInteraction(
  id: string,
  kind: RoomInteractionEvent["kind"],
  message: string
): RoomInteractionEvent {
  return {
    id,
    roomId: "living-room",
    roomSlug: "living-room",
    kind,
    message,
    senderDeviceId: "phone-a",
    senderName: "Controller A",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7000).toISOString()
  };
}
