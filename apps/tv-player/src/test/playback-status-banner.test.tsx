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
    expect(screen.getByText("播放失败，已跳到下一首")).toBeTruthy();
  });

  it("shows fallback copy for reverted switch notices", () => {
    const notice: PlaybackNotice = {
      kind: "switch_failed_reverted",
      message: ""
    };

    render(<PlaybackStatusBanner notice={notice} />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("切换失败，已恢复到原模式")).toBeTruthy();
  });
});
