import { describe, expect, it } from "vitest";

import type { SourceDefinition, SourceManifest, SourceRow } from "../contracts.js";
import { buildSongKey } from "../normalize/candidates.js";
import type { CandidateIdentity, CandidateSnapshot } from "../normalize/contracts.js";
import { normalizeArtistKeys, normalizeTitleIdentity } from "../normalize/text.js";
import { buildFusionReport, scoreEvidence } from "../fuse/ranking.js";

const generatedAt = "2026-05-11T00:00:00.000Z";

function source(overrides: Partial<SourceDefinition> & Pick<SourceDefinition, "id">): SourceDefinition {
  const { id, ...rest } = overrides;
  return {
    id,
    name: rest.name ?? id,
    provider: rest.provider ?? "manual",
    sourceType: rest.sourceType ?? "support",
    sourceKind: rest.sourceKind ?? "public_chart",
    adapter: rest.adapter ?? "manual_json",
    weight: rest.weight ?? 50,
    enabled: rest.enabled ?? true,
    required: rest.required ?? false,
    url: rest.url ?? "https://example.com/chart",
    targetRows: rest.targetRows ?? 500,
    expectedMinRows: rest.expectedMinRows ?? 1,
    staleAfterDays: rest.staleAfterDays ?? 14,
    usableWhenStale: rest.usableWhenStale ?? false,
    ...rest
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
    sourceUrl: sourceDefinition.url ?? null,
    sourcePublishedAt: "2026-05-11",
    collectedAt: generatedAt,
    warnings: [],
    ...overrides
  };
}

function candidate(
  title: string,
  artists: string[],
  evidence: SourceRow[]
): CandidateIdentity {
  const titleIdentity = normalizeTitleIdentity(title);
  const canonicalArtistKeys = normalizeArtistKeys(artists);
  const songKey = buildSongKey({
    canonicalTitleKey: titleIdentity.canonicalTitleKey,
    canonicalArtistKeys,
    variantSignature: titleIdentity.variantSignature
  });

  return {
    candidateId: `candidate-${title}-${artists.join("-")}`.replace(/\s+/gu, "-"),
    songKey,
    canonicalTitleKey: titleIdentity.canonicalTitleKey,
    baseTitleKey: titleIdentity.baseTitleKey,
    canonicalArtistKeys,
    variantSignature: titleIdentity.variantSignature,
    displayTitle: title,
    displayArtists: artists,
    sourceIds: [...new Set(evidence.map((item) => item.sourceId))].sort(),
    sourceTypes: ["support"],
    warnings: titleIdentity.warnings,
    evidence
  };
}

function snapshot(candidates: CandidateIdentity[]): CandidateSnapshot {
  return {
    schemaVersion: "hot-songs.candidate-snapshot.v1",
    generatedAt,
    sourceRowCount: candidates.flatMap((item) => item.evidence).length,
    candidateCount: candidates.length,
    candidates
  };
}

describe("scoreEvidence", () => {
  it("uses additive source points with rank decay", () => {
    const qq = source({ id: "qq-kge-toplist", weight: 100 });

    expect(scoreEvidence(row(qq, { rank: 1 }), qq)).toBeCloseTo(100 * 10 * 60 / 61, 6);
    expect(scoreEvidence(row(qq, { rank: 60 }), qq)).toBeCloseTo(500, 6);
  });
});

