import type {
  AssetId,
  OnlineCandidateCard,
  OnlineCandidateTask,
  OnlineCandidateTaskId,
  OnlineCandidateTaskState,
  RoomId
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { CandidateTaskRow } from "../../../db/schema.js";

const candidateTaskColumns = `id, room_id, provider, provider_candidate_id, title, artist_name,
       source_label, duration_ms, candidate_type, reliability_label, risk_label,
       status, failure_reason, recent_event, provider_payload, ready_asset_id,
       created_at, updated_at, selected_at, review_required_at, fetching_at,
       fetched_at, ready_at, failed_at, stale_at, promoted_at, purged_at`;

const statusTimestampColumns: Partial<Record<OnlineCandidateTaskState, string>> = {
  selected: "selected_at",
  review_required: "review_required_at",
  fetching: "fetching_at",
  fetched: "fetched_at",
  ready: "ready_at",
  failed: "failed_at",
  stale: "stale_at",
  promoted: "promoted_at",
  purged: "purged_at"
};

export interface CandidateTaskRepository {
  upsertDiscovered(input: UpsertDiscoveredCandidateTaskInput): Promise<OnlineCandidateTask>;
  listActiveForRoom(roomId: RoomId): Promise<OnlineCandidateTask[]>;
  findByProviderCandidate(input: FindProviderCandidateTaskInput): Promise<OnlineCandidateTask | null>;
  transition(taskId: OnlineCandidateTaskId, input: TransitionCandidateTaskInput): Promise<OnlineCandidateTask | null>;
}

export interface UpsertDiscoveredCandidateTaskInput {
  roomId: RoomId;
  candidate: OnlineCandidateCard;
  providerPayload?: Record<string, unknown>;
}

export interface FindProviderCandidateTaskInput {
  roomId: RoomId;
  provider: string;
  providerCandidateId: string;
}

export interface TransitionCandidateTaskInput {
  status: OnlineCandidateTaskState;
  failureReason?: string | null;
  recentEvent?: Record<string, unknown>;
  readyAssetId?: AssetId | null;
}

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function mapCandidateTaskRow(row: CandidateTaskRow): OnlineCandidateTask {
  return {
    id: row.id,
    roomId: row.room_id,
    provider: row.provider,
    providerCandidateId: row.provider_candidate_id,
    title: row.title,
    artistName: row.artist_name,
    sourceLabel: row.source_label,
    durationMs: row.duration_ms,
    candidateType: row.candidate_type as OnlineCandidateTask["candidateType"],
    reliabilityLabel: row.reliability_label as OnlineCandidateTask["reliabilityLabel"],
    riskLabel: row.risk_label as OnlineCandidateTask["riskLabel"],
    status: row.status as OnlineCandidateTaskState,
    failureReason: row.failure_reason,
    recentEvent: row.recent_event,
    providerPayload: row.provider_payload,
    readyAssetId: row.ready_asset_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    selectedAt: toIsoString(row.selected_at),
    reviewRequiredAt: toIsoString(row.review_required_at),
    fetchingAt: toIsoString(row.fetching_at),
    fetchedAt: toIsoString(row.fetched_at),
    readyAt: toIsoString(row.ready_at),
    failedAt: toIsoString(row.failed_at),
    staleAt: toIsoString(row.stale_at),
    promotedAt: toIsoString(row.promoted_at),
    purgedAt: toIsoString(row.purged_at)
  };
}

export class PgCandidateTaskRepository implements CandidateTaskRepository {
  constructor(private readonly db: QueryExecutor) {}

  async upsertDiscovered(input: UpsertDiscoveredCandidateTaskInput): Promise<OnlineCandidateTask> {
    const { candidate } = input;
    const result = await this.db.query<CandidateTaskRow>(
      `INSERT INTO candidate_tasks (
         room_id, provider, provider_candidate_id, title, artist_name, source_label,
         duration_ms, candidate_type, reliability_label, risk_label, status,
         recent_event, provider_payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'discovered', $11::jsonb, $12::jsonb)
       ON CONFLICT(room_id, provider, provider_candidate_id)
       DO UPDATE SET
         title = EXCLUDED.title,
         artist_name = EXCLUDED.artist_name,
         source_label = EXCLUDED.source_label,
         duration_ms = EXCLUDED.duration_ms,
         candidate_type = EXCLUDED.candidate_type,
         reliability_label = EXCLUDED.reliability_label,
         risk_label = EXCLUDED.risk_label,
         recent_event = EXCLUDED.recent_event,
         provider_payload = EXCLUDED.provider_payload,
         updated_at = now()
       RETURNING ${candidateTaskColumns}`,
      [
        input.roomId,
        candidate.provider,
        candidate.providerCandidateId,
        candidate.title,
        candidate.artistName,
        candidate.sourceLabel,
        candidate.durationMs,
        candidate.candidateType,
        candidate.reliabilityLabel,
        candidate.riskLabel,
        {
          type: "discovered",
          message: "Candidate discovered from provider search"
        },
        input.providerPayload ?? {}
      ]
    );

    return mapCandidateTaskRow(requireRow(result.rows[0], "candidate_tasks upsert"));
  }

  async listActiveForRoom(roomId: RoomId): Promise<OnlineCandidateTask[]> {
    const result = await this.db.query<CandidateTaskRow>(
      `SELECT ${candidateTaskColumns}
       FROM candidate_tasks
       WHERE room_id = $1
         AND status <> ALL($2::text[])
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 100`,
      [roomId, ["promoted", "purged"]]
    );

    return result.rows.map(mapCandidateTaskRow);
  }

  async findByProviderCandidate(input: FindProviderCandidateTaskInput): Promise<OnlineCandidateTask | null> {
    const result = await this.db.query<CandidateTaskRow>(
      `SELECT ${candidateTaskColumns}
       FROM candidate_tasks
       WHERE room_id = $1
         AND provider = $2
         AND provider_candidate_id = $3
       LIMIT 1`,
      [input.roomId, input.provider, input.providerCandidateId]
    );

    const row = result.rows[0];
    return row ? mapCandidateTaskRow(row) : null;
  }

  async transition(
    taskId: OnlineCandidateTaskId,
    input: TransitionCandidateTaskInput
  ): Promise<OnlineCandidateTask | null> {
    const timestampColumn = statusTimestampColumns[input.status];
    const statusTimestampAssignment = timestampColumn ? `, ${timestampColumn} = COALESCE(${timestampColumn}, now())` : "";
    const result = await this.db.query<CandidateTaskRow>(
      `UPDATE candidate_tasks
       SET status = $2,
           failure_reason = $3,
           recent_event = COALESCE($4::jsonb, recent_event),
           ready_asset_id = COALESCE($5, ready_asset_id),
           updated_at = now()
           ${statusTimestampAssignment}
       WHERE id = $1
       RETURNING ${candidateTaskColumns}`,
      [taskId, input.status, input.failureReason ?? null, input.recentEvent ?? null, input.readyAssetId ?? null]
    );

    const row = result.rows[0];
    return row ? mapCandidateTaskRow(row) : null;
  }
}

function requireRow<TRow>(row: TRow | undefined, context: string): TRow {
  if (!row) {
    throw new Error(`${context} did not return a row`);
  }
  return row;
}
