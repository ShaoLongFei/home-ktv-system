import type { MediaInfoSummary, TrackRoles } from "@home-ktv/domain";
import { inferVideoContentType } from "../modules/assets/asset-gateway.js";
import { buildMediaInfoSummaryFromFfprobe } from "../modules/ingest/media-probe.js";
import {
  buildSingleFileAudioTrackPlaybackProfile,
  evaluateRealMvCompatibility,
  inferTrackRolesFromRealMv
} from "../modules/media/real-mv-compatibility.js";
import { describe, expect, it } from "vitest";

describe("real MV media contracts", () => {
  it("normalizes ffprobe streams and format into MediaInfo summary and provenance", () => {
    const result = buildMediaInfoSummaryFromFfprobe({
      filePath: "jay/qilixiang.mkv",
      fileSizeBytes: 104857600,
      probedAt: "2026-05-11T08:10:00.000Z",
      sourceVersion: "8.1",
      payload: {
        format: {
          duration: "60.041",
          format_name: "matroska,webm"
        },
        streams: [
          {
            index: 0,
            id: "0x1100",
            codec_type: "audio",
            codec_name: "aac",
            channels: 2,
            tags: { title: "Original vocal", language: "zh" }
          },
          {
            index: 1,
            codec_type: "audio",
            codec_name: "aac",
            channels: 2,
            tags: { handler_name: "Instrumental" }
          },
          {
            index: 2,
            codec_type: "video",
            codec_name: "h264",
            width: 1920,
            height: 1080
          }
        ]
      }
    });

    expect(result.mediaInfoSummary).toEqual({
      container: "matroska,webm",
      durationMs: 60041,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 104857600,
      audioTracks: [
        { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
        { index: 1, id: "stream-1", label: "Instrumental", language: null, codec: "aac", channels: 2 }
      ]
    });
    expect(result.mediaInfoProvenance).toEqual({
      source: "ffprobe",
      sourceVersion: "8.1",
      probedAt: "2026-05-11T08:10:00.000Z",
      importedFrom: "jay/qilixiang.mkv"
    });
  });

  it("infers explicit content types for MKV, MPG, and MPEG", () => {
    expect(inferVideoContentType("video/demo.mkv")).toBe("video/x-matroska");
    expect(inferVideoContentType("video/demo.mpg")).toBe("video/mpeg");
    expect(inferVideoContentType("video/demo.mpeg")).toBe("video/mpeg");
    expect(inferVideoContentType("video/demo.mp4")).toBe("video/mp4");
  });

  it("marks unsupported when the current browser cannot play the media type", () => {
    const result = evaluateRealMvCompatibility({
      summary: createMediaInfoSummary(),
      trackRoles: createTrackRoles(),
      currentWebCanPlayType: ""
    });

    expect(result.compatibilityStatus).toBe("unsupported");
    expect(result.compatibilityReasons).toContainEqual(
      expect.objectContaining({
        code: "browser-cannot-play-type",
        severity: "error",
        source: "runtime_spike"
      })
    );
  });

  it("requires review when the instrumental track is unmapped", () => {
    const result = evaluateRealMvCompatibility({
      summary: createMediaInfoSummary(),
      trackRoles: { ...createTrackRoles(), instrumental: null },
      currentWebCanPlayType: "probably"
    });

    expect(result.compatibilityStatus).toBe("review_required");
    expect(result.compatibilityReasons).toContainEqual(
      expect.objectContaining({
        code: "instrumental-track-unmapped",
        severity: "warning",
        source: "review"
      })
    );
  });

  it("infers original and instrumental roles from audio track labels", () => {
    expect(inferTrackRolesFromRealMv({ mediaInfoSummary: createMediaInfoSummary() })).toEqual(createTrackRoles());
  });

  it("leaves unlabeled audio track roles unmapped and review-required", () => {
    const summary = createMediaInfoSummary({
      audioTracks: [
        { index: 0, id: "0x1100", label: "Audio 1", language: "zh", codec: "aac", channels: 2 },
        { index: 1, id: "0x1101", label: "Audio 2", language: "zh", codec: "mp2", channels: 2 }
      ]
    });
    const trackRoles = inferTrackRolesFromRealMv({ mediaInfoSummary: summary });

    expect(trackRoles).toEqual({ original: null, instrumental: null });
    expect(evaluateRealMvCompatibility({
      summary,
      trackRoles,
      currentWebCanPlayType: "unknown"
    }).compatibilityStatus).toBe("review_required");
  });

  it("builds a single-file audio-track playback profile from MediaInfo", () => {
    expect(buildSingleFileAudioTrackPlaybackProfile(createMediaInfoSummary())).toEqual({
      kind: "single_file_audio_tracks",
      container: "matroska,webm",
      videoCodec: "h264",
      audioCodecs: ["aac"],
      requiresAudioTrackSelection: true
    });
  });

  it("keeps unknown scanner runtime support review-required instead of playable", () => {
    const result = evaluateRealMvCompatibility({
      summary: createMediaInfoSummary(),
      trackRoles: createTrackRoles(),
      currentWebCanPlayType: "unknown"
    });

    expect(result.compatibilityStatus).toBe("review_required");
  });

  it("returns playable only when no warnings or errors remain and browser support is probable", () => {
    const result = evaluateRealMvCompatibility({
      summary: createMediaInfoSummary(),
      trackRoles: createTrackRoles(),
      currentWebCanPlayType: "probably"
    });

    expect(result).toEqual({
      compatibilityStatus: "playable",
      compatibilityReasons: []
    });
  });
});

function createMediaInfoSummary(overrides: Partial<MediaInfoSummary> = {}): MediaInfoSummary {
  return {
    container: "matroska,webm",
    durationMs: 60041,
    videoCodec: "h264",
    resolution: { width: 1920, height: 1080 },
    fileSizeBytes: 104857600,
    audioTracks: [
      { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
      { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
    ],
    ...overrides
  };
}

function createTrackRoles(): TrackRoles {
  return {
    original: { index: 0, id: "0x1100", label: "Original vocal" },
    instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
  };
}
