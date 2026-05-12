import type { SourceDefinition, SourceManifest, SourceRow } from "../contracts.js";
import type { CandidateIdentity, CandidateSnapshot } from "../normalize/contracts.js";
import { normalizeArtistKey, normalizeSearchText } from "../normalize/text.js";
import {
  buildAliasLookup,
  resolveAlias,
  type FusionAliases
} from "./aliases.js";
import {
  FusionReportSchema,
  type FusionContribution,
  type FusionReport,
  type NearDuplicate,
  type RankedSong
} from "./contracts.js";

export const rankDecayBase = 60;
// Uniform display scale: it preserves ordering while making scores read as points.
export const scorePointScale = 10;
const unknownArtistLabel = "未知歌手";

export type BuildFusionReportInput = {
  manifest: SourceManifest;
  snapshot: CandidateSnapshot;
  aliases?: FusionAliases;
};

type FusionGroup = {
  key: string;
  titleKey: string;
  artistKeys: string[];
  variantSignature: string;
  candidates: CandidateIdentity[];
};

export function scoreEvidence(
  row: SourceRow,
  source: SourceDefinition
): number {
  const rank = row.rank ?? source.targetRows;
  return (
    source.weight * scorePointScale * rankDecayBase / (rankDecayBase + rank)
  );
}

export function buildFusionReport(input: BuildFusionReportInput): FusionReport {
  const sourcesById = new Map(
    input.manifest.sources.map((source) => [source.id, source])
  );
  const groups = groupCandidates(input.snapshot.candidates, input.aliases);
  const rankedSongs = groups
    .map((group) => buildRankedSong(group, sourcesById))
    .filter((song): song is Omit<RankedSong, "rank"> => song !== null)
    .sort(compareUnrankedSongs)
    .map((song, index) => ({ ...song, rank: index + 1 }));

  return FusionReportSchema.parse({
    schemaVersion: "hot-songs.fusion-report.v1",
    generatedAt: input.snapshot.generatedAt,
    candidateCount: input.snapshot.candidateCount,
    rankedCount: rankedSongs.length,
    rankedSongs,
    nearDuplicates: buildNearDuplicates(groups)
  });
}

function groupCandidates(
  candidates: CandidateIdentity[],
  aliases: FusionAliases | undefined
): FusionGroup[] {
  const titleAliasLookup = buildAliasLookup(
    aliases?.titleAliases,
    normalizeSearchText
  );
  const artistAliasLookup = buildAliasLookup(
    aliases?.artistAliases,
    normalizeArtistKey
  );
  const groups = new Map<string, FusionGroup>();

  for (const candidate of candidates) {
    const titleKey = resolveAlias(candidate.baseTitleKey, titleAliasLookup);
    const artistKeys = candidate.canonicalArtistKeys
      .map((artistKey) => resolveAlias(artistKey, artistAliasLookup))
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
    const key = [
      `title:${titleKey}`,
      `artists:${artistKeys.join("+")}`,
      `variant:${candidate.variantSignature}`
    ].join("|");
    const group = groups.get(key) ?? {
      key,
      titleKey,
      artistKeys,
      variantSignature: candidate.variantSignature,
      candidates: []
    };

    group.candidates.push(candidate);
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function buildRankedSong(
  group: FusionGroup,
  sourcesById: Map<string, SourceDefinition>
): Omit<RankedSong, "rank"> | null {
  const bestContributions = new Map<string, FusionContribution>();
  const warnings: string[] = [];

  for (const row of group.candidates.flatMap((candidate) => candidate.evidence)) {
    const source = sourcesById.get(row.sourceId);
    if (source === undefined) {
      warnings.push(`unknown-source:${row.sourceId}`);
      continue;
    }

    const contribution: FusionContribution = {
      sourceId: source.id,
      sourceName: source.name,
      sourceWeight: source.weight,
      rank: row.rank,
      score: scoreEvidence(row, source)
    };
    const previous = bestContributions.get(source.id);
    if (previous === undefined || contribution.score > previous.score) {
      bestContributions.set(source.id, contribution);
    }
  }

  const contributions = [...bestContributions.values()].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId)
  );
  if (contributions.length === 0) {
    return null;
  }

  const displayEvidence = chooseDisplayEvidence(group, sourcesById);
  const displayArtists =
    displayEvidence.rawArtists.length > 0
      ? displayEvidence.rawArtists
      : group.candidates[0]?.displayArtists ?? [unknownArtistLabel];
  const candidateWarnings = group.candidates.flatMap((candidate) => candidate.warnings);

  return {
    title: displayEvidence.rawTitle,
    artist: displayArtists.join(" / "),
    score: sum(contributions.map((contribution) => contribution.score)),
    candidateIds: uniqueSorted(group.candidates.map((candidate) => candidate.candidateId)),
    sourceIds: uniqueSorted(contributions.map((contribution) => contribution.sourceId)),
    contributions,
    warnings: uniqueSorted([...candidateWarnings, ...warnings])
  };
}

