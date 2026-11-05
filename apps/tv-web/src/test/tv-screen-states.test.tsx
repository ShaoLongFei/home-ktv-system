import { cleanup, render, screen } from "@testing-library/react";
import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { IdleScreen } from "../screens/IdleScreen.js";
import { PlayingScreen } from "../screens/PlayingScreen.js";
import { PlaybackStatusBanner } from "../components/PlaybackStatusBanner.js";
import { deriveTvDisplayState } from "../screens/tv-display-model.js";

afterEach(() => {
  cleanup();
});

describe("tv screen states", () => {
  it("renders the idle screen with the QR caption", () => {
    const roomSnapshot = snapshot({ state: "idle", currentTarget: null, switchTarget: null, targetVocalMode: null });

    render(
      <IdleScreen
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: false,
          snapshot: roomSnapshot,
          status: "ready"
        })}
        pairing={roomSnapshot.pairing}
      />
    );

    expect(screen.getByText("今晚开唱")).toBeTruthy();
    expect(screen.getByText("扫码或点击二维码进入点歌台")).toBeTruthy();
    expect(screen.getByLabelText("large pairing QR").parentElement?.style.background).toBe("rgba(255, 255, 255, 0.94)");
  });

  it("renders loading state copy in the playing screen", () => {
    const roomSnapshot = snapshot({ state: "loading" });

    render(
      <PlayingScreen
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: false,
          snapshot: roomSnapshot,
          status: "ready"
        })}
        snapshot={roomSnapshot}
        playbackPositionMs={12_345}
        durationMs={180_000}
      />
    );

    expect(screen.queryByText("准备中") ?? screen.getByText("正在准备播放")).toBeTruthy();
  });

  it("renders recovering state copy in the playing screen", () => {
    const roomSnapshot = snapshot({ state: "recovering" });

    render(
      <PlayingScreen
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: false,
          snapshot: roomSnapshot,
          status: "ready"
        })}
        snapshot={roomSnapshot}
        playbackPositionMs={12_345}
        durationMs={180_000}
      />
    );

    expect(screen.queryByText("恢复中") ?? screen.getByText("正在恢复播放")).toBeTruthy();
  });

  it("renders playback failed notice copy", () => {
    const roomSnapshot = snapshot({
      notice: {
        kind: "playback_failed_skipped",
        message: ""
      }
    });

    render(
      <PlayingScreen
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: false,
          snapshot: roomSnapshot,
          status: "ready"
        })}
        snapshot={roomSnapshot}
        playbackPositionMs={12_345}
        durationMs={180_000}
      />
    );

    expect(screen.getByText("当前歌曲播放失败，已切到下一首或返回空闲。")).toBeTruthy();
  });

  it("renders preprocessing notice copy for unsupported real MV playback failures", () => {
    const roomSnapshot = snapshot({
      notice: {
        kind: "playback_failed_skipped",
        message: "media-not-supported: preprocess required"
      }
    });

    render(
      <PlayingScreen
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: false,
          snapshot: roomSnapshot,
          status: "ready"
        })}
        snapshot={roomSnapshot}
        playbackPositionMs={12_345}
        durationMs={180_000}
      />
    );

    expect(screen.getByText("当前 MV 暂不可播放，请先预处理后再重试。")).toBeTruthy();
  });

  it("renders same-file switch failure notice copy", () => {
    const roomSnapshot = snapshot({
      notice: {
        kind: "switch_failed_reverted",
        message: "current device does not support audio-track switching"
      }
    });

    render(
      <PlayingScreen
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: false,
          snapshot: roomSnapshot,
          status: "ready"
        })}
        snapshot={roomSnapshot}
        playbackPositionMs={12_345}
        durationMs={180_000}
      />
    );

    expect(screen.getByText("原唱/伴唱切换失败，已保持当前播放。")).toBeTruthy();
  });

  it("renders recovery fallback notice copy", () => {
    const roomSnapshot = snapshot({
      notice: {
        kind: "recovery_fallback_start_over",
        message: ""
      }
    });

    render(
      <PlayingScreen
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: false,
          snapshot: roomSnapshot,
          status: "ready"
        })}
        snapshot={roomSnapshot}
        playbackPositionMs={12_345}
        durationMs={180_000}
      />
    );

    expect(screen.getByText("已恢复播放，本首从头开始")).toBeTruthy();
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
      roomSlug: "living-room",
      controllerUrl: "http://ktv.local/controller",
      qrPayload: "http://ktv.local/controller",
      token: "living-room.test",
      tokenExpiresAt: "2026-04-28T00:05:00.000Z"
    },
    currentTarget: {
      roomId: "living-room",
      sessionVersion: 4,
      queueEntryId: "queue-current",
      sourceType: "nas",
      songId: "song-current",
      assetId: "asset-instrumental",
      currentQueueEntryPreview: {
        queueEntryId: "queue-current",
        songTitle: "七里香",
        artistName: "周杰伦"
      },
      playbackUrl: "http://ktv.local/media/asset-instrumental",
      resumePositionMs: 12_345,
      vocalMode: "instrumental",
      selectedTrackRef: { index: 1, id: "0x1101", label: "Instrumental" },
      switchFamily: "family-main",
      nextQueueEntryPreview: null
    },
    switchTarget: null,
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides
  };
}
