import type {
  AudioTrackSummary,
  CompatibilityReason,
  CompatibilityStatus,
  MediaInfoSummary,
  PlaybackProfile,
  TrackRef,
  TrackRoles
} from "@home-ktv/domain";

export interface EvaluateRealMvCompatibilityInput {
  summary: MediaInfoSummary;
  trackRoles: TrackRoles;
  currentWebCanPlayType: "" | "maybe" | "probably" | "unknown";
}

export interface EvaluateRealMvCompatibilityResult {
  compatibilityStatus: CompatibilityStatus;
  compatibilityReasons: CompatibilityReason[];
}

export interface InferTrackRolesFromRealMvInput {
  mediaInfoSummary: MediaInfoSummary;
  sidecarTrackRoles?: {
    original?: number | string;
    instrumental?: number | string;
  };
}

export function evaluateRealMvCompatibility(input: EvaluateRealMvCompatibilityInput): EvaluateRealMvCompatibilityResult {
  const compatibilityReasons: CompatibilityReason[] = [];

  if (input.summary.videoCodec === null) {
    compatibilityReasons.push({
      code: "missing-video-codec",
      severity: "error",
      message: "Video codec is missing",
      source: "probe"
    });
  }

  if (input.summary.audioTracks.length === 0) {
    compatibilityReasons.push({
      code: "missing-audio-tracks",
      severity: "error",
      message: "No audio tracks were detected",
      source: "probe"
    });
  }

  if (input.trackRoles.instrumental === null) {
    compatibilityReasons.push({
      code: "instrumental-track-unmapped",
      severity: "warning",
      message: "Instrumental track needs review",
      source: "review"
    });
  }

  if (input.currentWebCanPlayType === "") {
    compatibilityReasons.push({
      code: "browser-cannot-play-type",
      severity: "error",
      message: "Current TV browser reports the media type unsupported",
      source: "runtime_spike"
    });
  }

  if (compatibilityReasons.some((reason) => reason.severity === "error")) {
    return { compatibilityStatus: "unsupported", compatibilityReasons };
  }

  if (compatibilityReasons.length > 0 || input.currentWebCanPlayType !== "probably") {
    return { compatibilityStatus: "review_required", compatibilityReasons };
  }

  return { compatibilityStatus: "playable", compatibilityReasons };
}

export function inferTrackRolesFromRealMv(input: InferTrackRolesFromRealMvInput): TrackRoles {
  const tracks = input.mediaInfoSummary.audioTracks;
  return {
    original: resolveTrackRole(tracks, input.sidecarTrackRoles?.original, /(?:original|vocals?|原唱)/iu),
    instrumental: resolveTrackRole(tracks, input.sidecarTrackRoles?.instrumental, /(?:instrumental|karaoke|accompaniment|伴奏|伴唱)/iu)
  };
}

export function buildSingleFileAudioTrackPlaybackProfile(mediaInfoSummary: MediaInfoSummary): PlaybackProfile {
  return {
    kind: "single_file_audio_tracks",
    container: mediaInfoSummary.container,
    videoCodec: mediaInfoSummary.videoCodec,
    audioCodecs: Array.from(new Set(mediaInfoSummary.audioTracks
      .map((track) => track.codec)
      .filter((codec): codec is string => typeof codec === "string" && codec.length > 0))),
    requiresAudioTrackSelection: mediaInfoSummary.audioTracks.length >= 2
  };
}

function resolveTrackRole(
  tracks: readonly AudioTrackSummary[],
  sidecarHint: number | string | undefined,
  labelPattern: RegExp
): TrackRef | null {
  const sidecarMatch = sidecarHint !== undefined ? findTrackBySidecarHint(tracks, sidecarHint) : null;
  if (sidecarMatch) {
    return toTrackRef(sidecarMatch);
  }

  const labelMatch = tracks.find((track) => labelPattern.test(track.label));
  return labelMatch ? toTrackRef(labelMatch) : null;
}

function findTrackBySidecarHint(
  tracks: readonly AudioTrackSummary[],
  sidecarHint: number | string
): AudioTrackSummary | null {
  if (typeof sidecarHint === "number") {
    return tracks.find((track) => track.index === sidecarHint) ?? null;
  }

  const normalized = sidecarHint.trim().toLocaleLowerCase();
  return tracks.find((track) => (
    track.id.toLocaleLowerCase() === normalized ||
    track.label.toLocaleLowerCase() === normalized
  )) ?? null;
}

function toTrackRef(track: AudioTrackSummary): TrackRef {
  return {
    index: track.index,
    id: track.id,
    label: track.label
  };
}
