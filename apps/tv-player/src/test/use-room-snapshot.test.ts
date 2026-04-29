import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import { shouldContinueSnapshotPolling, stabilizeSnapshotPairing } from "../runtime/use-room-snapshot.js";

describe("stabilizeSnapshotPairing", () => {
  it("keeps the first pairing payload stable across later snapshots for the same room", () => {
    const firstSnapshot = roomSnapshot("token-first");
    const laterSnapshot = roomSnapshot("token-later");

    const stabilized = stabilizeSnapshotPairing(firstSnapshot, laterSnapshot);

    expect(stabilized.pairing.token).toBe("token-first");
    expect(stabilized.pairing.qrPayload).toContain("token-first");
    expect(stabilized.generatedAt).toBe(laterSnapshot.generatedAt);
  });

  it("uses the incoming pairing when the room changes", () => {
    const livingRoomSnapshot = roomSnapshot("token-first", "living-room");
    const karaokeRoomSnapshot = roomSnapshot("token-second", "karaoke-room");

    const stabilized = stabilizeSnapshotPairing(livingRoomSnapshot, karaokeRoomSnapshot);

    expect(stabilized.pairing.token).toBe("token-second");
    expect(stabilized.roomSlug).toBe("karaoke-room");
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

function roomSnapshot(token: string, roomSlug = "living-room"): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: roomSlug,
    roomSlug,
    sessionVersion: 1,
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
