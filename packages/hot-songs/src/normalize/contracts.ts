import { z } from "zod";

import {
  SourceRowSchema,
  SourceStatusSchema,
  SourceTypeSchema
} from "../contracts.js";

export const CandidateEvidenceSchema = SourceRowSchema;

export const CandidateIdentitySchema = z.object({
  candidateId: z.string().min(1),
  songKey: z.string().min(1),
  canonicalTitleKey: z.string().min(1),
  baseTitleKey: z.string().min(1),
  canonicalArtistKeys: z.array(z.string().min(1)).min(1),
  variantSignature: z.string().min(1),
  displayTitle: z.string().min(1),
  displayArtists: z.array(z.string().min(1)).min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  sourceTypes: z.array(SourceTypeSchema).min(1),
  warnings: z.array(z.string()),
  evidence: z.array(CandidateEvidenceSchema).min(1)
});

export const CandidateSnapshotSchema = z.object({
  schemaVersion: z.literal("hot-songs.candidate-snapshot.v1"),
  generatedAt: z.string().datetime(),
  sourceRowCount: z.number().int().min(0),
  candidateCount: z.number().int().min(0),
  sourceStatuses: z.array(SourceStatusSchema).optional(),
  candidates: z.array(CandidateIdentitySchema)
});

export type CandidateEvidence = z.infer<typeof CandidateEvidenceSchema>;
export type CandidateIdentity = z.infer<typeof CandidateIdentitySchema>;
export type CandidateSnapshot = z.infer<typeof CandidateSnapshotSchema>;
