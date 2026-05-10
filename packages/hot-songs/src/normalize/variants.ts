const variantRules: Array<{ code: string; pattern: RegExp }> = [
  { code: "variant-live", pattern: /\b(?:live|现场)\b|(?:演唱会|现场版)/iu },
  { code: "variant-dj", pattern: /\bdj\b|DJ版/iu },
  { code: "variant-remix", pattern: /\bremix\b|混音/iu },
  { code: "variant-accompaniment", pattern: /伴奏|纯音乐/u },
  { code: "variant-cover", pattern: /翻唱|cover/iu },
  { code: "variant-clip", pattern: /片段|片段版|试听/u },
  { code: "variant-gender-version", pattern: /女声版|男声版/u },
  { code: "variant-version", pattern: /(?:^|[\s(（])[^()（）\s]*版(?:[\s)）]|$)/u }
];

export function detectVariantWarnings(rawTitle: string): string[] {
  const normalizedTitle = rawTitle.normalize("NFKC");
  return variantRules
    .filter((rule) => rule.pattern.test(normalizedTitle))
    .map((rule) => rule.code);
}

export function stripVariantMarkers(rawTitle: string): string {
  return rawTitle
    .normalize("NFKC")
    .replace(/[（(][^()（）]*(?:live|现场|dj|remix|混音|伴奏|翻唱|cover|片段|女声版|男声版|版)[^()（）]*[)）]/giu, " ")
    .replace(/\b(?:live|dj|remix|cover)\b/giu, " ")
    .replace(/(?:现场版|DJ版|混音版|伴奏|翻唱|片段版|片段|女声版|男声版)/giu, " ");
}
