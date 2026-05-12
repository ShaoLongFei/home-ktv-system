import { cleanup, render, screen } from "@testing-library/react";
import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { ConflictScreen } from "../screens/ConflictScreen.js";
import { IdleScreen } from "../screens/IdleScreen.js";
import { PlayingScreen } from "../screens/PlayingScreen.js";
import { PlaybackStatusBanner } from "../components/PlaybackStatusBanner.js";
import { deriveTvDisplayState } from "../screens/tv-display-model.js";
import { tvTheme } from "../theme.js";

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

    expect(screen.getByText("扫码点歌")).toBeTruthy();
    expect(screen.getByText("手机扫码点歌")).toBeTruthy();
    expect(screen.getByLabelText("large pairing QR").parentElement?.style.background).toBe(tvTheme.colors.surface);
  });

  it("renders the conflict screen with the active device name", () => {
    const roomSnapshot = snapshot({
      conflict: {
        activeDeviceId: "tv-active",
        activeDeviceName: "Living Room TV",
        kind: "active-player-conflict",
        message: "active player exists",
        reason: "active-player-exists",
        roomId: "living-room"
      },
      state: "conflict"
    });

    render(
      <ConflictScreen
        conflict={roomSnapshot.conflict!}
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: false,
          snapshot: roomSnapshot,
          status: "ready"
        })}
      />
    );

    expect(screen.getByText("已有电视端在线")).toBeTruthy();
    expect(screen.getByText(/Living Room TV/)).toBeTruthy();
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

    expect(screen.getByText("播放失败，已跳到下一首")).toBeTruthy();
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
      controllerUrl: "http://ktv.local/controller?room=living-room",
      qrPayload: "http://ktv.local/controller?room=living-room",
      token: "living-room.test",
      tokenExpiresAt: "2026-04-28T00:05:00.000Z"
    },
    currentTarget: {
      roomId: "living-room",
      sessionVersion: 4,
      queueEntryId: "queue-current",
      assetId: "asset-instrumental",
      currentQueueEntryPreview: {
        queueEntryId: "queue-current",
        songTitle: "七里香",
        artistName: "周杰伦"
      },
      playbackUrl: "http://ktv.local/media/asset-instrumental",
      resumePositionMs: 12_345,
      vocalMode: "instrumental",
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
