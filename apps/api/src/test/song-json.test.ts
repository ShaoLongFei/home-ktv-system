import type { MediaInfoSummary, PlaybackProfile, SongStatus, TrackRoles } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import type { SongJsonDocument } from "../modules/catalog/song-json.js";

describe("SongJsonDocument", () => {
  it("types single real MV assets with durable catalog fields", () => {
    const audioTracks = [
      { index: 0, id: "0x1100", label: "Original", language: "jpn", codec: "aac", channels: 2 },
      { index: 1, id: "0x1101", label: "Instrumental", language: "jpn", codec: "aac", channels: 2 }
    ] as const;
    const mediaInfoSummary: MediaInfoSummary = {
      container: "matroska",
      durationMs: 180000,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 123456,
      audioTracks
    };
    const trackRoles: TrackRoles = {
      original: audioTracks[0],
      instrumental: audioTracks[1]
    };
    const playbackProfile: PlaybackProfile = {
      kind: "single_file_audio_tracks",
      container: "matroska",
      videoCodec: "h264",
      audioCodecs: ["aac"],
      requiresAudioTrackSelection: true
    };

    const document = {
      title: "Real MV",
      artistName: "Artist",
      language: "mandarin",
      status: "review_required" satisfies SongStatus,
      coverPath: "cover.jpg",
      assets: [
        {
          id: "asset-real-mv",
          filePath: "real-mv.mkv",
          vocalMode: "dual",
          assetKind: "dual-track-video",
          status: "promoted",
          durationMs: 180000,
          switchFamily: null,
          switchQualityStatus: "review_required",
          compatibilityStatus: "review_required",
          compatibilityReasons: [
            {
              code: "runtime-unverified",
              severity: "warning",
              message: "Runtime switching is not verified yet",
              source: "review"
            }
          ],
          mediaInfoSummary,
          mediaInfoProvenance: {
            source: "ffprobe",
            sourceVersion: "8.1",
            probedAt: "2026-05-13T00:00:00.000Z",
            importedFrom: "imports/real-mv.mkv"
          },
          trackRoles,
          playbackProfile,
          container: "matroska",
          videoCodec: "h264",
          audioCodecs: ["aac"]
        }
      ]
    } satisfies SongJsonDocument;

    expect(document.coverPath).toBe("cover.jpg");
    expect(document.assets[0]?.playbackProfile.kind).toBe("single_file_audio_tracks");
  });
});
