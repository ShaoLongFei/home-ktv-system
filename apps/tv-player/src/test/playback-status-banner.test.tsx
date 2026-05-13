import { cleanup, render, screen } from "@testing-library/react";
import type { PlaybackNotice } from "@home-ktv/player-contracts";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackStatusBanner } from "../components/PlaybackStatusBanner.js";

afterEach(() => {
  cleanup();
});

describe("PlaybackStatusBanner", () => {
  it("shows fallback copy for failed playback skip notices", () => {
    const notice: PlaybackNotice = {
      kind: "playback_failed_skipped",
      message: ""
    };

    render(<PlaybackStatusBanner notice={notice} />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("当前歌曲播放失败，已切到下一首或返回空闲。")).toBeTruthy();
  });

  it("shows fallback copy for reverted switch notices", () => {
    const notice: PlaybackNotice = {
      kind: "switch_failed_reverted",
      message: ""
    };

    render(<PlaybackStatusBanner notice={notice} />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("原唱/伴唱切换失败，已保持当前播放。")).toBeTruthy();
  });
});
