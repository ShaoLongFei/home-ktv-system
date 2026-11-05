import type {
  AssetId,
  PlaybackSession,
  PlayerState,
  QueueEntryId,
  RoomId,
  VocalMode
} from "@home-ktv/domain";
import { DEFAULT_ROOM_VOLUME_PERCENT } from "@home-ktv/player-contracts";
import type { QueryExecutor } from "../../../db/query-executor.js";

export interface StartQueueEntryInput {
  roomId: RoomId;
  queueEntryId: QueueEntryId;
  activeAssetId?: AssetId | null;
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

export interface SetVolumeInput {
  roomId: RoomId;
  volumePercent: number;
}

export interface PlaybackSessionRepository {
  findByRoomId(roomId: RoomId): Promise<PlaybackSession | null>;
  startQueueEntry(input: StartQueueEntryInput): Promise<PlaybackSession | null>;
  setIdle(roomId: RoomId): Promise<PlaybackSession | null>;
  requestSwitchTarget(input: RequestSwitchTargetInput): Promise<PlaybackSession | null>;
  setVolume?(input: SetVolumeInput): Promise<PlaybackSession | null>;
  bumpVersion?(roomId: RoomId): Promise<PlaybackSession | null>;
  /** 重唱：进度归零并递增 replay_epoch，电视端据此 seek 0。 */
  replayCurrent?(roomId: RoomId): Promise<PlaybackSession | null>;
  /** 暂停 / 继续。 */
  setPaused?(input: { roomId: RoomId; paused: boolean }): Promise<PlaybackSession | null>;
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
  activeAssetId?: AssetId | null;
  playerState: PlayerState;
  playerPositionMs: number;
  targetVocalMode?: VocalMode;
}

interface PlaybackSessionRowWithVolume {
  room_id: string;
  current_queue_entry_id: string | null;
  target_vocal_mode: string;
  player_state: string;
  player_position_ms: number;
  next_queue_entry_id: string | null;
  version: number;
  volume_percent?: number | null;
  media_started_at: Date | null;
  updated_at: Date;
  replay_epoch?: number | null;
}

function mapPlaybackSessionRow(row: PlaybackSessionRowWithVolume): PlaybackSession {
  return {
    roomId: row.room_id as RoomId,
    currentQueueEntryId: row.current_queue_entry_id as QueueEntryId | null,
    nextQueueEntryId: row.next_queue_entry_id as QueueEntryId | null,
    activeAssetId: null,
    targetVocalMode: row.target_vocal_mode as VocalMode,
    playerState: row.player_state as PlayerState,
    playerPositionMs: row.player_position_ms,
    volumePercent: row.volume_percent ?? DEFAULT_ROOM_VOLUME_PERCENT,
    mediaStartedAt: row.media_started_at?.toISOString() ?? null,
    replayEpoch: row.replay_epoch ?? 0,
    version: row.version,
    updatedAt: row.updated_at.toISOString()
  };
}

export class PgPlaybackSessionRepository implements PlaybackSessionRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findByRoomId(roomId: RoomId): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `SELECT id AS room_id, current_queue_entry_id, target_vocal_mode,
              player_state, player_position_ms, next_queue_entry_id, version,
              volume_percent, media_started_at, updated_at, replay_epoch
       FROM (
         SELECT id, current_queue_entry_id, target_vocal_mode,
                player_state, player_position_ms, next_queue_entry_id,
                playback_version AS version, volume_percent, media_started_at,
                playback_updated_at AS updated_at, replay_epoch
         FROM rooms
       ) AS room_playback
       WHERE id = $1
       LIMIT 1`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async startQueueEntry(input: StartQueueEntryInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET current_queue_entry_id = $2,
           target_vocal_mode = COALESCE($3, target_vocal_mode),
           player_state = COALESCE($4, 'playing'),
           player_position_ms = COALESCE($5, 0),
           next_queue_entry_id = $6,
           media_started_at = CASE
             WHEN COALESCE($4, 'playing') = 'playing' THEN COALESCE($7, now())
             ELSE $7
           END,
           playback_version = playback_version + 1,
           playback_updated_at = now()
       WHERE id = $1
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at`,
      [
        input.roomId,
        input.queueEntryId,
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
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET current_queue_entry_id = NULL,
           next_queue_entry_id = NULL,
           player_state = 'idle',
           player_position_ms = 0,
           media_started_at = NULL,
           playback_version = playback_version + 1,
           playback_updated_at = now()
       WHERE id = $1
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async requestSwitchTarget(input: RequestSwitchTargetInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET target_vocal_mode = $2,
           player_position_ms = COALESCE($3, player_position_ms),
           playback_version = playback_version + 1,
           playback_updated_at = now()
       WHERE id = $1
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at`,
      [input.roomId, input.targetVocalMode, input.playerPositionMs ?? null]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async setVolume(input: SetVolumeInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET volume_percent = $2,
           playback_version = playback_version + 1,
           playback_updated_at = now()
       WHERE id = $1
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at`,
      [input.roomId, input.volumePercent]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async replayCurrent(roomId: RoomId): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET player_position_ms = 0,
           player_state = CASE WHEN player_state = 'paused' THEN 'paused' ELSE 'playing' END,
           replay_epoch = replay_epoch + 1,
           playback_version = playback_version + 1,
           playback_updated_at = now()
       WHERE id = $1
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at, replay_epoch`,
      [roomId]
    );
    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async setPaused(input: { roomId: RoomId; paused: boolean }): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET player_state = $2,
           playback_version = playback_version + 1,
           playback_updated_at = now()
       WHERE id = $1
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at, replay_epoch`,
      [input.roomId, input.paused ? "paused" : "playing"]
    );
    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async bumpVersion(roomId: RoomId): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET playback_version = playback_version + 1,
           playback_updated_at = now()
       WHERE id = $1
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async updatePlayerPosition(input: UpdatePlayerPositionInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET player_position_ms = $2,
           player_state = COALESCE($3, player_state),
           playback_updated_at = now()
       WHERE id = $1
         AND ($4::text IS NULL OR current_queue_entry_id = $4)
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at`,
      [input.roomId, input.playerPositionMs, input.playerState ?? null, input.currentQueueEntryId]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }

  async updatePlaybackFacts(input: UpdatePlaybackFactsInput): Promise<PlaybackSession | null> {
    const result = await this.db.query<PlaybackSessionRowWithVolume>(
      `UPDATE rooms
       SET target_vocal_mode = COALESCE($5, target_vocal_mode),
           player_state = $3,
           player_position_ms = $4,
           media_started_at = CASE
             WHEN $3 = 'playing' THEN COALESCE(media_started_at, now())
             ELSE media_started_at
           END,
           playback_version = playback_version + 1,
           playback_updated_at = now()
       WHERE id = $1
         AND current_queue_entry_id = $2
       RETURNING id AS room_id, current_queue_entry_id, target_vocal_mode,
                 player_state, player_position_ms, next_queue_entry_id,
                 playback_version AS version, volume_percent, media_started_at,
                 playback_updated_at AS updated_at`,
      [
        input.roomId,
        input.queueEntryId,
        input.playerState,
        input.playerPositionMs,
        input.targetVocalMode ?? null
      ]
    );

    const row = result.rows[0];
    return row ? mapPlaybackSessionRow(row) : null;
  }
}