describe("buildFusionReport", () => {
  it("keeps only the best contribution from each source for one fused song", () => {
    const qq = source({ id: "qq-kge-toplist", weight: 100 });
    const report = buildFusionReport({
      manifest: manifest([qq]),
      snapshot: snapshot([
        candidate("后来", ["刘若英"], [
          row(qq, { rank: 1 }),
          row(qq, { rank: 50 })
        ])
      ])
    });

    expect(report.rankedSongs).toHaveLength(1);
    expect(report.rankedSongs[0]?.score).toBeCloseTo(100 * 10 * 60 / 61, 6);
    expect(report.rankedSongs[0]?.contributions).toHaveLength(1);
  });

  it("lets fair multi-source consensus outrank one strong source when the total evidence is stronger", () => {
    const ktv = source({ id: "holiday-ktv-mandarin-top", weight: 100, sourceType: "ktv_first" });
    const qq = source({ id: "qq-hot-toplist", weight: 70 });
    const kugou = source({ id: "kugou-top500", weight: 70 });
    const report = buildFusionReport({
      manifest: manifest([ktv, qq, kugou]),
      snapshot: snapshot([
        candidate("单源冠军", ["测试歌手"], [row(ktv, { rank: 1, rawTitle: "单源冠军", rawArtists: ["测试歌手"] })]),
        candidate("多榜共识", ["测试歌手"], [
          row(qq, { rank: 10, rawTitle: "多榜共识", rawArtists: ["测试歌手"] }),
          row(kugou, { rank: 10, rawTitle: "多榜共识", rawArtists: ["测试歌手"] })
        ])
      ])
    });

    expect(report.rankedSongs.map((song) => song.title)).toEqual([
      "多榜共识",
      "单源冠军"
    ]);
  });

  it("sorts ties deterministically by title then artist", () => {
    const qq = source({ id: "qq-hot-toplist", weight: 60 });
    const report = buildFusionReport({
      manifest: manifest([qq]),
      snapshot: snapshot([
        candidate("B歌", ["歌手"], [row(qq, { rank: 1, rawTitle: "B歌", rawArtists: ["歌手"] })]),
        candidate("A歌", ["歌手"], [row(qq, { rank: 1, rawTitle: "A歌", rawArtists: ["歌手"] })])
      ])
    });

    expect(report.rankedSongs.map((song) => song.title)).toEqual(["A歌", "B歌"]);
    expect(report.rankedSongs.map((song) => song.rank)).toEqual([1, 2]);
  });

  it("merges explicit title and artist aliases while keeping variant songs separate by default", () => {
    const qq = source({ id: "qq-hot-toplist", weight: 70 });
    const kugou = source({ id: "kugou-top500", weight: 70 });
    const report = buildFusionReport({
      manifest: manifest([qq, kugou]),
      aliases: {
        titleAliases: {
          "run wild 向风而野": ["run wild"]
        },
        artistAliases: {
          "邓紫棋": ["g e m 邓紫棋"]
        }
      },
      snapshot: snapshot([
        candidate("Run Wild（向风而野）", ["是晚星呀"], [
          row(qq, { rank: 1, rawTitle: "Run Wild（向风而野）", rawArtists: ["是晚星呀"] })
        ]),
        candidate("Run Wild", ["是晚星呀"], [
          row(kugou, { rank: 2, rawTitle: "Run Wild", rawArtists: ["是晚星呀"] })
        ]),
        candidate("光年之外", ["G.E.M.邓紫棋"], [
          row(qq, { rank: 3, rawTitle: "光年之外", rawArtists: ["G.E.M.邓紫棋"] })
        ]),
        candidate("光年之外", ["邓紫棋"], [
          row(kugou, { rank: 4, rawTitle: "光年之外", rawArtists: ["邓紫棋"] })
        ]),
        candidate("同手同脚", ["温岚"], [
          row(qq, { rank: 5, rawTitle: "同手同脚", rawArtists: ["温岚"] })
        ]),
        candidate("同手同脚 (Live)", ["温岚"], [
          row(kugou, { rank: 6, rawTitle: "同手同脚 (Live)", rawArtists: ["温岚"] })
        ])
      ])
    });

    const runWild = report.rankedSongs.find((song) => song.title === "Run Wild（向风而野）");
    const lightYears = report.rankedSongs.find((song) => song.title === "光年之外");

    expect(runWild?.sourceIds).toEqual(["kugou-top500", "qq-hot-toplist"]);
    expect(lightYears?.sourceIds).toEqual(["kugou-top500", "qq-hot-toplist"]);
    expect(report.rankedSongs.filter((song) => song.title.includes("同手同脚"))).toHaveLength(2);
  });

  it("reports near duplicates for same-artist similar titles without auto-merging them", () => {
    const qq = source({ id: "qq-hot-toplist", weight: 70 });
    const kugou = source({ id: "kugou-top500", weight: 70 });
    const report = buildFusionReport({
      manifest: manifest([qq, kugou]),
      snapshot: snapshot([
        candidate("Run Wild（向风而野）", ["是晚星呀"], [
          row(qq, { rank: 1, rawTitle: "Run Wild（向风而野）", rawArtists: ["是晚星呀"] })
        ]),
        candidate("Run Wild", ["是晚星呀"], [
          row(kugou, { rank: 2, rawTitle: "Run Wild", rawArtists: ["是晚星呀"] })
        ])
      ])
    });

    expect(report.rankedSongs).toHaveLength(2);
    expect(report.nearDuplicates).toEqual([
      expect.objectContaining({
        leftTitle: "Run Wild（向风而野）",
        rightTitle: "Run Wild"
      })
    ]);
  });
});
