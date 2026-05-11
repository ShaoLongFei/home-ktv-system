import type { MediaInfoSummary, TrackRoles } from "@home-ktv/domain";
import { inferVideoContentType } from "../modules/assets/asset-gateway.js";
import { buildMediaInfoSummaryFromFfprobe } from "../modules/ingest/media-probe.js";
import { evaluateRealMvCompatibility } from "../modules/media/real-mv-compatibility.js";
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

function createMediaInfoSummary(): MediaInfoSummary {
  return {
    container: "matroska,webm",
    durationMs: 60041,
    videoCodec: "h264",
    resolution: { width: 1920, height: 1080 },
    fileSizeBytes: 104857600,
    audioTracks: [
      { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
      { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
    ]
  };
}

function createTrackRoles(): TrackRoles {
  return {
    original: { index: 0, id: "0x1100", label: "Original vocal" },
    instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
  };
}
