import type { ImportFile, ImportFileProbeStatus, ImportFileRootKind } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { ImportFileRow } from "../../../db/schema.js";

export interface UpsertDiscoveredFileInput {
  rootKind: ImportFileRootKind;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  quickHash: string;
  probeStatus: ImportFileProbeStatus;
  probePayload: Record<string, unknown>;
  durationMs: number | null;
  lastSeenScanRunId: string;
}

export interface MarkDeletedInput {
  rootKind: ImportFileRootKind;
  relativePath: string;
}

export interface UpdateImportFileLocationInput {
  importFileId: string;
  rootKind: ImportFileRootKind;
  relativePath: string;
}

export interface ImportFileRepository {
  findByRootAndRelativePath(rootKind: ImportFileRootKind, relativePath: string): Promise<ImportFile | null>;
  upsertDiscoveredFile(input: UpsertDiscoveredFileInput): Promise<ImportFile>;
  updateFileLocation(input: UpdateImportFileLocationInput): Promise<void>;
  markDeleted(input: MarkDeletedInput): Promise<void>;
  markDeletedById(importFileId: string): Promise<void>;
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function requireRow<TRow>(row: TRow | undefined, context: string): TRow {
  if (!row) {
    throw new Error(`${context} did not return a row`);
  }
  return row;
}

export function mapImportFileRow(row: ImportFileRow): ImportFile {
  return {
    id: row.id,
    lastSeenScanRunId: row.last_seen_scan_run_id,
    rootKind: row.root_kind as ImportFileRootKind,
    relativePath: row.relative_path,
    sizeBytes: Number(row.size_bytes),
    mtimeMs: Number(row.mtime_ms),
    quickHash: row.quick_hash,
    probeStatus: row.probe_status as ImportFileProbeStatus,
    probePayload: row.probe_payload,
    durationMs: row.duration_ms,
    lastScannedAt: toIsoString(row.last_scanned_at),
    deletedAt: toIsoString(row.deleted_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class PgImportFileRepository implements ImportFileRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findByRootAndRelativePath(rootKind: ImportFileRootKind, relativePath: string): Promise<ImportFile | null> {
    const result = await this.db.query<ImportFileRow>(
      `SELECT id, last_seen_scan_run_id, root_kind, relative_path, size_bytes, mtime_ms,
              quick_hash, probe_status, probe_payload, duration_ms, last_scanned_at,
              deleted_at, created_at, updated_at
       FROM import_files
       WHERE root_kind = $1 AND relative_path = $2
       LIMIT 1`,
      [rootKind, relativePath]
    );

    const row = result.rows[0];
    return row ? mapImportFileRow(row) : null;
  }

  async upsertDiscoveredFile(input: UpsertDiscoveredFileInput): Promise<ImportFile> {
    const result = await this.db.query<ImportFileRow>(
      `INSERT INTO import_files (
         last_seen_scan_run_id, root_kind, relative_path, size_bytes, mtime_ms,
         quick_hash, probe_status, probe_payload, duration_ms, last_scanned_at, deleted_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now(), NULL)
       ON CONFLICT(root_kind, relative_path)
       DO UPDATE SET
         last_seen_scan_run_id = EXCLUDED.last_seen_scan_run_id,
         size_bytes = EXCLUDED.size_bytes,
         mtime_ms = EXCLUDED.mtime_ms,
         quick_hash = EXCLUDED.quick_hash,
         probe_status = EXCLUDED.probe_status,
         probe_payload = EXCLUDED.probe_payload,
         duration_ms = EXCLUDED.duration_ms,
         last_scanned_at = now(),
         deleted_at = NULL,
         updated_at = now()
       RETURNING id, last_seen_scan_run_id, root_kind, relative_path, size_bytes, mtime_ms,
                 quick_hash, probe_status, probe_payload, duration_ms, last_scanned_at,
                 deleted_at, created_at, updated_at`,
      [
        input.lastSeenScanRunId,
        input.rootKind,
        input.relativePath,
        input.sizeBytes,
        input.mtimeMs,
        input.quickHash,
        input.probeStatus,
        input.probePayload,
        input.durationMs
      ]
    );

    return mapImportFileRow(requireRow(result.rows[0], "import_files upsert"));
  }

  async markDeleted(input: MarkDeletedInput): Promise<void> {
    await this.db.query(
      `UPDATE import_files
       SET probe_status = 'deleted',
           deleted_at = now(),
           updated_at = now()
       WHERE root_kind = $1 AND relative_path = $2`,
      [input.rootKind, input.relativePath]
    );
  }

  async updateFileLocation(input: UpdateImportFileLocationInput): Promise<void> {
    await this.db.query(
      `UPDATE import_files
       SET root_kind = $2,
           relative_path = $3,
           updated_at = now()
       WHERE id = $1`,
      [input.importFileId, input.rootKind, input.relativePath]
    );
  }

  async markDeletedById(importFileId: string): Promise<void> {
    await this.db.query(
      `UPDATE import_files
       SET probe_status = 'deleted',
           deleted_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [importFileId]
    );
  }
}
