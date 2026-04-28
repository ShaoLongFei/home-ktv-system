import type {
  AssetId,
  PlaybackSession,
  PlayerState,
  QueueEntryId,
  RoomId,
  VocalMode
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { PlaybackSessionRow } from "../../../db/schema.js";

export interface PlaybackSessionRepository {
  findByRoomId(roomId: RoomId): Promise<PlaybackSession | null>;
}

function mapPlaybackSessionRow(row: PlaybackSessionRow): PlaybackSession {
  return {
    roomId: row.room_id as RoomId,
    currentQueueEntryId: row.current_queue_entry_id as QueueEntryId | null,
    nextQueueEntryId: row.next_queue_entry_id as QueueEntryId | null,
    activeAssetId: row.active_asset_id as AssetId | null,
    targetVocalMode: row.target_vocal_mode as VocalMode,
    playerState: row.player_state as PlayerState,
    playerPositionMs: row.player_position_ms,
    mediaStartedAt: row.media_started_at?.toISOString() ?? null,
    version: row.version,
    updatedAt: row.updated_at.toISOString()
  };
}

export class PgPlaybackSessionRepository implements PlaybackSessionRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findByRoomId(roomId: RoomId): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRow>(
      `SELECT room_id, current_queue_entry_id, active_asset_id, target_vocal_mode,
              player_state, player_position_ms, next_queue_entry_id, version,
              media_started_at, updated_at
       FROM playback_sessions
       WHERE room_id = $1
       LIMIT 1`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }
}
