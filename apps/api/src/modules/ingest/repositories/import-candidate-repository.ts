import type {
  AssetKind,
  ImportCandidate,
  ImportCandidateFileDetail,
  ImportCandidateStatus,
  ImportCandidateId,
  ImportFileProbeStatus,
  ImportFileRootKind,
  Language,
  VocalMode
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { ImportCandidateFileDetailRow, ImportCandidateRow } from "../../../db/schema.js";

export interface ImportCandidateRepository {
  listCandidates(filters?: ListImportCandidateFilters): Promise<ImportCandidate[]>;
  getCandidateWithFiles(candidateId: ImportCandidateId): Promise<ImportCandidateWithFiles | null>;
  updateCandidateMetadata(
    candidateId: ImportCandidateId,
    input: UpdateImportCandidateMetadataInput
  ): Promise<ImportCandidateWithFiles | null>;
  updateCandidateStatus(
    candidateId: ImportCandidateId,
    input: UpdateImportCandidateStatusInput
  ): Promise<ImportCandidateWithFiles | null>;
  listCandidateFileDetails(candidateId: ImportCandidateId): Promise<ImportCandidateFileDetail[]>;
  upsertCandidateWithFiles(input: UpsertImportCandidateWithFilesInput): Promise<ImportCandidate>;
}

export interface ListImportCandidateFilters {
  statuses?: ImportCandidateStatus[];
}

export interface ImportCandidateWithFiles {
  candidate: ImportCandidate;
  files: ImportCandidateFileDetail[];
}

export interface UpdateImportCandidateMetadataInput {
  title?: string;
  artistName?: string;
  language?: Language;
  sameVersionConfirmed?: boolean;
  genre?: string[];
  tags?: string[];
  aliases?: string[];
  searchHints?: string[];
  releaseYear?: number | null;
  defaultVocalMode?: VocalMode;
  files?: Array<{
    candidateFileId: string;
    selected?: boolean;
    proposedVocalMode?: VocalMode;
    proposedAssetKind?: AssetKind;
  }>;
}

export interface UpdateImportCandidateStatusInput {
  status: ImportCandidateStatus;
  candidateMeta?: Record<string, unknown>;
  reviewNotes?: string | null;
  conflictSongId?: string | null;
}

export interface UpsertImportCandidateWithFilesInput {
  candidate: {
    title: string;
    artistName: string;
    language: Language;
    status?: ImportCandidateStatus;
    candidateMeta?: Record<string, unknown>;
  };
  files: Array<{
    importFileId: string;
    selected: boolean;
    proposedVocalMode: VocalMode;
    proposedAssetKind: AssetKind;
    roleConfidence: number;
    probeDurationMs: number | null;
    probeSummary: Record<string, unknown>;
  }>;
}

interface ReleasableQueryExecutor extends QueryExecutor {
  release(): void;
}

interface TransactionCapableQueryExecutor extends QueryExecutor {
  connect?: () => Promise<ReleasableQueryExecutor>;
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

function requireRow<TRow>(row: TRow | undefined, context: string): TRow {
  if (!row) {
    throw new Error(`${context} did not return a row`);
  }
  return row;
}

function normalizeTitle(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function mapImportCandidateRow(row: ImportCandidateRow): ImportCandidate {
  return {
    id: row.id,
    status: row.status as ImportCandidateStatus,
    title: row.title,
    normalizedTitle: row.normalized_title,
    titlePinyin: row.title_pinyin,
    titleInitials: row.title_initials,
    artistId: row.artist_id,
    artistName: row.artist_name,
    language: row.language as Language,
    genre: row.genre,
    tags: row.tags,
    aliases: row.aliases,
    searchHints: row.search_hints,
    releaseYear: row.release_year,
    canonicalDurationMs: row.canonical_duration_ms,
    defaultCandidateFileId: row.default_candidate_file_id,
    sameVersionConfirmed: row.same_version_confirmed,
    conflictSongId: row.conflict_song_id,
    reviewNotes: row.review_notes,
    candidateMeta: row.candidate_meta,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export function mapImportCandidateFileDetailRow(row: ImportCandidateFileDetailRow): ImportCandidateFileDetail {
  return {
    id: row.candidate_file_id,
    candidateId: row.candidate_id,
    importFileId: row.import_file_id,
    selected: row.selected,
    proposedVocalMode: row.proposed_vocal_mode as VocalMode | null,
    proposedAssetKind: row.proposed_asset_kind as AssetKind | null,
    roleConfidence: row.role_confidence,
    probeDurationMs: row.probe_duration_ms,
    probeSummary: row.probe_summary,
    createdAt: toIsoString(row.candidate_file_created_at),
    updatedAt: toIsoString(row.candidate_file_updated_at),
    rootKind: row.root_kind as ImportFileRootKind,
    relativePath: row.relative_path,
    sizeBytes: row.size_bytes,
    mtimeMs: row.mtime_ms,
    quickHash: row.quick_hash,
    probeStatus: row.probe_status as ImportFileProbeStatus,
    probePayload: row.probe_payload,
    durationMs: row.duration_ms,
    fileCreatedAt: toIsoString(row.import_file_created_at),
    fileUpdatedAt: toIsoString(row.import_file_updated_at)
  };
}

export class PgImportCandidateRepository implements ImportCandidateRepository {
  constructor(private readonly db: QueryExecutor) {}

  async listCandidates(filters: ListImportCandidateFilters = {}): Promise<ImportCandidate[]> {
    const statuses = filters.statuses?.length ? filters.statuses : ["pending", "held", "review_required", "conflict"];
    const result = await this.db.query<ImportCandidateRow>(
      `SELECT id, status, title, normalized_title, title_pinyin, title_initials,
              artist_id, artist_name, language, genre, tags, aliases, search_hints,
              release_year, canonical_duration_ms, default_candidate_file_id,
              same_version_confirmed, conflict_song_id, review_notes, candidate_meta,
              created_at, updated_at
       FROM import_candidates
       WHERE status = ANY($1::text[])
       ORDER BY updated_at DESC, created_at DESC`,
      [statuses]
    );

    return result.rows.map(mapImportCandidateRow);
  }

  async getCandidateWithFiles(candidateId: ImportCandidateId): Promise<ImportCandidateWithFiles | null> {
    const candidate = await this.findCandidateById(this.db, candidateId);
    if (!candidate) {
      return null;
    }

    return {
      candidate,
      files: await this.listCandidateFileDetails(candidateId)
    };
  }

  async updateCandidateMetadata(
    candidateId: ImportCandidateId,
    input: UpdateImportCandidateMetadataInput
  ): Promise<ImportCandidateWithFiles | null> {
    const candidate = await this.withTransaction(async (db) => {
      const existing = await this.findCandidateById(db, candidateId);
      if (!existing) {
        return null;
      }

      const candidateMeta = {
        ...existing.candidateMeta,
        ...(input.defaultVocalMode ? { defaultVocalMode: input.defaultVocalMode } : {})
      };
      const result = await db.query<ImportCandidateRow>(
        `UPDATE import_candidates
         SET title = $2,
             normalized_title = $3,
             artist_name = $4,
             language = $5,
             genre = $6,
             tags = $7,
             aliases = $8,
             search_hints = $9,
             release_year = $10,
             same_version_confirmed = $11,
             candidate_meta = $12::jsonb,
             updated_at = now()
         WHERE id = $1
         RETURNING id, status, title, normalized_title, title_pinyin, title_initials,
                   artist_id, artist_name, language, genre, tags, aliases, search_hints,
                   release_year, canonical_duration_ms, default_candidate_file_id,
                   same_version_confirmed, conflict_song_id, review_notes, candidate_meta,
                   created_at, updated_at`,
        [
          candidateId,
          input.title ?? existing.title,
          normalizeTitle(input.title ?? existing.title),
          input.artistName ?? existing.artistName,
          input.language ?? existing.language,
          input.genre ?? [...existing.genre],
          input.tags ?? [...existing.tags],
          input.aliases ?? [...existing.aliases],
          input.searchHints ?? [...existing.searchHints],
          input.releaseYear ?? existing.releaseYear,
          input.sameVersionConfirmed ?? existing.sameVersionConfirmed,
          candidateMeta
        ]
      );

      for (const file of input.files ?? []) {
        await db.query(
          `UPDATE import_candidate_files
           SET selected = COALESCE($2, selected),
               proposed_vocal_mode = COALESCE($3, proposed_vocal_mode),
               proposed_asset_kind = COALESCE($4, proposed_asset_kind),
               updated_at = now()
           WHERE id = $1 AND candidate_id = $5`,
          [file.candidateFileId, file.selected ?? null, file.proposedVocalMode ?? null, file.proposedAssetKind ?? null, candidateId]
        );
      }

      return mapImportCandidateRow(requireRow(result.rows[0], "import_candidates metadata update"));
    });

    return candidate ? this.getCandidateWithFiles(candidate.id) : null;
  }

  async upsertCandidateWithFiles(input: UpsertImportCandidateWithFilesInput): Promise<ImportCandidate> {
    return this.withTransaction(async (db) => {
      const candidate = await this.upsertCandidate(db, input);
      const candidateFileIds: string[] = [];

      for (const file of input.files) {
        const fileResult = await db.query<{ id: string }>(
          `INSERT INTO import_candidate_files (
             candidate_id, import_file_id, selected, proposed_vocal_mode,
             proposed_asset_kind, role_confidence, probe_duration_ms, probe_summary
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT(candidate_id, import_file_id)
           DO UPDATE SET
             selected = EXCLUDED.selected,
             proposed_vocal_mode = EXCLUDED.proposed_vocal_mode,
             proposed_asset_kind = EXCLUDED.proposed_asset_kind,
             role_confidence = EXCLUDED.role_confidence,
             probe_duration_ms = EXCLUDED.probe_duration_ms,
             probe_summary = EXCLUDED.probe_summary,
             updated_at = now()
           RETURNING id`,
          [
            candidate.id,
            file.importFileId,
            file.selected,
            file.proposedVocalMode,
            file.proposedAssetKind,
            file.roleConfidence,
            file.probeDurationMs,
            file.probeSummary
          ]
        );
        const candidateFileId = fileResult.rows[0]?.id;
        if (candidateFileId) {
          candidateFileIds.push(candidateFileId);
        }
      }

      const returnedCandidate = candidateFileIds[0]
        ? await this.setDefaultCandidateFile(db, candidate.id, candidateFileIds[0])
        : candidate;

      return returnedCandidate;
    });
  }

  async updateCandidateStatus(
    candidateId: ImportCandidateId,
    input: UpdateImportCandidateStatusInput
  ): Promise<ImportCandidateWithFiles | null> {
    const existing = await this.findCandidateById(this.db, candidateId);
    if (!existing) {
      return null;
    }

    const candidateMeta = input.candidateMeta ? { ...existing.candidateMeta, ...input.candidateMeta } : existing.candidateMeta;
    await this.db.query(
      `UPDATE import_candidates
       SET status = $2,
           candidate_meta = $3::jsonb,
           review_notes = $4,
           conflict_song_id = $5,
           updated_at = now()
       WHERE id = $1`,
      [
        candidateId,
        input.status,
        candidateMeta,
        input.reviewNotes ?? existing.reviewNotes,
        input.conflictSongId ?? existing.conflictSongId
      ]
    );

    return this.getCandidateWithFiles(candidateId);
  }

  async listCandidateFileDetails(candidateId: ImportCandidateId): Promise<ImportCandidateFileDetail[]> {
    const result = await this.db.query<ImportCandidateFileDetailRow>(
      `SELECT icf.id AS candidate_file_id,
              icf.candidate_id,
              icf.import_file_id,
              icf.selected,
              icf.proposed_vocal_mode,
              icf.proposed_asset_kind,
              icf.role_confidence,
              icf.probe_duration_ms,
              icf.probe_summary,
              icf.created_at AS candidate_file_created_at,
              icf.updated_at AS candidate_file_updated_at,
              inf.root_kind,
              inf.relative_path,
              inf.size_bytes,
              inf.mtime_ms,
              inf.quick_hash,
              inf.probe_status,
              inf.probe_payload,
              inf.duration_ms,
              inf.created_at AS import_file_created_at,
              inf.updated_at AS import_file_updated_at
       FROM import_candidate_files icf
       INNER JOIN import_files inf ON inf.id = icf.import_file_id
       WHERE icf.candidate_id = $1
       ORDER BY icf.selected DESC, icf.created_at ASC`,
      [candidateId]
    );

    return result.rows.map(mapImportCandidateFileDetailRow);
  }

  private async findCandidateById(db: QueryExecutor, candidateId: ImportCandidateId): Promise<ImportCandidate | null> {
    const result = await db.query<ImportCandidateRow>(
      `SELECT id, status, title, normalized_title, title_pinyin, title_initials,
              artist_id, artist_name, language, genre, tags, aliases, search_hints,
              release_year, canonical_duration_ms, default_candidate_file_id,
              same_version_confirmed, conflict_song_id, review_notes, candidate_meta,
              created_at, updated_at
       FROM import_candidates
       WHERE id = $1
       LIMIT 1`,
      [candidateId]
    );

    const row = result.rows[0];
    return row ? mapImportCandidateRow(row) : null;
  }

  private async withTransaction<TResult>(work: (db: QueryExecutor) => Promise<TResult>): Promise<TResult> {
    const connect = (this.db as TransactionCapableQueryExecutor).connect;

    if (typeof connect === "function") {
      const client = await connect.call(this.db);
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    await this.db.query("BEGIN");
    try {
      const result = await work(this.db);
      await this.db.query("COMMIT");
      return result;
    } catch (error) {
      await this.db.query("ROLLBACK");
      throw error;
    }
  }

  private async upsertCandidate(db: QueryExecutor, input: UpsertImportCandidateWithFilesInput): Promise<ImportCandidate> {
    const groupKey = typeof input.candidate.candidateMeta?.groupKey === "string" ? input.candidate.candidateMeta.groupKey : null;
    const existingId = groupKey ? await this.findExistingCandidateId(db, groupKey) : null;

    if (existingId) {
      const result = await db.query<ImportCandidateRow>(
        `UPDATE import_candidates
         SET status = $2,
             title = $3,
             normalized_title = $4,
             artist_name = $5,
             language = $6,
             candidate_meta = $7::jsonb,
             updated_at = now()
         WHERE id = $1
         RETURNING id, status, title, normalized_title, title_pinyin, title_initials,
                   artist_id, artist_name, language, genre, tags, aliases, search_hints,
                   release_year, canonical_duration_ms, default_candidate_file_id,
                   same_version_confirmed, conflict_song_id, review_notes, candidate_meta,
                   created_at, updated_at`,
        [
          existingId,
          input.candidate.status ?? "pending",
          input.candidate.title,
          normalizeTitle(input.candidate.title),
          input.candidate.artistName,
          input.candidate.language,
          input.candidate.candidateMeta ?? {}
        ]
      );
      return mapImportCandidateRow(requireRow(result.rows[0], "import_candidates update"));
    }

    const result = await db.query<ImportCandidateRow>(
      `INSERT INTO import_candidates (
         status, title, normalized_title, artist_name, language, candidate_meta
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, status, title, normalized_title, title_pinyin, title_initials,
                 artist_id, artist_name, language, genre, tags, aliases, search_hints,
                 release_year, canonical_duration_ms, default_candidate_file_id,
                 same_version_confirmed, conflict_song_id, review_notes, candidate_meta,
                 created_at, updated_at`,
      [
        input.candidate.status ?? "pending",
        input.candidate.title,
        normalizeTitle(input.candidate.title),
        input.candidate.artistName,
        input.candidate.language,
        input.candidate.candidateMeta ?? {}
      ]
    );

    return mapImportCandidateRow(requireRow(result.rows[0], "import_candidates insert"));
  }

  private async findExistingCandidateId(db: QueryExecutor, groupKey: string): Promise<string | null> {
    const result = await db.query<{ id: string }>(
      `SELECT id
       FROM import_candidates
       WHERE candidate_meta->>'groupKey' = $1
         AND status IN ('pending', 'held', 'review_required', 'conflict')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [groupKey]
    );

    return result.rows[0]?.id ?? null;
  }

  private async setDefaultCandidateFile(
    db: QueryExecutor,
    candidateId: string,
    candidateFileId: string
  ): Promise<ImportCandidate> {
    const result = await db.query<ImportCandidateRow>(
      `UPDATE import_candidates
       SET default_candidate_file_id = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING id, status, title, normalized_title, title_pinyin, title_initials,
                 artist_id, artist_name, language, genre, tags, aliases, search_hints,
                 release_year, canonical_duration_ms, default_candidate_file_id,
                 same_version_confirmed, conflict_song_id, review_notes, candidate_meta,
                 created_at, updated_at`,
      [candidateId, candidateFileId]
    );

    return mapImportCandidateRow(requireRow(result.rows[0], "import_candidates default candidate file update"));
  }
}
