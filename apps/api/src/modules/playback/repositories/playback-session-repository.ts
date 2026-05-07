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

export interface StartQueueEntryInput {
  roomId: RoomId;
  queueEntryId: QueueEntryId;
  activeAssetId: AssetId;
  targetVocalMode?: VocalMode;
  playerState?: PlayerState;
  playerPositionMs?: number;
  nextQueueEntryId?: QueueEntryId | null;
  mediaStartedAt?: Date | null;
}

export interface SetIdleInput {
  roomId: RoomId;
}

export interface RequestSwitchTargetInput {
  roomId: RoomId;
  targetVocalMode: VocalMode;
  playerPositionMs?: number;
}

export interface PlaybackSessionRepository {
  findByRoomId(roomId: RoomId): Promise<PlaybackSession | null>;
  startQueueEntry(input: StartQueueEntryInput): Promise<PlaybackSession | null>;
  setIdle(roomId: RoomId): Promise<PlaybackSession | null>;
  requestSwitchTarget(input: RequestSwitchTargetInput): Promise<PlaybackSession | null>;
  bumpVersion?(roomId: RoomId): Promise<PlaybackSession | null>;
}

export interface UpdatePlayerPositionInput {
  roomId: RoomId;
  currentQueueEntryId: QueueEntryId | null;
  playerPositionMs: number;
  playerState?: PlayerState;
}

export interface UpdatePlaybackFactsInput {
  roomId: RoomId;
  queueEntryId: QueueEntryId;
  activeAssetId: AssetId | null;
  playerState: PlayerState;
  playerPositionMs: number;
  targetVocalMode?: VocalMode;
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

  async startQueueEntry(input: StartQueueEntryInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRow>(
      `UPDATE playback_sessions
       SET current_queue_entry_id = $2,
           active_asset_id = $3,
           target_vocal_mode = COALESCE($4, target_vocal_mode),
           player_state = COALESCE($5, 'playing'),
           player_position_ms = COALESCE($6, 0),
           next_queue_entry_id = $7,
           media_started_at = COALESCE($8, CASE
             WHEN COALESCE($5, 'playing') = 'playing' THEN now()
             ELSE media_started_at
           END),
           version = version + 1,
           updated_at = now()
       WHERE room_id = $1
       RETURNING room_id, current_queue_entry_id, active_asset_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id, version,
                 media_started_at, updated_at`,
      [
        input.roomId,
        input.queueEntryId,
        input.activeAssetId,
        input.targetVocalMode ?? null,
        input.playerState ?? null,
        input.playerPositionMs ?? 0,
        input.nextQueueEntryId ?? null,
        input.mediaStartedAt ?? null
      ]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async setIdle(roomId: RoomId): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRow>(
      `UPDATE playback_sessions
       SET current_queue_entry_id = NULL,
           active_asset_id = NULL,
           next_queue_entry_id = NULL,
           player_state = 'idle',
           player_position_ms = 0,
           media_started_at = NULL,
           version = version + 1,
           updated_at = now()
       WHERE room_id = $1
       RETURNING room_id, current_queue_entry_id, active_asset_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id, version,
                 media_started_at, updated_at`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async requestSwitchTarget(input: RequestSwitchTargetInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRow>(
      `UPDATE playback_sessions
       SET target_vocal_mode = $2,
           player_position_ms = COALESCE($3, player_position_ms),
           version = version + 1,
           updated_at = now()
       WHERE room_id = $1
       RETURNING room_id, current_queue_entry_id, active_asset_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id, version,
                 media_started_at, updated_at`,
      [input.roomId, input.targetVocalMode, input.playerPositionMs ?? null]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async bumpVersion(roomId: RoomId): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRow>(
      `UPDATE playback_sessions
       SET version = version + 1,
           updated_at = now()
       WHERE room_id = $1
       RETURNING room_id, current_queue_entry_id, active_asset_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id, version,
                 media_started_at, updated_at`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async updatePlayerPosition(input: UpdatePlayerPositionInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRow>(
      `UPDATE playback_sessions
       SET player_position_ms = $2,
           player_state = COALESCE($3, player_state),
           updated_at = now()
       WHERE room_id = $1
         AND ($4::text IS NULL OR current_queue_entry_id = $4)
       RETURNING room_id, current_queue_entry_id, active_asset_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id, version,
                 media_started_at, updated_at`,
      [input.roomId, input.playerPositionMs, input.playerState ?? null, input.currentQueueEntryId]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async updatePlaybackFacts(input: UpdatePlaybackFactsInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRow>(
      `UPDATE playback_sessions
       SET active_asset_id = COALESCE($3, active_asset_id),
           target_vocal_mode = COALESCE($6, target_vocal_mode),
           player_state = $4,
           player_position_ms = $5,
           media_started_at = CASE
             WHEN $4 = 'playing' THEN COALESCE(media_started_at, now())
             ELSE media_started_at
           END,
           version = version + 1,
           updated_at = now()
       WHERE room_id = $1
         AND current_queue_entry_id = $2
       RETURNING room_id, current_queue_entry_id, active_asset_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id, version,
                 media_started_at, updated_at`,
      [
        input.roomId,
        input.queueEntryId,
        input.activeAssetId,
        input.playerState,
        input.playerPositionMs,
        input.targetVocalMode ?? null
      ]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }
}
