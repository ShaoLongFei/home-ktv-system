import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { describe, expect, it } from "vitest";
import {
  deriveTvDisplayState,
  firstPlayPromptCopy,
  formatPlaybackClock,
  noticeCopyFor
} from "../screens/tv-display-model.js";

describe("tv display model", () => {
  it("formats playback clocks with an unknown-duration fallback", () => {
    expect(formatPlaybackClock(12_345, 180_000)).toBe("00:12 / 03:00");
    expect(formatPlaybackClock(12_345, null)).toBe("00:12 / --:--");
  });

  it("exposes Chinese first-play and notice copy", () => {
    expect(firstPlayPromptCopy.heading).toBe("点击电视开始播放");
    expect(firstPlayPromptCopy.body).toContain("浏览器需要一次点击授权播放声音");
    expect(noticeCopyFor({ kind: "playback_failed_skipped", message: "" })).toBe("当前歌曲播放失败，已切到下一首或返回空闲。");
    expect(noticeCopyFor({ kind: "switch_failed_reverted", message: "" })).toBe("原唱/伴唱切换失败，已保持当前播放。");
  });

  it("derives booting and offline states without exposing raw errors as headings", () => {
    expect(
      deriveTvDisplayState({
        errorMessage: null,
        firstPlayBlocked: false,
        snapshot: null,
        status: "booting"
      })
    ).toMatchObject({
      heading: "正在启动电视端",
      kind: "booting"
    });

    const offlineState = deriveTvDisplayState({
      errorMessage: "TV player request failed: 500",
      firstPlayBlocked: false,
      snapshot: null,
      status: "error"
    });

    expect(offlineState.kind).toBe("offline");
    expect(offlineState.heading).toBe("电视端离线");
    expect(offlineState.heading).not.toContain("500");
  });

  it("derives conflict and first-play prompt states from snapshots", () => {
    expect(
      deriveTvDisplayState({
        errorMessage: null,
        firstPlayBlocked: false,
        snapshot: snapshot({
          conflict: {
            activeDeviceId: "tv-active",
            activeDeviceName: "Living Room TV",
            kind: "active-player-conflict",
            message: "active player exists",
            reason: "active-player-exists",
            roomId: "living-room"
          },
          state: "conflict"
        }),
        status: "ready"
      }).kind
    ).toBe("conflict");

    expect(
      deriveTvDisplayState({
        errorMessage: null,
        firstPlayBlocked: true,
        snapshot: snapshot({ state: "playing" }),
        status: "ready"
      }).firstPlayPrompt.visible
    ).toBe(true);
  });
});

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    type: "room.snapshot",
    roomId: "living-room",
    roomSlug: "living-room",
    sessionVersion: 4,
    state: "playing",
    pairing: {
      controllerUrl: "http://ktv.local/controller?room=living-room",
      qrPayload: "http://ktv.local/controller?room=living-room",
      roomSlug: "living-room",
      token: "living-room.test",
      tokenExpiresAt: "2026-04-28T00:05:00.000Z"
    },
    currentTarget: {
      assetId: "asset-instrumental",
      currentQueueEntryPreview: {
        artistName: "周杰伦",
        queueEntryId: "queue-current",
        songTitle: "七里香"
      },
      nextQueueEntryPreview: null,
      playbackUrl: "http://ktv.local/media/asset-instrumental",
      queueEntryId: "queue-current",
      resumePositionMs: 12_345,
      roomId: "living-room",
      sessionVersion: 4,
      switchFamily: "family-main",
      vocalMode: "instrumental"
    },
    switchTarget: null,
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides
  };
}
