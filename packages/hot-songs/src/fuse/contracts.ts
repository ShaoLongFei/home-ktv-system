import { z } from "zod";

export const FusionContributionSchema = z.object({
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  sourceWeight: z.number().int().min(1),
  rank: z.number().int().min(1).nullable(),
  score: z.number().nonnegative()
});

export const RankedSongSchema = z.object({
  rank: z.number().int().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  score: z.number().nonnegative(),
  candidateIds: z.array(z.string().min(1)).min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  contributions: z.array(FusionContributionSchema).min(1),
  warnings: z.array(z.string())
});

export const NearDuplicateSchema = z.object({
  leftCandidateIds: z.array(z.string().min(1)).min(1),
  rightCandidateIds: z.array(z.string().min(1)).min(1),
  leftTitle: z.string().min(1),
  rightTitle: z.string().min(1),
  artist: z.string().min(1),
  similarity: z.number().min(0).max(1),
  reason: z.string().min(1)
});

export const FusionReportSchema = z.object({
  schemaVersion: z.literal("hot-songs.fusion-report.v1"),
  generatedAt: z.string().datetime(),
  candidateCount: z.number().int().min(0),
  rankedCount: z.number().int().min(0),
  rankedSongs: z.array(RankedSongSchema),
  nearDuplicates: z.array(NearDuplicateSchema)
});

export type FusionContribution = z.infer<typeof FusionContributionSchema>;
export type RankedSong = z.infer<typeof RankedSongSchema>;
export type NearDuplicate = z.infer<typeof NearDuplicateSchema>;
export type FusionReport = z.infer<typeof FusionReportSchema>;
