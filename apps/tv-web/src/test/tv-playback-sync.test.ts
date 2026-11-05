import { describe, expect, it, vi } from "vitest";
import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { synchronizePlayback } from "../runtime/use-tv-playback-runtime.js";
import type { DualVideoPool, KtvVideoElement } from "../runtime/video-pool.js";

function createVideo(): KtvVideoElement & { pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> } {
  return {
    currentTime: 42,
    duration: 200,
    hidden: false,
    muted: false,
    paused: false,
    readyState: 4,
    src: "http://ktv.local/media/nas/a",
    volume: 0.5,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    load: () => undefined,
    pause: vi.fn(),
    play: vi.fn(async () => undefined)
  } as never;
}

function createSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: 3,
    state: "playing",
    pairing: {
      roomSlug: "living-room",
      token: "t",
      tokenExpiresAt: "2026-01-01T00:00:00.000Z",
      controllerUrl: "/controller?token=t",
      qrPayload: "/controller?token=t"
    },
    currentTarget: {
      roomId: "living-room",
      sessionVersion: 3,
      queueEntryId: "queue-1",
      sourceType: "nas",
      songId: "song-1",
      assetId: "asset-1",
      currentQueueEntryPreview: {
        queueEntryId: "queue-1",
        songTitle: "孤勇者",
        artistName: "腾格尔",
        requestedByName: null,
        requestedByUserPhone: null
      },
      playbackUrl: "http://ktv.local/media/nas/asset-1",
      resumePositionMs: 42000,
      vocalMode: "instrumental",
      switchFamily: null,
      playbackProfile: null,
      selectedTrackRef: null,
      nextQueueEntryPreview: null
    },
    switchTarget: null,
    targetVocalMode: "instrumental",
    conflict: null,
    notice: null,
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  } as RoomSnapshot;
}

function createInput(snapshot: RoomSnapshot, replayToken: string | null) {
  const video = createVideo();
  const pool = { activeVideo: video, applyVolume: vi.fn() } as unknown as DualVideoPool;
  const replayTokenRef = { current: replayToken };
  return {
    video,
    replayTokenRef,
    input: {
      client: {} as never,
      pool,
      snapshot,
      setConfirmedPlaybackTargetKey: vi.fn(),
      setFirstPlayBlocked: vi.fn(),
      sentPlaybackTelemetryRef: { current: new Set<string>() },
      setLocalNotice: vi.fn(),
      switchInFlightRef: { current: false },
      replayTokenRef
    }
  };
}

describe("synchronizePlayback pause and replay", () => {
  it("pauses the active video when the snapshot reports playbackPaused", async () => {
    const { video, input } = createInput(createSnapshot({ playbackPaused: true }), "0");

    await synchronizePlayback(input as never);

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("seeks to zero and resumes when replayToken changes", async () => {
    const { video, input, replayTokenRef } = createInput(createSnapshot({ replayToken: "2" }), "1");

    await synchronizePlayback(input as never);

    expect(video.currentTime).toBe(0);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(replayTokenRef.current).toBe("2");
  });
});
