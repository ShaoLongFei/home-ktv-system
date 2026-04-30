import type {
  AssetKind,
  ImportCandidateFileDetail,
  ImportCandidateId,
  ImportFileProbeStatus,
  ImportFileRootKind,
  VocalMode
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { ImportCandidateFileDetailRow } from "../../../db/schema.js";

export interface ImportCandidateRepository {
  listCandidateFileDetails(candidateId: ImportCandidateId): Promise<ImportCandidateFileDetail[]>;
}

function toIsoString(value: Date): string {
  return value.toISOString();
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
}
