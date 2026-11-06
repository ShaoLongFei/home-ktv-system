import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RoomSnapshot } from "@home-ktv/player-contracts";
import { PlayingScreen } from "../screens/PlayingScreen.js";
import { deriveTvDisplayState } from "../screens/tv-display-model.js";
import { tvTheme } from "../theme.js";

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
    // 布局改成三行后不再显示音轨序号，改为显示歌名
    expect(screen.getByText("七里香")).toBeTruthy();
    expect(screen.queryByText("Instrumental")).toBeNull();
    expect(screen.getByText("00:12 / 03:00")).toBeTruthy();
    expect(screen.getByLabelText("corner pairing QR")).toBeTruthy();
  });

  it("shows the requester avatar and nickname while playing", () => {
    const roomSnapshot = snapshot({
      currentTarget: {
        ...snapshot().currentTarget!,
        currentQueueEntryPreview: {
          queueEntryId: "queue-current",
          songTitle: "七里香",
          artistName: "周杰伦",
          requestedByName: "阿飞",
          requestedByUserPhone: "13800138000"
        }
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

    expect(screen.getByLabelText("点歌人 阿飞")).toBeTruthy();
    expect(screen.getByText("阿")).toBeTruthy();
    expect(screen.getByText("阿飞")).toBeTruthy();
  });

  it("keeps the lower-left playback HUD width adaptive with one-line requester text", () => {
    const requesterName = "龙飞和朋友们一起点的歌";
    const roomSnapshot = snapshot({
      currentTarget: {
        ...snapshot().currentTarget!,
        currentQueueEntryPreview: {
          queueEntryId: "queue-current",
          songTitle: "七里香",
          artistName: "周杰伦",
          requestedByName: requesterName,
          requestedByUserPhone: "13800138000"
        }
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

    const requester = screen.getByLabelText(`点歌人 ${requesterName}`);
    const footer = requester.closest("footer");
    expect(footer).toBeTruthy();
    if (!footer) {
      throw new Error("Playback footer not found");
    }
    expect(footer.style.left).toBe("14px");
    expect(footer.style.bottom).toBe("14px");
    expect(footer.style.padding).toBe("10px 14px 11px");
    expect(footer.style.gap).toBe("6px");
    expect(footer.style.width).toBe("max-content");
    expect(footer.style.maxWidth).toContain("calc(100vw - 28px)");
    expect(requester.style.width).toBe("100%");
    expect(screen.getByText(requesterName).style.maxWidth).toBe("5.5em");
    expect(screen.getByText(requesterName).style.fontSize).toBe("14px");
    expect(screen.getByText(requesterName).style.whiteSpace).toBe("nowrap");
    expect(screen.getByText(requesterName).style.textOverflow).toBe("ellipsis");
  });

  it("uses the approved success color for active playback state", () => {
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

    expect(screen.getAllByText("播放中")[0]?.style.color).toBe(tvTheme.colors.success);
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

  it("keeps the playback HUD readable without placing titles over the MV", () => {
    const longTitle = "这是一个非常非常长的中文歌名用来验证电视端不会重叠也不会把时间挤出屏幕 Long English Title Segment";
    const roomSnapshot = snapshot({
      currentTarget: {
        roomId: "living-room",
        sessionVersion: 4,
        queueEntryId: "queue-current",
        sourceType: "nas",
        songId: "song-current",
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
        selectedTrackRef: { index: 1, id: "0x1101", label: "Instrumental" },
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

    // 歌名靠 ellipsis 截断，但文本仍然在 DOM 里
    expect(screen.getAllByText(longTitle).length).toBeGreaterThan(0);
    expect(screen.getAllByText("00:12 / 03:00").length).toBeGreaterThan(0);
    expect(screen.queryByText("Instrumental")).toBeNull();
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
