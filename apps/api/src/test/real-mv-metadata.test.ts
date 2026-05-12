import { describe, expect, it } from "vitest";
import type { MediaInfoSummary } from "@home-ktv/domain";
import {
  buildRealMvMetadataDraft,
  parseRealMvFilename,
  parseRealMvSidecarJson
} from "../modules/ingest/real-mv-metadata.js";

describe("real MV metadata helpers", () => {
  describe("parseRealMvSidecarJson", () => {
    it("accepts the supported song.json metadata shape", () => {
      const result = parseRealMvSidecarJson(JSON.stringify({
        title: "想你的夜",
        artistName: "关喆",
        language: "mandarin",
        genre: ["pop"],
        tags: ["mv"],
        aliases: ["miss you tonight"],
        searchHints: ["xiang ni de ye"],
        releaseYear: 2012,
        trackRoles: {
          original: 0,
          instrumental: 1
        }
      }));

      expect(result).toEqual({
        status: "ok",
        metadata: {
          title: "想你的夜",
          artistName: "关喆",
          language: "mandarin",
          genre: ["pop"],
          tags: ["mv"],
          aliases: ["miss you tonight"],
          searchHints: ["xiang ni de ye"],
          releaseYear: 2012,
          trackRoles: {
            original: 0,
            instrumental: 1
          }
        }
      });
    });

    it("returns a scanner warning for invalid JSON", () => {
      const result = parseRealMvSidecarJson("{");

      expect(result).toMatchObject({
        status: "invalid",
        reasons: [
          {
            code: "sidecar-json-invalid",
            severity: "warning",
            source: "scanner"
          }
        ]
      });
    });

    it("returns a scanner warning for unsupported field types", () => {
      const result = parseRealMvSidecarJson(JSON.stringify({
        title: ["想你的夜"]
      }));

      expect(result).toMatchObject({
        status: "invalid",
        reasons: [
          {
            code: "sidecar-schema-invalid",
            severity: "warning",
            source: "scanner"
          }
        ]
      });
    });
  });

  describe("parseRealMvFilename", () => {
    it("extracts common Chinese MV filename metadata", () => {
      const result = parseRealMvFilename("关喆-想你的夜(MTV)-国语-流行.mkv");

      expect(result).toMatchObject({
        artistName: "关喆",
        title: "想你的夜",
        language: "mandarin",
        genre: ["流行"]
      });
    });

    it("keeps English title casing while extracting artist and language", () => {
      const result = parseRealMvFilename("蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg");

      expect(result).toMatchObject({
        artistName: "蔡依林",
        title: "BECAUSE OF YOU",
        language: "mandarin",
        genre: ["流行"]
      });
    });

    it("falls back to title only when filename parts are ambiguous", () => {
      const result = parseRealMvFilename("unknown-file-name.mkv");

      expect(result).toEqual({
        title: "unknown-file-name"
      });
    });
  });

  describe("buildRealMvMetadataDraft", () => {
    it("marks technical MediaInfo fields as mediainfo sources", () => {
      const result = buildRealMvMetadataDraft({
        mediaInfoSummary: createMediaInfoSummary(),
        filenameMetadata: { title: "七里香" }
      });

      expect(result.metadataSources).toEqual(expect.arrayContaining([
        { field: "durationMs", source: "mediainfo" },
        { field: "container", source: "mediainfo" },
        { field: "videoCodec", source: "mediainfo" },
        { field: "resolution", source: "mediainfo" },
        { field: "fileSizeBytes", source: "mediainfo" },
        { field: "audioTracks", source: "mediainfo" }
      ]));
    });

    it("prefers MediaInfo identity, then filename, then sidecar for missing fields", () => {
      const result = buildRealMvMetadataDraft({
        mediaInfoSummary: createMediaInfoSummary(),
        mediaInfoTags: { title: "MediaInfo 标题" },
        filenameMetadata: {
          title: "文件名标题",
          artistName: "文件名歌手",
          language: "mandarin"
        },
        sidecarMetadata: {
          artistName: "sidecar singer",
          tags: ["mv"]
        }
      });

      expect(result).toMatchObject({
        title: "MediaInfo 标题",
        artistName: "文件名歌手",
        language: "mandarin",
        tags: ["mv"]
      });
      expect(result.metadataSources).toEqual(expect.arrayContaining([
        { field: "title", source: "mediainfo" },
        { field: "artistName", source: "filename" },
        { field: "language", source: "filename" },
        { field: "tags", source: "sidecar" }
      ]));
    });

    it("preserves metadataConflicts when filename and sidecar disagree", () => {
      const result = buildRealMvMetadataDraft({
        mediaInfoSummary: createMediaInfoSummary(),
        filenameMetadata: { title: "文件名标题" },
        sidecarMetadata: { title: "sidecar title" }
      });

      expect(result.title).toBe("文件名标题");
      expect(result.metadataConflicts).toEqual([
        {
          field: "title",
          values: [
            { source: "filename", value: "文件名标题" },
            { source: "sidecar", value: "sidecar title" }
          ]
        }
      ]);
    });

    it("copies invalid sidecar scanner reasons into the draft", () => {
      const result = buildRealMvMetadataDraft({
        mediaInfoSummary: createMediaInfoSummary(),
        filenameMetadata: { title: "七里香" },
        scannerReasons: [
          {
            code: "sidecar-json-invalid",
            severity: "warning",
            message: "invalid JSON",
            source: "scanner"
          }
        ]
      });

      expect(result.scannerReasons).toEqual([
        expect.objectContaining({ code: "sidecar-json-invalid", source: "scanner" })
      ]);
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
