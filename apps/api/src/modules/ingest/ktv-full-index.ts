import path from "node:path";
import { randomUUID } from "node:crypto";
import type { QueryExecutor } from "../../db/query-executor.js";
import { buildPinyinSearchKeys, normalizeSearchText } from "../catalog/search-normalization.js";
import {
  buildKtvSampleRow,
  type KtvSampleParseStrategy,
  type KtvSampleSourceFile
} from "./ktv-sample-index.js";
import { cleanSongTitle } from "./song-title-cleanup.js";
import { isVarietyShowName } from "./variety-show-metadata.js";

export interface KtvIndexAssetDraft {
  title: string;
  normalizedTitle: string;
  titlePinyin: string;
  titleInitials: string;
  artistNames: string[];
  filePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  sizeBytes: number | null;
  mtimeMs: number | null;
  parseStrategy: KtvSampleParseStrategy;
  parseConfidence: number;
  technicalStatus: "pending" | "probed" | "failed";
  technicalMetadata: Record<string, unknown>;
}

export interface IndexKtvAssetDraftsInput {
  sourceRoot: string;
  sshHost?: string | undefined;
  drafts: readonly KtvIndexAssetDraft[];
  batchSize?: number;
  markMissingAssets?: boolean;
  preserveExisting?: boolean;
}

export interface IndexKtvAssetDraftsResult {
  runId: string;
  filesSeen: number;
  songsUpserted: number;
  assetsUpserted: number;
  assetsMarkedMissing: number;
}

interface IdRow {
  id: string;
}

export function buildKtvIndexAssetDraft(sourceFile: KtvSampleSourceFile): KtvIndexAssetDraft {
  const sample = buildKtvSampleRow(sourceFile);
  const cleanTitle = cleanSongTitle({ title: sample.title }).title;
  const titleKeys = buildPinyinSearchKeys(cleanTitle);
  const artistNames = splitArtistNames(sample.artistName);

  return {
    title: cleanTitle,
    normalizedTitle: normalizeSearchText(cleanTitle),
    titlePinyin: titleKeys.pinyin,
    titleInitials: titleKeys.initials,
    artistNames,
    filePath: sample.sourcePath,
    relativePath: sample.relativePath,
    fileName: sample.fileName,
    extension: sample.extension || path.extname(sample.fileName).toLocaleLowerCase(),
    sizeBytes: sample.sizeBytes,
    mtimeMs: sample.mtimeMs,
    parseStrategy: sample.parseStrategy,
    parseConfidence: sample.parseConfidence,
    technicalStatus: "pending",
    technicalMetadata: {}
  };
}

export async function indexKtvAssetDrafts(
  db: QueryExecutor,
  input: IndexKtvAssetDraftsInput
): Promise<IndexKtvAssetDraftsResult> {
  const runId = await startRun(db, input);
  let songsUpserted = 0;
  let assetsUpserted = 0;
  let assetsMarkedMissing = 0;

  try {
    for (const draft of input.drafts) {
      const primaryArtistName = draft.artistNames[0] ?? "Unknown Artist";
      await upsertSong(db, draft, primaryArtistName, runId, input.sourceRoot, input.sshHost, input.preserveExisting);
      songsUpserted += 1;
      assetsUpserted += 1;
    }

    if (input.markMissingAssets) {
      assetsMarkedMissing = await markMissingAssets(db, runId);
    }

    return {
      runId,
      filesSeen: input.drafts.length,
      songsUpserted,
      assetsUpserted,
      assetsMarkedMissing
    };
  } catch (error) {
    throw error;
  }
}

export function splitArtistNames(value: string): string[] {
  const parts = value
    .split(/(?:_|&|、|，|,|\/|\s{2,})/u)
    .map((part) => part.trim())
    .filter((part) => part && !isVarietyShowName(part));
  return parts.length ? parts : ["Unknown Artist"];
}

async function startRun(db: QueryExecutor, input: IndexKtvAssetDraftsInput): Promise<string> {
  void db;
  void input;
  return randomUUID();
}

