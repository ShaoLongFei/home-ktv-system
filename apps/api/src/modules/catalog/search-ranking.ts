export const searchMatchScores = {
  title_exact: 1000,
  artist_exact: 900,
  normalized_title: 800,
  alias: 700,
  pinyin: 600,
  initials: 500,
  search_hint: 400,
  default: 100
} as const;

export type SearchScoreBucket = keyof typeof searchMatchScores;
