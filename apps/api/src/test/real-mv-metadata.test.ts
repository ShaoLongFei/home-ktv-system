import { describe, expect, it } from "vitest";
import { parseRealMvSidecarJson } from "../modules/ingest/real-mv-metadata.js";

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
});
