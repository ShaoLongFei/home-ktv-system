import { describe, expect, it } from "vitest";

import {
  HOT_SONGS_SOURCES_HELP,
  parseCollectSourcesArgs
} from "../cli.js";

describe("parseCollectSourcesArgs", () => {
  it("parses single-run source collection options", () => {
    const args = parseCollectSourcesArgs([
      "--manifest",
      "packages/hot-songs/config/sources.example.json",
      "--out",
      ".planning/reports/hot-songs/test-run",
      "--timeout-ms",
      "2500",
      "--source",
      "qq-kge-toplist",
      "--source",
      "cavca-golden-mic-manual",
      "--fixture"
    ]);

    expect(args).toEqual({
      manifestPath: "packages/hot-songs/config/sources.example.json",
      outDir: ".planning/reports/hot-songs/test-run",
      timeoutMs: 2500,
      sourceIds: ["qq-kge-toplist", "cavca-golden-mic-manual"],
      fixture: true,
      help: false
    });
  });

  it("uses timeout default and exposes help mode", () => {
    const args = parseCollectSourcesArgs(["--help"]);

    expect(args.timeoutMs).toBe(10000);
    expect(args.sourceIds).toEqual([]);
    expect(args.fixture).toBe(false);
    expect(args.help).toBe(true);
    expect(HOT_SONGS_SOURCES_HELP).toContain(
      "Usage: pnpm hot-songs:sources -- --manifest <path> --out <dir>"
    );
  });

  it("accepts the pnpm script argument separator", () => {
    const args = parseCollectSourcesArgs([
      "--",
      "--manifest",
      "packages/hot-songs/config/sources.example.json",
      "--out",
      ".planning/reports/hot-songs/test-run"
    ]);

    expect(args.manifestPath).toBe(
      "packages/hot-songs/config/sources.example.json"
    );
    expect(args.outDir).toBe(".planning/reports/hot-songs/test-run");
  });
});
