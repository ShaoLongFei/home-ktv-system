import { describe, expect, it } from "vitest";

import { CandidateSnapshotSchema } from "../normalize/contracts.js";
import {
  normalizeArtistKey,
  normalizeArtistKeys,
  normalizeTitleIdentity
} from "../normalize/text.js";
import { detectVariantWarnings } from "../normalize/variants.js";

const evidence = {
  sourceId: "qq-kge-toplist",
  sourceType: "ktv_first",
  provider: "qq_music",
  rank: 1,
  rawTitle: "后来",
  rawArtists: ["刘若英"],
  sourceUrl: "https://y.qq.com/n/ryqq/toplist/36",
  sourcePublishedAt: "2026-05-10",
  collectedAt: "2026-05-10T00:00:00.000Z",
  warnings: []
};

describe("CandidateSnapshotSchema", () => {
  it("accepts candidate identities with raw source evidence", () => {
    const snapshot = CandidateSnapshotSchema.parse({
      schemaVersion: "hot-songs.candidate-snapshot.v1",
      generatedAt: "2026-05-10T00:00:00.000Z",
      sourceRowCount: 1,
      candidateCount: 1,
      candidates: [
        {
          candidateId: "song_0123456789abcdef",
          songKey: "title:后来|artists:刘若英|variant:original",
          canonicalTitleKey: "后来",
          baseTitleKey: "后来",
          canonicalArtistKeys: ["刘若英"],
          variantSignature: "original",
          displayTitle: "后来",
          displayArtists: ["刘若英"],
          sourceIds: ["qq-kge-toplist"],
          sourceTypes: ["ktv_first"],
          warnings: [],
          evidence: [evidence]
        }
      ]
    });

    expect(snapshot.schemaVersion).toBe("hot-songs.candidate-snapshot.v1");
    expect(snapshot.candidates[0]?.evidence[0]?.rawTitle).toBe("后来");
  });

  it("rejects an empty candidateId", () => {
    expect(() =>
      CandidateSnapshotSchema.parse({
        schemaVersion: "hot-songs.candidate-snapshot.v1",
        generatedAt: "2026-05-10T00:00:00.000Z",
        sourceRowCount: 1,
        candidateCount: 1,
        candidates: [
          {
            candidateId: "",
            songKey: "title:后来|artists:刘若英|variant:original",
            canonicalTitleKey: "后来",
            baseTitleKey: "后来",
            canonicalArtistKeys: ["刘若英"],
            variantSignature: "original",
            displayTitle: "后来",
            displayArtists: ["刘若英"],
            sourceIds: ["qq-kge-toplist"],
            sourceTypes: ["ktv_first"],
            warnings: [],
            evidence: [evidence]
          }
        ]
      })
    ).toThrow();
  });
});

describe("text normalization", () => {
  it("creates stable title keys without dropping Chinese words", () => {
    expect(normalizeTitleIdentity("Run Wild（向风而野）")).toEqual({
      canonicalTitleKey: "run wild 向风而野",
      baseTitleKey: "run wild 向风而野",
      variantSignature: "original",
      warnings: []
    });
  });

  it("detects visible variant markers", () => {
    expect(detectVariantWarnings("同手同脚 (Live)")).toContain("variant-live");
    expect(normalizeTitleIdentity("同手同脚 (Live)")).toEqual(
      expect.objectContaining({
        baseTitleKey: "同手同脚",
        variantSignature: "variant-live",
        warnings: ["variant-live"]
      })
    );
  });

  it("marks non-variant titles as original", () => {
    expect(normalizeTitleIdentity("后来")).toEqual({
      canonicalTitleKey: "后来",
      baseTitleKey: "后来",
      variantSignature: "original",
      warnings: []
    });
  });

  it("normalizes artist keys deterministically", () => {
    expect(normalizeArtistKey(" 周深 ")).toBe("周深");
    expect(normalizeArtistKeys(["田馥甄", "刘若英"])).toEqual([
      "刘若英",
      "田馥甄"
    ]);
  });
});
