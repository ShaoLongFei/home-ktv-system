import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadSourceManifest,
  resolveRunPath,
  validateManifestPath
} from "../manifest.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

describe("source manifest loading", () => {
  it("resolves run paths relative to the invocation root", () => {
    expect(
      resolveRunPath("packages/hot-songs/config/sources.example.json", repoRoot)
    ).toBe(resolve(repoRoot, "packages/hot-songs/config/sources.example.json"));
    expect(resolveRunPath("/tmp/sources.json", repoRoot)).toBe(
      "/tmp/sources.json"
    );
  });

  it("loads the default fixture manifest", async () => {
    const manifest = await loadSourceManifest(
      resolveRunPath(
        "packages/hot-songs/fixtures/manifests/default.fixture.json",
        repoRoot
      )
    );

    expect(manifest.schemaVersion).toBe("hot-songs.source-manifest.v1");
    expect(manifest.sources.map((source) => source.id)).toEqual([
      "qq-kge-toplist",
      "cavca-golden-mic-manual"
    ]);
  });

  it("loads the example manifest with KTV-first sources", async () => {
    const manifest = await loadSourceManifest(
      resolveRunPath("packages/hot-songs/config/sources.example.json", repoRoot)
    );

    expect(manifest.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "qq-kge-toplist",
          sourceType: "ktv_first"
        }),
        expect.objectContaining({
          id: "cavca-golden-mic-manual",
          sourceType: "ktv_first"
        })
      ])
    );
  });

  it("requires --manifest", () => {
    expect(() => validateManifestPath(undefined)).toThrow(
      "Missing required --manifest <path>"
    );
  });
});
