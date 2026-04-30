import type { ImportScanRun, ImportScanScope, ImportScanStatus, ImportScanTrigger } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { ImportScanRunRow } from "../../../db/schema.js";

export interface StartScanRunInput {
  trigger: ImportScanTrigger;
  scope: ImportScanScope;
  pathHint?: string;
}

export interface FinishScanRunInput {
  scanRunId: string;
  status: ImportScanStatus;
  filesSeen: number;
  filesAdded: number;
  filesChanged: number;
  filesDeleted: number;
  candidateCount: number;
  errorMessage?: string | null;
}

export interface ScanRunRepository {
  startRun(input: StartScanRunInput): Promise<ImportScanRun>;
  finishRun(input: FinishScanRunInput): Promise<void>;
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

export function mapImportScanRunRow(row: ImportScanRunRow): ImportScanRun {
  return {
    id: row.id,
    trigger: row.trigger as ImportScanTrigger,
    status: row.status as ImportScanStatus,
    scope: row.scope as ImportScanScope,
    filesSeen: row.files_seen,
    filesAdded: row.files_added,
    filesChanged: row.files_changed,
    filesDeleted: row.files_deleted,
    candidatesCreated: row.candidates_created,
    candidatesUpdated: row.candidates_updated,
    errorMessage: row.error_message,
    startedAt: toIsoString(row.started_at),
    finishedAt: toIsoString(row.finished_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class PgScanRunRepository implements ScanRunRepository {
  constructor(private readonly db: QueryExecutor) {}

  async startRun(input: StartScanRunInput): Promise<ImportScanRun> {
    const result = await this.db.query<ImportScanRunRow>(
      `INSERT INTO import_scan_runs (trigger, status, scope, started_at)
       VALUES ($1, 'running', $2, now())
       RETURNING id, trigger, status, scope, files_seen, files_added, files_changed,
                 files_deleted, candidates_created, candidates_updated, error_message,
                 started_at, finished_at, created_at, updated_at`,
      [input.trigger, input.scope]
    );

    return mapImportScanRunRow(requireRow(result.rows[0], "import_scan_runs insert"));
  }

  async finishRun(input: FinishScanRunInput): Promise<void> {
    await this.db.query(
      `UPDATE import_scan_runs
       SET status = $2,
           files_seen = $3,
           files_added = $4,
           files_changed = $5,
           files_deleted = $6,
           candidates_created = $7,
           error_message = $8,
           finished_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [
        input.scanRunId,
        input.status,
        input.filesSeen,
        input.filesAdded,
        input.filesChanged,
        input.filesDeleted,
        input.candidateCount,
        input.errorMessage ?? null
      ]
    );
  }
}
