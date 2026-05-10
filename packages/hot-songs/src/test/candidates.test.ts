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
});
