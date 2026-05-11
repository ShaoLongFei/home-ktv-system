import type { CompatibilityReason, CompatibilityStatus, MediaInfoSummary, TrackRoles } from "@home-ktv/domain";

export interface EvaluateRealMvCompatibilityInput {
  summary: MediaInfoSummary;
  trackRoles: TrackRoles;
  currentWebCanPlayType: "" | "maybe" | "probably" | "unknown";
}

export interface EvaluateRealMvCompatibilityResult {
  compatibilityStatus: CompatibilityStatus;
  compatibilityReasons: CompatibilityReason[];
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
