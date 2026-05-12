import { describe, expect, it } from "vitest";
import { parseRealMvFilename, parseRealMvSidecarJson } from "../modules/ingest/real-mv-metadata.js";

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
});
