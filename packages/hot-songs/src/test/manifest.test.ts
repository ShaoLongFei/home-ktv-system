import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { collectManualJsonSource } from "../adapters/manual-json.js";
import type { SourceDefinition, SourceManifest } from "../contracts.js";
import {
  loadSourceManifest,
  resolveRunPath,
  validateManifestPath
} from "../manifest.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

function findSource(
  manifest: SourceManifest,
  sourceId: string
): SourceDefinition {
  const source = manifest.sources.find((candidate) => candidate.id === sourceId);
  if (source === undefined) {
    throw new Error(`Missing test source ${sourceId}`);
  }

  return source;
}

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

describe("manual JSON source adapter", () => {
  it("preserves raw CAVCA snapshot rows", async () => {
    const manifest = await loadSourceManifest(
      resolveRunPath(
        "packages/hot-songs/fixtures/manifests/default.fixture.json",
        repoRoot
      )
    );
    const source = findSource(manifest, "cavca-golden-mic-manual");

    const rows = await collectManualJsonSource(source, { runRoot: repoRoot });

    expect(rows).toHaveLength(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "cavca-golden-mic-manual",
          rawTitle: "后来",
          rawArtists: ["刘若英"],
          rank: 1,
          sourceUrl: "https://www.cavca.org/news/49",
          sourcePublishedAt: "2026-05-01",
          collectedAt: "2026-05-10T00:00:00.000Z"
        }),
        expect.objectContaining({
          rawTitle: "同手同脚 (Live)",
          rawArtists: ["温岚"]
        }),
        expect.objectContaining({
          rawTitle: "Run Wild（向风而野）",
          rawArtists: ["周深"]
        })
      ])
    );
  });
});
