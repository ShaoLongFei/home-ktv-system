import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  SourceDefinition,
  SourceManifest,
  SourceRow,
  SourceStatus
} from "../contracts.js";
import { runHotSongsUpdate } from "../update-pipeline.js";

const generatedAt = "2026-05-12T00:00:00.000Z";

function source(
  overrides: Partial<SourceDefinition> & Pick<SourceDefinition, "id">
): SourceDefinition {
  const { id, ...sourceOverrides } = overrides;
  return {
    id,
    name: sourceOverrides.name ?? id,
    provider: sourceOverrides.provider ?? "manual",
    sourceType: sourceOverrides.sourceType ?? "support",
    sourceKind: sourceOverrides.sourceKind ?? "manual_snapshot",
    adapter: sourceOverrides.adapter ?? "manual_json",
    weight: sourceOverrides.weight ?? 50,
    enabled: sourceOverrides.enabled ?? true,
    required: sourceOverrides.required ?? false,
    file: sourceOverrides.file ?? "unused.json",
    targetRows: sourceOverrides.targetRows ?? 500,
    expectedMinRows: sourceOverrides.expectedMinRows ?? 1,
    staleAfterDays: sourceOverrides.staleAfterDays ?? 14,
    usableWhenStale: sourceOverrides.usableWhenStale ?? false,
    ...sourceOverrides
  };
}

function manifest(sources: SourceDefinition[]): SourceManifest {
  return {
    schemaVersion: "hot-songs.source-manifest.v1",
    sources
  };
}

function row(
  sourceDefinition: SourceDefinition,
  overrides: Partial<SourceRow> = {}
): SourceRow {
  return {
    sourceId: sourceDefinition.id,
    sourceType: sourceDefinition.sourceType,
    provider: sourceDefinition.provider,
    rank: 1,
    rawTitle: "后来",
    rawArtists: ["刘若英"],
    sourceUrl: null,
    sourcePublishedAt: "2026-05-12",
    collectedAt: generatedAt,
    warnings: [],
    ...overrides
  };
}

function status(
  sourceDefinition: SourceDefinition,
  rowCount: number
): SourceStatus {
  return {
    sourceId: sourceDefinition.id,
    status: "succeeded",
    usable: true,
    rowCount,
    targetRows: sourceDefinition.targetRows,
    minRows: sourceDefinition.expectedMinRows,
    warnings: [],
    startedAt: generatedAt,
    finishedAt: generatedAt
  };
}

describe("runHotSongsUpdate", () => {
  it("runs collection, normalization and fusion into one output directory", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "hot-songs-update-"));
    const qq = source({ id: "qq-hot-toplist", provider: "qq_music" });
    const kugou = source({ id: "kugou-top500", provider: "kugou", weight: 60 });

    try {
      const result = await runHotSongsUpdate({
        manifest: manifest([qq, kugou]),
        outDir,
        generatedAt,
        adapters: {
          manual_json: async (sourceDefinition) => [
            row(sourceDefinition, {
              rawTitle:
                sourceDefinition.id === "qq-hot-toplist" ? "后来" : "小幸运",
              rawArtists:
                sourceDefinition.id === "qq-hot-toplist" ? ["刘若英"] : ["田馥甄"]
            })
          ]
        }
      });

      const csv = await readFile(result.artifacts.rankedSongsCsv, "utf8");
      const sourceRows = JSON.parse(
        await readFile(result.artifacts.sourceRowsJson, "utf8")
      ) as { rowCount?: number; rows: unknown[] };
      const snapshot = JSON.parse(
        await readFile(result.artifacts.candidateSnapshotJson, "utf8")
      ) as { candidateCount: number };

      expect(result.counts).toEqual({
        sourceRows: 2,
        usableSources: 2,
        candidates: 2,
        rankedSongs: 2,
        nearDuplicates: 0
      });
      expect(csv.split("\n")[0]).toBe("rank,title,artist,score");
      expect(csv).toContain("后来,刘若英");
      expect(csv).toContain("小幸运,田馥甄");
      expect(sourceRows.rows).toHaveLength(2);
      expect(snapshot.candidateCount).toBe(2);
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  });

  it("can start from externally collected source rows", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "hot-songs-update-"));
    const qq = source({ id: "qq-hot-toplist", provider: "qq_music" });

    try {
      const result = await runHotSongsUpdate({
        manifest: manifest([qq]),
        outDir,
        generatedAt,
        sourceRows: [
          row(qq, {
            rawTitle: "后来",
            rawArtists: ["刘若英"]
          })
        ],
        sourceStatuses: [status(qq, 1)]
      });

      const csv = await readFile(result.artifacts.rankedSongsCsv, "utf8");
      const report = JSON.parse(
        await readFile(result.artifacts.sourceReportJson, "utf8")
      ) as { usableSourceCount: number };

      expect(result.counts.sourceRows).toBe(1);
      expect(result.counts.rankedSongs).toBe(1);
      expect(csv).toContain("1,后来,刘若英,");
      expect(report.usableSourceCount).toBe(1);
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  });
});
