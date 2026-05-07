import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { RoomSnapshot, SwitchTarget } from "@home-ktv/player-contracts";

type MockActivePlaybackResult = { status: "playing" } | { status: "blocked"; message: string };

const mocks = vi.hoisted(() => {
  const createBrowserPlayerClient = vi.fn();
  const createBrowserVideoPool = vi.fn();
  const activePlaybackEnsurePlaying = vi.fn(async (): Promise<MockActivePlaybackResult> => ({ status: "playing" }));
  const roomSnapshot = vi.fn();
  const switchVocalMode = vi.fn(async (_snapshot: RoomSnapshot) => ({
    status: "committed" as const,
    switchTarget: switchTarget("instrumental")
  }));
  const sendHeartbeat = vi.fn(async () => ({ status: "sent" as const }));
  const recover = vi.fn(async () => ({ status: "idle" as const, target: null, notice: null }));

  return {
    activePlaybackEnsurePlaying,
    createBrowserPlayerClient,
    createBrowserVideoPool,
    recover,
    roomSnapshot,
    sendHeartbeat,
    switchVocalMode
  };
});

vi.mock("../runtime/player-client.js", () => ({
  createBrowserPlayerClient: mocks.createBrowserPlayerClient
}));

vi.mock("../runtime/video-pool.js", () => ({
  createBrowserVideoPool: mocks.createBrowserVideoPool
}));

vi.mock("../runtime/active-playback-controller.js", () => ({
  ActivePlaybackController: class {
    async ensurePlaying() {
      return mocks.activePlaybackEnsurePlaying();
    }
  }
}));

vi.mock("../runtime/switch-controller.js", () => ({
  SwitchController: class {
    async switchVocalMode(snapshot: RoomSnapshot) {
      return mocks.switchVocalMode(snapshot);
    }
  }
}));

vi.mock("../runtime/heartbeat-controller.js", () => ({
  HeartbeatController: class {
    async send() {
      return mocks.sendHeartbeat();
    }
  }
}));

vi.mock("../runtime/recovery-controller.js", () => ({
  RecoveryController: class {
    async recover() {
      return mocks.recover();
    }
  }
}));

vi.mock("../runtime/use-room-snapshot.js", () => ({
  useRoomSnapshot: () => ({
    errorMessage: null,
    snapshot: mocks.roomSnapshot(),
    status: "ready" as const
  })
}));

import { App } from "../App.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.roomSnapshot.mockImplementation(() => snapshot());
});

describe("tv app runtime", () => {
  beforeEach(() => {
    mocks.roomSnapshot.mockImplementation(() => snapshot());
  });

  it("starts the current target before applying a backend-requested vocal mode switch", async () => {
    const pool = createPool({
      activeTarget: null,
      activePaused: true
    });
    mocks.createBrowserPlayerClient.mockReturnValue(createClient());
    mocks.createBrowserVideoPool.mockReturnValue(pool);

    render(<App />);

    await waitFor(() => expect(mocks.activePlaybackEnsurePlaying).toHaveBeenCalledTimes(1));
    expect(mocks.switchVocalMode).not.toHaveBeenCalled();
  });

  it("applies a backend-requested vocal mode switch once the current target is already playing", async () => {
    const pool = createPool({
      activeTarget: snapshot().currentTarget,
      activePaused: false
    });
    mocks.createBrowserPlayerClient.mockReturnValue(createClient());
    mocks.createBrowserVideoPool.mockReturnValue(pool);

    render(<App />);

    await waitFor(() => expect(mocks.switchVocalMode).toHaveBeenCalledTimes(1));
    expect(mocks.activePlaybackEnsurePlaying).not.toHaveBeenCalled();
    expect(mocks.switchVocalMode.mock.calls[0]?.[0]).toMatchObject({
      currentTarget: expect.objectContaining({ vocalMode: "original" }),
      targetVocalMode: "instrumental"
    });
  });

  it("reports ended telemetry when the active video ends", async () => {
    const endedSnapshot = snapshot({ targetVocalMode: "original" });
    mocks.roomSnapshot.mockImplementation(() => endedSnapshot);
    const sendTelemetry = vi.fn(async () => {});
    mocks.createBrowserPlayerClient.mockReturnValue(createClient({ sendTelemetry }));
    mocks.createBrowserVideoPool.mockImplementation((activeVideo: HTMLVideoElement, standbyVideo: HTMLVideoElement) => {
      Object.defineProperty(activeVideo, "currentTime", { configurable: true, value: 60 });
      Object.defineProperty(activeVideo, "duration", { configurable: true, value: 60 });
      Object.defineProperty(activeVideo, "paused", { configurable: true, value: false });
      return createPool({
        activeTarget: endedSnapshot.currentTarget,
        activeVideo,
        standbyVideo
      });
    });

    const { container } = render(<App />);
    const activeVideo = container.querySelector("video");
    if (!activeVideo) {
      throw new Error("active video missing");
    }

    fireEvent.ended(activeVideo);

    await waitFor(() =>
      expect(sendTelemetry).toHaveBeenCalledWith({
        roomSlug: "living-room",
        deviceId: "tv-player-1",
        eventType: "ended",
        sessionVersion: 5,
        queueEntryId: "queue-current",
        assetId: "asset-original",
        playbackPositionMs: 60_000,
        vocalMode: "original",
        switchFamily: "family-main",
        rollbackAssetId: null,
        stage: "ended"
      })
    );
  });

  it("reports playing telemetry when current playback starts", async () => {
    const playbackSnapshot = snapshot({ state: "loading", targetVocalMode: "original" });
    mocks.roomSnapshot.mockImplementation(() => playbackSnapshot);
    const sendTelemetry = vi.fn(async () => {});
    mocks.createBrowserPlayerClient.mockReturnValue(createClient({ sendTelemetry }));
    mocks.createBrowserVideoPool.mockReturnValue(createPool({ activeTarget: playbackSnapshot.currentTarget }));

    render(<App />);

    await waitFor(() =>
      expect(sendTelemetry).toHaveBeenCalledWith({
        roomSlug: "living-room",
        deviceId: "tv-player-1",
        eventType: "playing",
        sessionVersion: 5,
        queueEntryId: "queue-current",
        assetId: "asset-original",
        playbackPositionMs: 0,
        vocalMode: "original",
        switchFamily: "family-main",
        rollbackAssetId: null,
        stage: "active_playback_started"
      })
    );
  });

  it("reports loading telemetry when browser autoplay blocks current playback", async () => {
    const playbackSnapshot = snapshot({ state: "loading", targetVocalMode: "original" });
    mocks.roomSnapshot.mockImplementation(() => playbackSnapshot);
    mocks.activePlaybackEnsurePlaying.mockResolvedValueOnce({
      status: "blocked",
      message: "play() failed"
    });
    const sendTelemetry = vi.fn(async () => {});
    mocks.createBrowserPlayerClient.mockReturnValue(createClient({ sendTelemetry }));
    mocks.createBrowserVideoPool.mockReturnValue(createPool({ activeTarget: playbackSnapshot.currentTarget }));

    render(<App />);

    await waitFor(() =>
      expect(sendTelemetry).toHaveBeenCalledWith({
        roomSlug: "living-room",
        deviceId: "tv-player-1",
        eventType: "loading",
        sessionVersion: 5,
        queueEntryId: "queue-current",
        assetId: "asset-original",
        playbackPositionMs: 1234,
        vocalMode: "original",
        switchFamily: "family-main",
        rollbackAssetId: null,
        message: "play() failed",
        stage: "autoplay_blocked"
      })
    );
  });
});

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: "tv-player-1",
    fetchSnapshot: vi.fn(),
    requestSwitchTransition: vi.fn(),
    sendHeartbeat: vi.fn(),
    sendTelemetry: vi.fn(),
    ...overrides
  };
}

