import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE,
  inspectCurrentWebPlaybackProfile
} from "../runtime/playback-capability.js";

describe("inspectCurrentWebPlaybackProfile", () => {
  it("reports canPlayType, MediaCapabilities support, and audioTracks availability", async () => {
    const video = createFakeVideo({ canPlayTypeResult: "probably", hasAudioTracksApi: true });
    const mediaCapabilities = {
      decodingInfo: vi.fn(async () => ({ supported: true }))
    } as unknown as MediaCapabilities;

    const result = await inspectCurrentWebPlaybackProfile({
      contentType: "video/x-matroska",
      createVideoElement: () => video,
      mediaCapabilities,
      decodingConfig: { type: "file", video: { contentType: "video/x-matroska" } } as MediaDecodingConfiguration
    });

    expect(result).toEqual({
      canPlayType: "probably",
      mediaCapabilitiesSupported: true,
      hasAudioTracksApi: true,
      audioTrackSwitchMessage: null
    });
    expect(mediaCapabilities.decodingInfo).toHaveBeenCalledTimes(1);
  });

  it("returns the unsupported switching message when audioTracks is unavailable", async () => {
    const result = await inspectCurrentWebPlaybackProfile({
      contentType: "video/mpeg",
      createVideoElement: () => createFakeVideo({ canPlayTypeResult: "maybe", hasAudioTracksApi: false }),
      mediaCapabilities: null
    });

    expect(result).toMatchObject({
      canPlayType: "maybe",
      mediaCapabilitiesSupported: "unavailable",
      hasAudioTracksApi: false,
      audioTrackSwitchMessage: AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE
    });
  });

  it("does not mutate or control the active video element", async () => {
    const video = createFakeVideo({ canPlayTypeResult: "", hasAudioTracksApi: false });

    await inspectCurrentWebPlaybackProfile({
      contentType: "video/mp4",
      createVideoElement: () => video
    });

    expect(video.load).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
  });
});

function createFakeVideo(input: { canPlayTypeResult: "" | "maybe" | "probably"; hasAudioTracksApi: boolean }): HTMLVideoElement {
  const video = {
    canPlayType: vi.fn(() => input.canPlayTypeResult),
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn()
  } as unknown as HTMLVideoElement;

  if (input.hasAudioTracksApi) {
    Object.defineProperty(video, "audioTracks", {
      value: [],
      configurable: true
    });
  }

  return video;
}
