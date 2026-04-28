import type { AssetId, QueueEntry, QueueEntryId, QueueEntryStatus, RoomId, SongId } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { QueueEntryRow } from "../../../db/schema.js";

export interface QueueEntryRepository {
  findById(queueEntryId: QueueEntryId): Promise<QueueEntry | null>;
}

export function mapQueueEntryRow(row: QueueEntryRow): QueueEntry {
  return {
    id: row.id,
    roomId: row.room_id as RoomId,
    songId: row.song_id as SongId,
    assetId: row.asset_id as AssetId,
    requestedBy: row.requested_by,
    queuePosition: row.queue_position,
    status: row.status as QueueEntryStatus,
    priority: row.priority,
    playbackOptions: {
      preferredVocalMode: null,
      pitchSemitones: 0,
      requireReadyAsset: true
    },
    requestedAt: row.requested_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null
  };
}

export class PgQueueEntryRepository implements QueueEntryRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findById(queueEntryId: QueueEntryId): Promise<QueueEntry | null> {
    const result = await this.db.query<QueueEntryRow>(
      `SELECT id, room_id, song_id, asset_id, requested_by, queue_position, status,
              priority, playback_options, requested_at, started_at, ended_at
       FROM queue_entries
       WHERE id = $1
       LIMIT 1`,
      [queueEntryId]
    );

    const row = result.rows[0];
    return row ? mapQueueEntryRow(row) : null;
  }
}
