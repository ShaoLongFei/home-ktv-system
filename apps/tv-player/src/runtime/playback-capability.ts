export const AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE = "current device does not support audio-track switching";

export interface CurrentWebPlaybackProfileInspection {
  canPlayType: "" | "maybe" | "probably";
  mediaCapabilitiesSupported: boolean | "unavailable";
  hasAudioTracksApi: boolean;
  audioTrackSwitchMessage: string | null;
}

export async function inspectCurrentWebPlaybackProfile(input: {
  contentType: string;
  createVideoElement?: () => HTMLVideoElement;
  mediaCapabilities?: MediaCapabilities | null;
  decodingConfig?: MediaDecodingConfiguration;
}): Promise<CurrentWebPlaybackProfileInspection> {
  const video = input.createVideoElement?.() ?? document.createElement("video");
  const canPlayType = video.canPlayType(input.contentType) as "" | "maybe" | "probably";
  const hasAudioTracksApi = "audioTracks" in video;
  const mediaCapabilitiesSupported = input.mediaCapabilities && input.decodingConfig
    ? (await input.mediaCapabilities.decodingInfo(input.decodingConfig)).supported
    : "unavailable";

  return {
    canPlayType,
    mediaCapabilitiesSupported,
    hasAudioTracksApi,
    audioTrackSwitchMessage: hasAudioTracksApi ? null : AUDIO_TRACK_SWITCH_UNSUPPORTED_MESSAGE
  };
}
