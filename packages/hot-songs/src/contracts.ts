import { z } from "zod";

export const SourceTypeSchema = z.enum(["ktv_first", "support"]);
export const SourceKindSchema = z.enum(["public_chart", "manual_snapshot"]);
export const ProviderSchema = z.enum([
  "qq_music",
  "cavca",
  "kugou",
  "netease",
  "manual",
  "spotify",
  "holiday_ktv",
  "silverbox",
  "vv_music"
]);
export const AdapterSchema = z.enum([
  "qq_toplist",
  "kugou_rank_html",
  "netease_toplist_html",
  "tencent_music_yobang",
  "spotify_playlist",
  "holiday_ktv_rank",
  "silverbox_rank_html",
  "vv_music_rank_html",
  "manual_json"
]);
export const SourceStatusValueSchema = z.enum([
  "succeeded",
  "platform_cap",
  "failed_below_min_rows",
  "failed",
  "stale",
  "skipped"
]);

const forbiddenHeaderNames = new Set([
  "cookie",
  "authorization",
  "x-token",
  "x-auth-token"
]);

export const SourceDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    name: z.string().min(1),
    provider: ProviderSchema,
    sourceType: SourceTypeSchema,
    sourceKind: SourceKindSchema,
    adapter: AdapterSchema,
    weight: z.number().int().min(1).max(200),
    enabled: z.boolean().default(true),
    required: z.boolean().default(false),
    url: z.string().url().optional(),
    urls: z.array(z.string().url()).min(1).optional(),
    file: z.string().min(1).optional(),
    topId: z.number().int().min(1).optional(),
    targetRows: z.number().int().min(1).default(500),
    minRows: z.number().int().min(1).optional(),
    platformCapRows: z.number().int().min(1).optional(),
    authCookieEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/u)
      .optional(),
    expectedMinRows: z.number().int().min(1).default(1),
    staleAfterDays: z.number().int().min(1).default(14),
    usableWhenStale: z.boolean().default(false),
    headers: z.record(z.string(), z.string()).optional()
  })
  .superRefine((source, ctx) => {
    for (const headerName of Object.keys(source.headers ?? {})) {
      const normalizedHeader = headerName.toLowerCase();
      if (forbiddenHeaderNames.has(normalizedHeader)) {
        ctx.addIssue({
          code: "custom",
          path: ["headers", headerName],
          message:
            "Phase 12 only supports public metadata sources; auth headers are not allowed"
        });
      }
    }

    if (
      source.sourceKind === "public_chart" &&
      source.url === undefined &&
      source.urls === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "url or urls is required for public_chart sources"
      });
    }

    if (source.sourceKind === "manual_snapshot" && source.file === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: "file is required for manual_snapshot sources"
      });
    }
  });

export const SourceManifestSchema = z.object({
  schemaVersion: z.literal("hot-songs.source-manifest.v1"),
  sources: z.array(SourceDefinitionSchema).min(1)
}).superRefine((manifest, ctx) => {
  const seen = new Map<string, number>();
  manifest.sources.forEach((source, index) => {
    const firstIndex = seen.get(source.id);
    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["sources", index, "id"],
        message: `duplicate source id ${source.id} (first seen at index ${firstIndex})`
      });
      return;
    }

    seen.set(source.id, index);
  });
});

export const ManualSnapshotSchema = z.object({
  schemaVersion: z.literal("hot-songs.manual-source.v1"),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  capturedAt: z.string().datetime(),
  rows: z
    .array(
      z.object({
        rank: z.number().int().min(1).nullable(),
        title: z.string().min(1),
        artists: z.array(z.string().min(1)).min(1),
        notes: z.string().optional()
      })
    )
    .min(1)
});

export const SourceRowSchema = z.object({
  sourceId: z.string().min(1),
  sourceType: SourceTypeSchema,
  provider: ProviderSchema,
  rank: z.number().int().min(1).nullable(),
  rawTitle: z.string().min(1),
  rawArtists: z.array(z.string().min(1)),
  sourceUrl: z.string().url().nullable(),
  sourcePublishedAt: z.string().nullable(),
  collectedAt: z.string().datetime(),
  warnings: z.array(z.string())
});

export const SourceStatusSchema = z.object({
  sourceId: z.string().min(1),
  status: SourceStatusValueSchema,
  usable: z.boolean(),
  rowCount: z.number().int().min(0),
  targetRows: z.number().int().min(1).optional(),
  minRows: z.number().int().min(1).optional(),
  platformCapRows: z.number().int().min(1).optional(),
  authCookieEnv: z.string().optional(),
  authUsed: z.boolean().optional(),
  warnings: z.array(z.string()),
  error: z.string().optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime()
});

export type SourceDefinition = z.infer<typeof SourceDefinitionSchema>;
export type SourceManifest = z.infer<typeof SourceManifestSchema>;
export type ManualSnapshot = z.infer<typeof ManualSnapshotSchema>;
export type SourceRow = z.infer<typeof SourceRowSchema>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export type SourceStatusValue = z.infer<typeof SourceStatusValueSchema>;