function createPool(
  input: {
    activeTarget?: ReturnType<typeof snapshot>["currentTarget"];
    activePaused?: boolean;
    activeVideo?: HTMLVideoElement;
    standbyVideo?: HTMLVideoElement;
  } = {}
) {
  return {
    activeTarget: input.activeTarget ?? null,
    activeVideo: input.activeVideo ?? createVideo({ hidden: false, paused: input.activePaused ?? true }),
    disable: vi.fn(),
    primeActive: vi.fn(),
    prepareStandby: vi.fn(),
    commitStandby: vi.fn(),
    rollback: vi.fn(),
    playActiveUntilReady: vi.fn(),
    playStandbyUntilReady: vi.fn(),
    standbyVideo: input.standbyVideo ?? createVideo({ hidden: true, paused: true })
  };
}

function createVideo(input: { hidden: boolean; paused: boolean }) {
  return {
    currentTime: 0,
    duration: 180,
    hidden: input.hidden,
    muted: false,
    paused: input.paused,
    readyState: 4,
    src: "",
    addEventListener: vi.fn(),
    load: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(async () => {}),
    removeEventListener: vi.fn()
  };
}

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: 5,
    state: "playing",
    pairing: {
      roomSlug: "living-room",
      controllerUrl: "http://ktv.local/controller?room=living-room",
      qrPayload: "http://ktv.local/controller?room=living-room",
      token: "living-room.test",
      tokenExpiresAt: "2026-04-28T00:05:00.000Z"
    },
    currentTarget: {
      roomId: "living-room",
      sessionVersion: 5,
      queueEntryId: "queue-current",
      assetId: "asset-original",
      currentQueueEntryPreview: {
        queueEntryId: "queue-current",
        songTitle: "七里香",
        artistName: "周杰伦"
      },
      playbackUrl: "http://ktv.local/media/asset-original",
      resumePositionMs: 1234,
      vocalMode: "original",
      switchFamily: "family-main",
      nextQueueEntryPreview: null
    },
    switchTarget: switchTarget("instrumental"),
    targetVocalMode: "instrumental",
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides
  };
}

function switchTarget(vocalMode: "original" | "instrumental"): SwitchTarget {
  return {
    roomId: "living-room",
    sessionVersion: 5,
    queueEntryId: "queue-current",
    fromAssetId: vocalMode === "instrumental" ? "asset-original" : "asset-instrumental",
    toAssetId: vocalMode === "instrumental" ? "asset-instrumental" : "asset-original",
    playbackUrl: `http://ktv.local/media/${vocalMode === "instrumental" ? "asset-instrumental" : "asset-original"}`,
    switchFamily: "family-main",
    vocalMode,
    resumePositionMs: 1234,
    rollbackAssetId: vocalMode === "instrumental" ? "asset-original" : "asset-instrumental"
  };
}
