import { describe, expect, it } from "vitest";

import { buildPinyinSearchKeys, normalizeSearchText } from "../modules/catalog/search-normalization.js";
import { searchMatchScores } from "../modules/catalog/search-ranking.js";

describe("catalog search normalization", () => {
  it("normalizes full-width latin text and separators", () => {
    expect(normalizeSearchText(" Ｑｉ Li-Xiang ")).toBe("qilixiang");
  });

  it("converts traditional Chinese text to simplified normalized text", () => {
    expect(normalizeSearchText("後來")).toBe("后来");
  });

  it("builds full pinyin and initials search keys", () => {
    expect(buildPinyinSearchKeys("七里香")).toEqual({
      pinyin: "qilixiang",
      initials: "qlx"
    });
  });

  it("keeps exact title and artist matches above fallback search buckets", () => {
    expect(searchMatchScores.title_exact).toBeGreaterThan(searchMatchScores.artist_exact);
    expect(searchMatchScores.artist_exact).toBeGreaterThan(searchMatchScores.normalized_title);
    expect(searchMatchScores.artist_exact).toBeGreaterThan(searchMatchScores.alias);
    expect(searchMatchScores.artist_exact).toBeGreaterThan(searchMatchScores.pinyin);
    expect(searchMatchScores.artist_exact).toBeGreaterThan(searchMatchScores.initials);
    expect(searchMatchScores.artist_exact).toBeGreaterThan(searchMatchScores.search_hint);
  });
});