function chooseDisplayEvidence(
  group: FusionGroup,
  sourcesById: Map<string, SourceDefinition>
): SourceRow {
  const evidence = group.candidates.flatMap((candidate) => candidate.evidence);
  const sortedEvidence = [...evidence].sort((left, right) => {
    const leftSource = sourcesById.get(left.sourceId);
    const rightSource = sourcesById.get(right.sourceId);

    return (
      sourceTypePriority(leftSource) - sourceTypePriority(rightSource) ||
      rankPriority(left.rank) - rankPriority(right.rank) ||
      left.sourceId.localeCompare(right.sourceId) ||
      left.rawTitle.localeCompare(right.rawTitle, "zh-Hans-CN")
    );
  });
  const displayEvidence = sortedEvidence[0];
  if (displayEvidence === undefined) {
    throw new Error("Cannot choose display evidence from an empty fusion group");
  }

  return displayEvidence;
}

function buildNearDuplicates(groups: FusionGroup[]): NearDuplicate[] {
  const duplicates: NearDuplicate[] = [];

  for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
    const left = groups[leftIndex];
    if (left === undefined) {
      continue;
    }

    for (const right of groups.slice(leftIndex + 1)) {
      if (
        left.variantSignature !== right.variantSignature ||
        left.artistKeys.join("+") !== right.artistKeys.join("+")
      ) {
        continue;
      }

      const similarity = titleSimilarity(left.titleKey, right.titleKey);
      if (similarity.score < 0.72 && similarity.reason !== "title-contained") {
        continue;
      }

      duplicates.push({
        leftCandidateIds: uniqueSorted(left.candidates.map((candidate) => candidate.candidateId)),
        rightCandidateIds: uniqueSorted(right.candidates.map((candidate) => candidate.candidateId)),
        leftTitle: displayTitleForGroup(left),
        rightTitle: displayTitleForGroup(right),
        artist: displayArtistForGroup(left),
        similarity: similarity.score,
        reason: similarity.reason
      });
    }
  }

  return duplicates.sort(
    (left, right) =>
      left.leftTitle.localeCompare(right.leftTitle, "zh-Hans-CN") ||
      left.rightTitle.localeCompare(right.rightTitle, "zh-Hans-CN")
  );
}

function titleSimilarity(
  leftTitleKey: string,
  rightTitleKey: string
): { score: number; reason: string } {
  const left = leftTitleKey.trim();
  const right = rightTitleKey.trim();
  if (left.length === 0 || right.length === 0) {
    return { score: 0, reason: "empty-title" };
  }

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 3 && longer.includes(shorter)) {
    return { score: shorter.length / longer.length, reason: "title-contained" };
  }

  return { score: diceCoefficient(left, right), reason: "title-similar" };
}

function diceCoefficient(left: string, right: string): number {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return left === right ? 1 : 0;
  }

  const rightCounts = new Map<string, number>();
  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const bigram of leftBigrams) {
    const count = rightCounts.get(bigram) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(bigram, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function bigrams(value: string): string[] {
  const chars = [...value.replace(/\s+/gu, "")];
  if (chars.length < 2) {
    return chars;
  }

  return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
}

function displayTitleForGroup(group: FusionGroup): string {
  return group.candidates[0]?.displayTitle ?? group.titleKey;
}

function displayArtistForGroup(group: FusionGroup): string {
  return group.candidates[0]?.displayArtists.join(" / ") ?? group.artistKeys.join(" / ");
}

function compareUnrankedSongs(
  left: Omit<RankedSong, "rank">,
  right: Omit<RankedSong, "rank">
): number {
  return (
    compareScore(right.score, left.score) ||
    left.title.localeCompare(right.title, "zh-Hans-CN") ||
    left.artist.localeCompare(right.artist, "zh-Hans-CN")
  );
}

function compareScore(left: number, right: number): number {
  const diff = left - right;
  return Math.abs(diff) < 1e-9 ? 0 : diff;
}

function sourceTypePriority(source: SourceDefinition | undefined): number {
  return source?.sourceType === "ktv_first" ? 0 : 1;
}

function rankPriority(rank: number | null): number {
  return rank ?? Number.MAX_SAFE_INTEGER;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) =>
    left.localeCompare(right, "zh-Hans-CN")
  );
}
