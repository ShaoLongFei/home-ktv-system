import { detectVariantWarnings, stripVariantMarkers } from "./variants.js";

export type NormalizedTitleIdentity = {
  canonicalTitleKey: string;
  baseTitleKey: string;
  variantSignature: string;
  warnings: string[];
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[()[\]{}<>【】《》「」『』"'“”‘’]/gu, " ")
    .replace(/[：:;；,，.。!！?？、/\\|&+\-_—~·•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeArtistKey(value: string): string {
  return normalizeSearchText(value);
}

export function normalizeArtistKeys(values: string[]): string[] {
  return [...new Set(values.map(normalizeArtistKey).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, "zh-Hans-CN")
  );
}

export function normalizeTitleIdentity(
  rawTitle: string
): NormalizedTitleIdentity {
  const warnings = detectVariantWarnings(rawTitle);
  const canonicalTitleKey = normalizeSearchText(rawTitle);
  const baseTitleKey = normalizeSearchText(stripVariantMarkers(rawTitle));

  return {
    canonicalTitleKey,
    baseTitleKey: baseTitleKey.length > 0 ? baseTitleKey : canonicalTitleKey,
    variantSignature: warnings.length === 0 ? "original" : warnings.join("+"),
    warnings
  };
}
