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
    expect(screen.getByText(/浏览器需要一次点击授权播放声音/)).toBeTruthy();
  });

  it("keeps long song titles readable alongside the time text", () => {
    const longTitle = "这是一个非常非常长的中文歌名用来验证电视端不会重叠也不会把时间挤出屏幕 Long English Title Segment";
    const roomSnapshot = snapshot({
      currentTarget: {
        roomId: "living-room",
        sessionVersion: 4,
        queueEntryId: "queue-current",
        assetId: "asset-instrumental",
        currentQueueEntryPreview: {
          queueEntryId: "queue-current",
          songTitle: longTitle,
          artistName: "周杰伦"
        },
        nextQueueEntryPreview: {
          queueEntryId: "queue-next",
          songTitle: "下一首也是一个很长的歌名 Long Next Song",
          artistName: "歌手"
        },
        playbackUrl: "http://ktv.local/media/asset-instrumental",
        resumePositionMs: 12_345,
        vocalMode: "instrumental",
        switchFamily: "family-main"
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

    expect(screen.getByText(longTitle)).toBeTruthy();
    expect(screen.getAllByText("00:12 / 03:00").length).toBeGreaterThan(0);
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
      nextQueueEntryPreview: {
        queueEntryId: "queue-next",
        songTitle: "下一首",
        artistName: "歌手"
      }
    },
    switchTarget: null,
    conflict: null,
    notice: null,
    generatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides
  };
}
