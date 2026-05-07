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
    expect(screen.getByText("Playback failed. Skipped to the next song.")).toBeTruthy();
  });
});
