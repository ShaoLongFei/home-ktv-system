import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SourceRowSchema, type SourceRow } from "../contracts.js";
import { buildCandidateSnapshot } from "../normalize/candidates.js";

const repoRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

async function loadFixtureRows(): Promise<SourceRow[]> {
  const sourceRowsFile = JSON.parse(
    await readFile(
      resolve(
        repoRoot,
        ".planning/reports/hot-songs/phase-12-fixture-all/source-rows.json"
      ),
      "utf8"
    )
  ) as { rows: unknown[] };

  return SourceRowSchema.array().parse(sourceRowsFile.rows);
}

function sourceRow(overrides: Partial<SourceRow>): SourceRow {
  return SourceRowSchema.parse({
    sourceId: "fixture-source",
    sourceType: "support",
    provider: "manual",
    rank: 1,
    rawTitle: "后来",
    rawArtists: ["刘若英"],
    sourceUrl: null,
    sourcePublishedAt: null,
    collectedAt: "2026-05-10T00:00:00.000Z",
    warnings: [],
    ...overrides
  });
}

describe("buildCandidateSnapshot", () => {
  it("groups Phase 12 fixture rows into six evidence-preserving candidates", async () => {
    const rows = await loadFixtureRows();
    const snapshot = buildCandidateSnapshot({
      rows,
      generatedAt: "2026-05-10T00:00:00.000Z"
    });

    expect(snapshot.sourceRowCount).toBe(15);
    expect(snapshot.candidateCount).toBe(6);

    const houLai = snapshot.candidates.find(
      (candidate) => candidate.displayTitle === "后来"
    );
    expect(houLai).toEqual(
      expect.objectContaining({
        displayArtists: ["刘若英"],
        canonicalTitleKey: "后来",
        variantSignature: "original"
      })
    );
    expect(houLai?.candidateId).toMatch(/^song_[0-9a-f]{16}$/u);
    expect(houLai?.evidence).toHaveLength(5);
    expect(houLai?.sourceIds).toEqual(
      expect.arrayContaining([
        "qq-kge-toplist",
        "cavca-golden-mic-manual",
        "qq-hot-toplist",
        "kugou-rank-home",
        "netease-toplist"
      ])
    );
  });

  it("keeps same title different artist rows as separate candidates", () => {
    const snapshot = buildCandidateSnapshot({
      rows: [
        sourceRow({
          sourceId: "liu-ruo-ying",
          rawTitle: "后来",
          rawArtists: ["刘若英"]
        }),
        sourceRow({
          sourceId: "same-title-different-artist",
          rawTitle: "后来",
          rawArtists: ["张三"]
        })
      ],
      generatedAt: "2026-05-10T00:00:00.000Z"
    });

    expect(snapshot.candidateCount).toBe(2);
    expect(
      snapshot.candidates.map((candidate) => candidate.canonicalArtistKeys)
    ).toEqual([["刘若英"], ["张三"]]);
  });

  it("surfaces Live variants as variant-live warnings", async () => {
    const rows = await loadFixtureRows();
    const snapshot = buildCandidateSnapshot({
      rows,
      generatedAt: "2026-05-10T00:00:00.000Z"
    });

    const liveCandidate = snapshot.candidates.find(
      (candidate) => candidate.displayTitle === "同手同脚 (Live)"
    );

    expect(liveCandidate?.variantSignature).toBe("variant-live");
    expect(liveCandidate?.warnings).toContain("variant-live");
  });

  it("keeps row-level warnings on evidence and candidate warnings", () => {
    const snapshot = buildCandidateSnapshot({
      rows: [
        sourceRow({
          sourceId: "warning-source",
          warnings: ["manual-review-source"]
        })
      ],
      generatedAt: "2026-05-10T00:00:00.000Z"
    });

    expect(snapshot.candidates[0]?.evidence[0]?.warnings).toEqual([
      "manual-review-source"
    ]);
    expect(snapshot.candidates[0]?.warnings).toContain("manual-review-source");
  });

  it("falls back to an unknown artist label when source rows have no artists", () => {
    const snapshot = buildCandidateSnapshot({
      rows: [
        sourceRow({
          sourceId: "no-artist-source",
          rawTitle: "希林娜依高、欧阳娣娣 (Didi Ouyang)、王晓赟子、谢可寅、袁一琦...",
          rawArtists: [],
          warnings: ["missing-artist"]
        })
      ],
      generatedAt: "2026-05-10T00:00:00.000Z"
    });

    expect(snapshot.candidateCount).toBe(1);
    expect(snapshot.candidates[0]?.displayArtists).toEqual(["未知歌手"]);
    expect(snapshot.candidates[0]?.canonicalArtistKeys).toEqual(["未知歌手"]);
  });

  it("keeps candidate IDs and song keys stable when fixture rows are reversed", async () => {
    const rows = await loadFixtureRows();
    const original = buildCandidateSnapshot({
      rows,
      generatedAt: "2026-05-10T00:00:00.000Z"
    });
    const reversed = buildCandidateSnapshot({
      rows: [...rows].reverse(),
      generatedAt: "2026-05-10T00:00:00.000Z"
    });

    expect(
      reversed.candidates.map((candidate) => [
        candidate.songKey,
        candidate.candidateId
      ])
    ).toEqual(
      original.candidates.map((candidate) => [
        candidate.songKey,
        candidate.candidateId
      ])
    );
  });
});
