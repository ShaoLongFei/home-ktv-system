import type { PlaybackEvent, PlaybackEventId, QueueEntryId, RoomId } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { PlaybackEventRow } from "../../../db/schema.js";

export interface CreatePlaybackEventInput<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  roomId: RoomId;
  queueEntryId: QueueEntryId | null;
  eventType: string;
  eventPayload: TPayload;
}

export interface PlaybackEventRepository {
  append<TPayload extends Record<string, unknown>>(input: CreatePlaybackEventInput<TPayload>): Promise<PlaybackEvent<TPayload>>;
  listRecentByRoom?(roomId: RoomId, limit?: number): Promise<PlaybackEvent[]>;
}

function mapPlaybackEventRow<TPayload extends Record<string, unknown>>(row: PlaybackEventRow): PlaybackEvent<TPayload> {
  return {
    id: row.id as PlaybackEventId,
    roomId: row.room_id as RoomId,
    queueEntryId: row.queue_entry_id as QueueEntryId | null,
    eventType: row.event_type,
    eventPayload: row.event_payload as TPayload,
    createdAt: row.created_at.toISOString()
  };
}

export class PgPlaybackEventRepository implements PlaybackEventRepository {
  constructor(private readonly db: QueryExecutor) {}

  async append<TPayload extends Record<string, unknown>>(
    input: CreatePlaybackEventInput<TPayload>
  ): Promise<PlaybackEvent<TPayload>> {
    const result = await this.db.query<PlaybackEventRow>(
      `INSERT INTO playback_events (room_id, queue_entry_id, event_type, event_payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, room_id, queue_entry_id, event_type, event_payload, created_at`,
      [input.roomId, input.queueEntryId, input.eventType, JSON.stringify(input.eventPayload)]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Playback event insert did not return a row");
    }

    return mapPlaybackEventRow<TPayload>(row);
  }

  async listRecentByRoom(roomId: RoomId, limit = 20): Promise<PlaybackEvent[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const result = await this.db.query<PlaybackEventRow>(
      `SELECT id, room_id, queue_entry_id, event_type, event_payload, created_at
       FROM playback_events
       WHERE room_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [roomId, boundedLimit]
    );

    return result.rows.map(mapPlaybackEventRow);
  }
}
