import * as OpenCC from "opencc-js";
import { pinyin } from "pinyin-pro";

const traditionalToSimplified = OpenCC.Converter({ from: "t", to: "cn" });

export function normalizeSearchText(value: string): string {
  return traditionalToSimplified(value.normalize("NFKC"))
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

export function buildPinyinSearchKeys(value: string): { pinyin: string; initials: string } {
  const syllables = pinyin(traditionalToSimplified(value.normalize("NFKC")), {
    toneType: "none",
    type: "array"
  });

  return {
    pinyin: syllables.join("").toLowerCase(),
    initials: syllables.map((syllable) => syllable.charAt(0).toLowerCase()).join("")
  };
}
