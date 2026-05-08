import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { PlayingScreen } from "../screens/PlayingScreen.js";
import { deriveTvDisplayState } from "../screens/tv-display-model.js";

describe("PlayingScreen", () => {
  it("shows the vocal mode and the mm:ss time pair", () => {
    const roomSnapshot = snapshot();
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

    expect(screen.getByText("播放中")).toBeTruthy();
    expect(screen.getByText("伴唱")).toBeTruthy();
    expect(screen.getByText("00:12 / 03:00")).toBeTruthy();
    expect(screen.getByText("下一首 - 歌手")).toBeTruthy();
  });

  it("shows an actionable first-play prompt when playback is blocked", () => {
    const roomSnapshot = snapshot({ state: "loading" });
    render(
      <PlayingScreen
        displayState={deriveTvDisplayState({
          errorMessage: null,
          firstPlayBlocked: true,
          snapshot: roomSnapshot,
          status: "ready"
        })}
        snapshot={roomSnapshot}
        playbackPositionMs={12_345}
        durationMs={180_000}
      />
    );

    expect(screen.getByText("点击电视开始播放")).toBeTruthy();
  });
});

function snapshot(): RoomSnapshot {
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
      nextQueueEntryPreview: {
        queueEntryId: "queue-next",
        songTitle: "下一首",
        artistName: "歌手"
      }
    },
    switchTarget: null,
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z"
  };
}
