import type {
  Asset,
  CompatibilityStatus,
  ImportCandidateFile,
  MediaInfoSummary,
  PlaybackProfile,
  TrackRoles
} from "@home-ktv/domain";
import { describe, expect, it } from "vitest";

const compatibilityStatuses = [
  "unknown",
  "review_required",
  "playable",
  "unsupported"
] as const satisfies readonly CompatibilityStatus[];

const trackRoles: TrackRoles = {
  original: { index: 0, id: "0x1100", label: "Original vocal" },
  instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
};

const mediaInfoSummary: MediaInfoSummary = {
  container: "matroska,webm",
  durationMs: 60000,
  videoCodec: "h264",
  resolution: { width: 1920, height: 1080 },
  fileSizeBytes: 104857600,
  audioTracks: [
    { index: 0, id: "0x1100", label: "Original vocal", language: "zh", codec: "aac", channels: 2 },
    { index: 1, id: "0x1101", label: "Instrumental", language: "zh", codec: "aac", channels: 2 }
  ]
};

const playbackProfile: PlaybackProfile = {
  kind: "single_file_audio_tracks",
  container: "matroska,webm",
  videoCodec: "h264",
  audioCodecs: ["aac"],
  requiresAudioTrackSelection: true
};

describe("real MV domain contracts", () => {
  it("exports the exact compatibility status values", () => {
    expect(compatibilityStatuses).toEqual(["unknown", "review_required", "playable", "unsupported"]);
  });

  it("models media facts and platform-neutral playback profile", () => {
    expect(trackRoles.original).toMatchObject({ index: 0, id: "0x1100", label: "Original vocal" });
    expect(mediaInfoSummary).toMatchObject({
      container: "matroska,webm",
      durationMs: 60000,
      videoCodec: "h264",
      resolution: { width: 1920, height: 1080 },
      fileSizeBytes: 104857600
    });
    expect(mediaInfoSummary.audioTracks).toHaveLength(2);
    const serializedProfile = JSON.stringify(playbackProfile).toLowerCase();
    for (const forbidden of ["android", "ex" + "o", "media" + "3"]) {
      expect(serializedProfile).not.toContain(forbidden);
    }
  });

  it("keeps candidate metadata serialization platform-neutral", () => {
    const candidateMetaFixture = {
      realMv: {
        playbackProfile,
        trackRoles,
        admissionPolicy: {
          mode: "review_first",
          reservedAutoAdmit: {
            reserved: true,
            eligible: true,
            reasons: []
          }
        }
      }
    };

    const serializedCandidateMeta = JSON.stringify(candidateMetaFixture).toLowerCase();
    for (const forbidden of ["android", "exo", "media3"]) {
      expect(serializedCandidateMeta).not.toContain(forbidden);
    }
  });

  it("models one physical real-MV file as one asset with trackRoles", () => {
    const assets: Asset[] = [
      {
        id: "asset-real-mv",
        songId: "song-real-mv",
        sourceType: "local",
        assetKind: "dual-track-video",
        displayName: "七里香",
        filePath: "jay/qilixiang.mkv",
        durationMs: 60000,
        lyricMode: "hard_sub",
        vocalMode: "dual",
        status: "ready",
        switchFamily: null,
        switchQualityStatus: "review_required",
        compatibilityStatus: "review_required",
        compatibilityReasons: [],
        mediaInfoSummary,
        mediaInfoProvenance: {
          source: "ffprobe",
          sourceVersion: "8.1",
          probedAt: "2026-05-11T00:00:00.000Z",
          importedFrom: "jay/qilixiang.mkv"
        },
        trackRoles,
        playbackProfile,
        createdAt: "2026-05-11T00:00:00.000Z",
        updatedAt: "2026-05-11T00:00:00.000Z"
      }
    ];

    expect(assets).toHaveLength(1);
    expect(assets[0]?.trackRoles?.instrumental?.index).toBe(1);
  });

  it("lets import candidate files carry normalized real-MV fields before admission", () => {
    const candidateFile = {
      id: "candidate-file-real-mv",
      candidateId: "candidate-real-mv",
      importFileId: "import-file-real-mv",
      selected: true,
      proposedVocalMode: "dual",
      proposedAssetKind: "dual-track-video",
      roleConfidence: 0.8,
      probeDurationMs: 60000,
      probeSummary: { mediaInfoSummary },
      compatibilityStatus: "review_required",
      compatibilityReasons: [],
      mediaInfoSummary,
      mediaInfoProvenance: {
        source: "ffprobe",
        sourceVersion: "8.1",
        probedAt: "2026-05-11T00:00:00.000Z",
        importedFrom: "jay/qilixiang.mkv"
      },
      trackRoles,
      playbackProfile,
      createdAt: "2026-05-11T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z"
    } satisfies ImportCandidateFile;

    expect(candidateFile.trackRoles.instrumental?.label).toBe("Instrumental");
  });
});
