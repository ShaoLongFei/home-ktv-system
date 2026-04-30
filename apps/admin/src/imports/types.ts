export type ImportCandidateStatus = "pending" | "held" | "review_required" | "conflict";
export type Language = "mandarin" | "cantonese" | "other";
export type VocalMode = "original" | "instrumental" | "dual" | "unknown";
export type AssetKind = "video" | "audio+lyrics" | "dual-track-video";
export type ImportFileRootKind = "imports_pending" | "imports_needs_review" | "songs";
export type ProbeStatus = "pending" | "probed" | "failed" | "skipped" | "deleted";

export interface ImportCandidateFileDetail {
  candidateFileId: string;
  importFileId: string;
  selected: boolean;
  proposedVocalMode: VocalMode | null;
  proposedAssetKind: AssetKind | null;
  roleConfidence: number | null;
  probeDurationMs: number | null;
  probeSummary: Record<string, unknown>;
  rootKind: ImportFileRootKind;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  quickHash: string | null;
  probeStatus: ProbeStatus;
  probePayload: Record<string, unknown>;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportCandidate {
  id: string;
  status: ImportCandidateStatus;
  title: string;
  normalizedTitle: string;
  titlePinyin: string;
  titleInitials: string;
  artistId: string | null;
  artistName: string;
  language: Language;
  genre: readonly string[];
  tags: readonly string[];
  aliases: readonly string[];
  searchHints: readonly string[];
  releaseYear: number | null;
  canonicalDurationMs: number | null;
  defaultCandidateFileId: string | null;
  sameVersionConfirmed: boolean;
  conflictSongId: string | null;
  reviewNotes: string | null;
  candidateMeta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  files: ImportCandidateFileDetail[];
}

export interface ImportCandidateListResponse {
  candidates: ImportCandidate[];
}

export interface ImportCandidateDetailResponse {
  candidate: ImportCandidate;
}

export interface MetadataUpdateInput {
  title: string;
  artistName: string;
  language: Language;
  defaultVocalMode: VocalMode;
  sameVersionConfirmed: boolean;
  genre: string[];
  tags: string[];
  releaseYear: number | null;
  aliases: string[];
  searchHints: string[];
  files: Array<{
    candidateFileId: string;
    selected: boolean;
    proposedVocalMode: VocalMode;
    proposedAssetKind: AssetKind;
  }>;
}

export type ConflictResolution =
  | { resolution: "merge_existing"; targetSongId: string }
  | { resolution: "create_version"; versionSuffix: string };
