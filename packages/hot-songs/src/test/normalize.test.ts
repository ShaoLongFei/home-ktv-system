import { describe, expect, it } from "vitest";

import { CandidateSnapshotSchema } from "../normalize/contracts.js";

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
