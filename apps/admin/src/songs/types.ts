export type Language = "mandarin" | "cantonese" | "other";
export type SongStatus = "ready" | "review_required" | "unavailable";
export type AssetStatus = "ready" | "caching" | "failed" | "unavailable" | "stale" | "promoted";
export type VocalMode = "original" | "instrumental" | "dual" | "unknown";
export type LyricMode = "hard_sub" | "soft_sub" | "external_lrc" | "none";
export type SwitchQualityStatus = "verified" | "review_required" | "rejected" | "unknown";

export interface AdminCatalogAsset {
  id: string;
  songId: string;
  sourceType: "local" | "online_cached" | "online_ephemeral";
  assetKind: "video" | "audio+lyrics" | "dual-track-video";
  displayName: string;
  filePath: string;
  durationMs: number;
  lyricMode: LyricMode;
  vocalMode: VocalMode;
  status: AssetStatus;
  switchFamily: string | null;
  switchQualityStatus: SwitchQualityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCatalogSong {
  id: string;
  title: string;
  normalizedTitle: string;
  titlePinyin: string;
  titleInitials: string;
  artistId: string;
  artistName: string;
  language: Language;
  status: SongStatus;
  genre: readonly string[];
  tags: readonly string[];
  aliases: readonly string[];
  searchHints: readonly string[];
  releaseYear: number | null;
  canonicalDurationMs: number | null;
  searchWeight: number;
  defaultAssetId: string | null;
  capabilities: { canSwitchVocalMode: boolean };
  createdAt: string;
  updatedAt: string;
  defaultAsset: AdminCatalogAsset | null;
  assets: AdminCatalogAsset[];
}

export interface CatalogSongListResponse {
  songs: AdminCatalogSong[];
}

export interface CatalogSongListFilters {
  status?: SongStatus;
  language?: Language;
}

export interface SongMetadataPatch {
  title: string;
  artistName: string;
  language: Language;
  genre: string[];
  tags: string[];
  aliases: string[];
  searchHints: string[];
  releaseYear: number | null;
  status: SongStatus;
}

export interface CatalogEvaluation {
  status: "verified" | "review_required" | "rejected";
  reason?: string;
}

export interface CatalogSongMutationResponse {
  song: AdminCatalogSong;
  evaluation?: CatalogEvaluation;
}

export interface CatalogAssetMutationResponse extends CatalogSongMutationResponse {
  asset: AdminCatalogAsset;
}

export interface CatalogAssetPatch {
  status?: AssetStatus;
  vocalMode?: VocalMode;
  lyricMode?: LyricMode;
  switchFamily?: string | null;
}

export interface CatalogValidationIssue {
  code: string;
  severity: "warning" | "error";
  message: string;
  assetId?: string;
  path?: string;
  reason?: string;
}

export interface CatalogValidationResult {
  status: "passed" | "review_required" | "failed";
  songId: string;
  songJsonPath: string;
  issues: CatalogValidationIssue[];
}
