import { createHash } from "node:crypto";

import type { SourceDefinition, SourceRow, SourceStatus } from "../contracts.js";
import {
  CandidateIdentitySchema,
  CandidateSnapshotSchema,
  type CandidateIdentity,
  type CandidateSnapshot
} from "./contracts.js";
import { normalizeArtistKeys, normalizeTitleIdentity } from "./text.js";

type SourceType = SourceDefinition["sourceType"];
const unknownArtistLabel = "未知歌手";

export type BuildCandidateSnapshotInput = {
  rows: SourceRow[];
  sourceStatuses?: SourceStatus[];
  generatedAt?: string;
};

export type SongKeyParts = {
  canonicalTitleKey: string;
  canonicalArtistKeys: string[];
  variantSignature: string;
};

export function buildCandidateSnapshot(
  input: BuildCandidateSnapshotInput
): CandidateSnapshot {
  const groups = new Map<string, SourceRow[]>();

  for (const row of input.rows) {
    const titleIdentity = normalizeTitleIdentity(row.rawTitle);
    const canonicalArtistKeys = ensureArtistKeys(normalizeArtistKeys(row.rawArtists));
    const songKey = buildSongKey({
      canonicalTitleKey: titleIdentity.canonicalTitleKey,
      canonicalArtistKeys,
      variantSignature: titleIdentity.variantSignature
    });
    groups.set(songKey, [...(groups.get(songKey) ?? []), row]);
  }

  const candidates = [...groups.values()]
    .map(buildCandidateIdentity)
    .sort((left, right) => left.songKey.localeCompare(right.songKey));

  return CandidateSnapshotSchema.parse({
    schemaVersion: "hot-songs.candidate-snapshot.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceRowCount: input.rows.length,
    candidateCount: candidates.length,
    sourceStatuses: input.sourceStatuses,
    candidates
  });
}

export function buildCandidateIdentity(rows: SourceRow[]): CandidateIdentity {
  if (rows.length === 0) {
    throw new Error("Cannot build a candidate without source rows");
  }

  const sortedEvidence = [...rows].sort(compareEvidencePriority);
  const displayEvidence = sortedEvidence[0];
  if (displayEvidence === undefined) {
    throw new Error("Cannot build a candidate without display evidence");
  }

  const titleIdentity = normalizeTitleIdentity(displayEvidence.rawTitle);
  const canonicalArtistKeys = ensureArtistKeys(normalizeArtistKeys(displayEvidence.rawArtists));
  const songKey = buildSongKey({
    canonicalTitleKey: titleIdentity.canonicalTitleKey,
    canonicalArtistKeys,
    variantSignature: titleIdentity.variantSignature
  });
  const warnings = uniqueSorted([
    ...titleIdentity.warnings,
    ...sortedEvidence.flatMap((row) => row.warnings)
  ]);

  return CandidateIdentitySchema.parse({
    candidateId: buildCandidateId(songKey),
    songKey,
    canonicalTitleKey: titleIdentity.canonicalTitleKey,
    baseTitleKey: titleIdentity.baseTitleKey,
    canonicalArtistKeys,
    variantSignature: titleIdentity.variantSignature,
    displayTitle: displayEvidence.rawTitle,
    displayArtists: ensureDisplayArtists(displayEvidence.rawArtists),
    sourceIds: uniqueSorted(sortedEvidence.map((row) => row.sourceId)),
    sourceTypes: uniqueSourceTypes(sortedEvidence.map((row) => row.sourceType)),
    warnings,
    evidence: sortedEvidence
  });
}

export function buildSongKey(parts: SongKeyParts): string {
  return [
    `title:${parts.canonicalTitleKey}`,
    `artists:${parts.canonicalArtistKeys.join("+")}`,
    `variant:${parts.variantSignature}`
  ].join("|");
}

export function buildCandidateId(songKey: string): string {
  return `song_${createHash("sha256").update(songKey).digest("hex").slice(0, 16)}`;
}

function compareEvidencePriority(left: SourceRow, right: SourceRow): number {
  return (
    sourceTypePriority(left.sourceType) - sourceTypePriority(right.sourceType) ||
    rankPriority(left.rank) - rankPriority(right.rank) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.rawTitle.localeCompare(right.rawTitle)
  );
}

function sourceTypePriority(sourceType: SourceType): number {
  return sourceType === "ktv_first" ? 0 : 1;
}

function rankPriority(rank: number | null): number {
  return rank ?? Number.MAX_SAFE_INTEGER;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function uniqueSourceTypes(values: SourceType[]): SourceType[] {
  return values.includes("ktv_first") && values.includes("support")
    ? ["ktv_first", "support"]
    : values.includes("ktv_first")
      ? ["ktv_first"]
      : ["support"];
}

function ensureArtistKeys(values: string[]): string[] {
  return values.length > 0 ? values : [unknownArtistLabel];
}

function ensureDisplayArtists(values: string[]): string[] {
  return values.length > 0 ? values : [unknownArtistLabel];
}