async function upsertSong(
  db: QueryExecutor,
  draft: KtvIndexAssetDraft,
  primaryArtistName: string,
  runId: string,
  sourceRoot: string,
  sshHost: string | undefined,
  preserveExisting: boolean | undefined
): Promise<string> {
  const normalizedPrimaryArtistName = normalizeSearchText(primaryArtistName);
  const result = await db.query<IdRow>(
    buildKtvSongsUpsertSql(Boolean(preserveExisting)),
    [
      draft.title,
      draft.normalizedTitle,
      draft.titlePinyin,
      draft.titleInitials,
      primaryArtistName,
      normalizedPrimaryArtistName,
      draft.artistNames,
      [],
      draft.filePath,
      draft.relativePath,
      draft.fileName,
      draft.extension,
      draft.sizeBytes,
      draft.mtimeMs,
      draft.parseStrategy,
      draft.parseConfidence,
      draft.technicalStatus,
      JSON.stringify(draft.technicalMetadata),
      sourceRoot,
      sshHost ?? null,
      runId
    ]
  );
  return requireRow(result.rows[0], "ktv_songs upsert").id;
}

function buildKtvSongsUpsertSql(preserveExisting: boolean): string {
  return `INSERT INTO ktv_songs (
       title, normalized_title, title_pinyin, title_initials,
       primary_artist_name, normalized_primary_artist_name,
       artist_names, style_tags,
       file_path, relative_path, file_name, extension,
       size_bytes, mtime_ms, parse_strategy, parse_confidence,
       technical_status, technical_metadata,
       source_root, ssh_host, first_seen_run_id, last_seen_run_id, missing_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, $21, NULL)
     ON CONFLICT (file_path)
     DO UPDATE SET
       ${preserveExisting ? [
         "relative_path = EXCLUDED.relative_path",
         "file_name = EXCLUDED.file_name",
         "extension = EXCLUDED.extension",
         "size_bytes = EXCLUDED.size_bytes",
         "mtime_ms = EXCLUDED.mtime_ms",
         "source_root = EXCLUDED.source_root",
         "ssh_host = EXCLUDED.ssh_host",
         "last_seen_run_id = EXCLUDED.last_seen_run_id",
         "missing_at = NULL",
         "updated_at = now()"
       ].join(",\n       ") : [
         "title = EXCLUDED.title",
         "normalized_title = EXCLUDED.normalized_title",
         "title_pinyin = EXCLUDED.title_pinyin",
         "title_initials = EXCLUDED.title_initials",
         "primary_artist_name = EXCLUDED.primary_artist_name",
         "normalized_primary_artist_name = EXCLUDED.normalized_primary_artist_name",
         "artist_names = EXCLUDED.artist_names",
         "style_tags = EXCLUDED.style_tags",
         "relative_path = EXCLUDED.relative_path",
         "file_name = EXCLUDED.file_name",
         "extension = EXCLUDED.extension",
         "size_bytes = EXCLUDED.size_bytes",
         "mtime_ms = EXCLUDED.mtime_ms",
         "parse_strategy = EXCLUDED.parse_strategy",
         "parse_confidence = EXCLUDED.parse_confidence",
         "technical_status = EXCLUDED.technical_status",
         "technical_metadata = EXCLUDED.technical_metadata",
         "source_root = EXCLUDED.source_root",
         "ssh_host = EXCLUDED.ssh_host",
         "last_seen_run_id = EXCLUDED.last_seen_run_id",
         "missing_at = NULL",
         "updated_at = now()"
       ].join(",\n       ")}
     RETURNING id`;
}

async function markMissingAssets(db: QueryExecutor, runId: string): Promise<number> {
  const result = await db.query<{ count: number | string }>(
    `WITH marked AS (
       UPDATE ktv_songs
       SET missing_at = now(),
           updated_at = now()
       WHERE last_seen_run_id IS DISTINCT FROM $1
         AND missing_at IS NULL
         AND source_root NOT LIKE 'online:%'
       RETURNING 1
     )
     SELECT count(*)::int AS count FROM marked`,
    [runId]
  );
  const row = requireRow(result.rows[0], "ktv_songs missing marker");
  return typeof row.count === "number" ? row.count : Number.parseInt(row.count, 10);
}

function requireRow<TRow>(row: TRow | undefined, context: string): TRow {
  if (!row) {
    throw new Error(`${context} did not return a row`);
  }
  return row;
}
