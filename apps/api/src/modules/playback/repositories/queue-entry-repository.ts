import type {
  ControlSessionId,
  ControllerSongHistoryEntry,
  MediaSourceRef,
  PlaybackOptions,
  QueueEntry,
  QueueEntryId,
  QueueEntryStatus,
  RoomId,
  SongId,
  VocalMode
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { QueueEntryRow } from "../../../db/schema.js";

export interface AppendQueueEntryInput {
  roomId: RoomId;
  source?: MediaSourceRef;
  songId?: SongId;
  assetId?: SongId;
  requestedBy: string;
  requestedByUserPhone?: string | null;
  requestedByName?: string | null;
  queuePosition: number;
  status?: QueueEntryStatus;
  priority?: number;
  playbackOptions?: Partial<PlaybackOptions>;
  requestedAt?: Date;
  startedAt?: Date | null;
  endedAt?: Date | null;
  removedAt?: Date | null;
  removedByControlSessionId?: ControlSessionId | null;
  undoExpiresAt?: Date | null;
}

export interface MarkRemovedQueueEntryInput {
  roomId: RoomId;
  queueEntryId: QueueEntryId;
  removedAt: Date;
  removedByControlSessionId: ControlSessionId | null;
  undoExpiresAt: Date | null;
}

export interface UndoRemovedQueueEntryInput {
  roomId: RoomId;
  queueEntryId: QueueEntryId;
  now: Date;
}

export interface RenumberQueueInput {
  roomId: RoomId;
  orderedQueueEntryIds: readonly QueueEntryId[];
}

export interface MarkCompletedQueueEntryInput {
  roomId: RoomId;
  queueEntryId: QueueEntryId;
  status: Extract<QueueEntryStatus, "played" | "skipped" | "failed">;
  endedAt: Date;
}

export interface MarkPlaybackStateQueueEntryInput {
  roomId: RoomId;
  queueEntryId: QueueEntryId;
  status: Extract<QueueEntryStatus, "loading" | "playing">;
  startedAt: Date;
}

export interface UpdatePreferredVocalModeInput {
  roomId: RoomId;
  queueEntryId: QueueEntryId;
  preferredVocalMode: Extract<VocalMode, "original" | "instrumental">;
}

export interface QueueEntryRepository {
  findById(queueEntryId: QueueEntryId): Promise<QueueEntry | null>;
  listEffectiveQueue(roomId: RoomId): Promise<QueueEntry[]>;
  listControllerUserSongHistory?(phone: string, limit?: number): Promise<ControllerSongHistoryEntry[]>;
  listGlobalSongRequestCounts?(songIds: readonly SongId[]): Promise<Map<SongId, number>>;
  renameRequester?(input: { phone: string; displayName: string }): Promise<number>;
  completeStalePlaying?(input: { roomId: RoomId; keepQueueEntryId: QueueEntryId; now: Date }): Promise<number>;
  listUndoableRemoved(roomId: RoomId, now: Date): Promise<QueueEntry[]>;
  findCurrentForRoom(roomId: RoomId): Promise<QueueEntry | null>;
  append(input: AppendQueueEntryInput): Promise<QueueEntry>;
  markRemoved(input: MarkRemovedQueueEntryInput): Promise<QueueEntry | null>;
  undoRemoved(input: UndoRemovedQueueEntryInput): Promise<QueueEntry | null>;
  renumberQueue(roomId: RoomId, orderedQueueEntryIds: readonly QueueEntryId[]): Promise<QueueEntry[]>;
  markPlaybackState?(input: MarkPlaybackStateQueueEntryInput): Promise<QueueEntry | null>;
  updatePreferredVocalMode?(input: UpdatePreferredVocalModeInput): Promise<QueueEntry | null>;
  markCompleted(input: MarkCompletedQueueEntryInput): Promise<QueueEntry | null>;
}

const queueEntrySelectColumns = `id, room_id, song_id,
              requested_by, requested_by_user_phone, requested_by_name, queue_position, status,
              priority, playback_options, requested_at, started_at, ended_at,
              removed_at, removed_by_control_session_id, undo_expires_at`;

export function mapQueueEntryRow(row: QueueEntryRow): QueueEntry {
  const source = sourceRefFromQueueRow(row);
  return {
    id: row.id,
    roomId: row.room_id as RoomId,
    source,
    songId: source.songId,
    assetId: source.assetId,
    requestedBy: row.requested_by,
    requestedByUserPhone: row.requested_by_user_phone ?? null,
    requestedByName: row.requested_by_name ?? null,
    queuePosition: row.queue_position,
    status: row.status as QueueEntryStatus,
    priority: row.priority,
    playbackOptions: mapPlaybackOptions(row.playback_options),
    requestedAt: row.requested_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
    removedAt: row.removed_at?.toISOString() ?? null,
    removedByControlSessionId: row.removed_by_control_session_id as ControlSessionId | null,
    undoExpiresAt: row.undo_expires_at?.toISOString() ?? null
  };
}

export class PgQueueEntryRepository implements QueueEntryRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findById(queueEntryId: QueueEntryId): Promise<QueueEntry | null> {
    const result = await this.db.query<QueueEntryRow>(
      `SELECT ${queueEntrySelectColumns}
       FROM queue_entries
       WHERE id = $1
       LIMIT 1`,
      [queueEntryId]
    );

    const row = result.rows[0];
    return row ? mapQueueEntryRow(row) : null;
  }

  async listEffectiveQueue(roomId: RoomId): Promise<QueueEntry[]> {
    const result = await this.db.query<QueueEntryRow>(
      `SELECT ${queueEntrySelectColumns}
       FROM queue_entries
       WHERE room_id = $1
         AND status IN ('queued', 'preparing', 'loading', 'playing')
       ORDER BY queue_position ASC, priority DESC, requested_at ASC`,
      [roomId]
    );

    return result.rows.map(mapQueueEntryRow);
  }

  /** 只允许一条正在播放：切歌时把残留的 playing 收掉，避免电视以为有两首在播。 */
  async completeStalePlaying(input: {
    roomId: RoomId;
    keepQueueEntryId: QueueEntryId;
    now: Date;
  }): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `UPDATE queue_entries
          SET status = 'played', ended_at = $3
        WHERE room_id = $1
          AND status = 'playing'
          AND id <> $2
        RETURNING id`,
      [input.roomId, input.keepQueueEntryId, input.now]
    );
    return result.rows.length;
  }

  /** 用户改昵称后，把还没播完的队列条目上的点歌人名字一起换掉。 */
  async renameRequester(input: { phone: string; displayName: string }): Promise<number> {
    const result = await this.db.query<{ queue_entry_id: string }>(
      `UPDATE queue_entries
          SET requested_by_name = $2
        WHERE requested_by_user_phone = $1
          AND status IN ('queued', 'preparing', 'loading')
        RETURNING queue_entry_id`,
      [input.phone, input.displayName]
    );
    return result.rows.length;
  }

  async listGlobalSongRequestCounts(songIds: readonly SongId[]): Promise<Map<SongId, number>> {
    if (songIds.length === 0) {
      return new Map();
    }

    const result = await this.db.query<{ song_id: string; request_count: string | number }>(
      `SELECT id AS song_id, request_count
       FROM ktv_songs
       WHERE id = ANY($1::text[])`,
      [songIds]
    );

    return new Map(
      result.rows.map((row) => [
        row.song_id as SongId,
        typeof row.request_count === "number" ? row.request_count : Number.parseInt(row.request_count, 10)
      ])
    );
  }

  async listControllerUserSongHistory(phone: string, limit = 100): Promise<ControllerSongHistoryEntry[]> {
    const normalizedLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
    const result = await this.db.query<{
      song_id: string;
      title: string;
      artist_name: string;
      request_count: string | number;
      last_requested_at: Date | string;
    }>(
      `SELECT q.song_id,
              s.title,
              s.primary_artist_name AS artist_name,
              count(*)::int AS request_count,
              max(q.requested_at) AS last_requested_at
       FROM queue_entries q
       JOIN ktv_songs s ON s.id = q.song_id
       WHERE q.requested_by_user_phone = $1
       GROUP BY q.song_id, s.title, s.primary_artist_name
       ORDER BY max(q.requested_at) DESC
       LIMIT $2`,
      [phone, normalizedLimit]
    );

    return result.rows.map((row) => ({
      songId: row.song_id as SongId,
      assetId: row.song_id,
      title: row.title,
      artistName: row.artist_name,
      requestCount: typeof row.request_count === "number" ? row.request_count : Number.parseInt(row.request_count, 10),
      lastRequestedAt: toIsoString(row.last_requested_at)
    }));
  }

  async listUndoableRemoved(roomId: RoomId, now: Date): Promise<QueueEntry[]> {
    const result = await this.db.query<QueueEntryRow>(
      `SELECT ${queueEntrySelectColumns}
       FROM queue_entries
       WHERE room_id = $1
         AND status = 'removed'
         AND undo_expires_at > $2
       ORDER BY removed_at DESC, queue_position ASC`,
      [roomId, now]
    );

    return result.rows.map(mapQueueEntryRow);
  }

  async findCurrentForRoom(roomId: RoomId): Promise<QueueEntry | null> {
    const result = await this.db.query<QueueEntryRow>(
      `SELECT ${queueEntrySelectColumns}
       FROM queue_entries
       WHERE room_id = $1
         AND status IN ('playing', 'loading', 'preparing', 'queued')
       ORDER BY CASE status
         WHEN 'playing' THEN 0
         WHEN 'loading' THEN 1
         WHEN 'preparing' THEN 2
         ELSE 3
       END, queue_position ASC, requested_at ASC
       LIMIT 1`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapQueueEntryRow(row) : null;
  }

  async append(input: AppendQueueEntryInput): Promise<QueueEntry> {
    const source = normalizeAppendSource(input);
    const result = await this.db.query<QueueEntryRow>(
      `INSERT INTO queue_entries (
         room_id, song_id,
         requested_by, requested_by_user_phone, requested_by_name, queue_position, status, priority,
         playback_options, requested_at, started_at, ended_at, removed_at,
         removed_by_control_session_id, undo_expires_at
       )
       VALUES ($1, $2, $3, $4, $5,
         -- 位置在库内原子分配：连点几下时，先读 max 再 +1 会算出重复值，
         -- 重复之后排序退化成按时间/优先级，队列顺序就乱了
         COALESCE((SELECT MAX(queue_position) FROM queue_entries
                    WHERE room_id = $1
                      AND status IN ('queued', 'preparing', 'loading', 'playing')), 0) + 1,
         $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)
       RETURNING ${queueEntrySelectColumns}`,
      [
        input.roomId,
        source.songId,
        input.requestedBy,
        input.requestedByUserPhone ?? null,
        input.requestedByName ?? null,
        input.status ?? "queued",
        input.priority ?? 0,
        JSON.stringify(normalizePlaybackOptions(input.playbackOptions)),
        input.requestedAt ?? new Date(),
        input.startedAt ?? null,
        input.endedAt ?? null,
        input.removedAt ?? null,
        input.removedByControlSessionId ?? null,
        input.undoExpiresAt ?? null
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Queue entry insert did not return a row");
    }

    await this.incrementNasRequestCount(source.songId, input.requestedAt ?? null);

    return mapQueueEntryRow(row);
  }

  private async incrementNasRequestCount(songId: SongId, requestedAt: Date | null): Promise<void> {
    await this.db.query(
      `UPDATE ktv_songs
       SET request_count = request_count + 1,
           last_requested_at = COALESCE($2, now()),
           updated_at = now()
       WHERE id = $1`,
      [songId, requestedAt]
    );
  }

  async markRemoved(input: MarkRemovedQueueEntryInput): Promise<QueueEntry | null> {
    const result = await this.db.query<QueueEntryRow>(
      `UPDATE queue_entries
       SET status = 'removed',
           removed_at = $3,
           removed_by_control_session_id = $4,
           undo_expires_at = $5
       WHERE room_id = $1
         AND id = $2
       RETURNING ${queueEntrySelectColumns}`,
      [input.roomId, input.queueEntryId, input.removedAt, input.removedByControlSessionId, input.undoExpiresAt]
    );

    const row = result.rows[0];
    return row ? mapQueueEntryRow(row) : null;
  }

  async undoRemoved(input: UndoRemovedQueueEntryInput): Promise<QueueEntry | null> {
    const result = await this.db.query<QueueEntryRow>(
      `UPDATE queue_entries
       SET status = 'queued',
           removed_at = NULL,
           removed_by_control_session_id = NULL,
           undo_expires_at = NULL
       WHERE room_id = $1
         AND id = $2
         AND status = 'removed'
         AND undo_expires_at > $3
       RETURNING ${queueEntrySelectColumns}`,
      [input.roomId, input.queueEntryId, input.now]
    );

    const row = result.rows[0];
    return row ? mapQueueEntryRow(row) : null;
  }

  async renumberQueue(roomId: RoomId, orderedQueueEntryIds: readonly QueueEntryId[]): Promise<QueueEntry[]> {
    if (orderedQueueEntryIds.length === 0) {
      return [];
    }

    const result = await this.db.query<QueueEntryRow>(
      `WITH ordered AS (
         SELECT id, queue_position::int
         FROM unnest($2::text[]) WITH ORDINALITY AS input(id, queue_position)
       )
       UPDATE queue_entries AS qe
       SET queue_position = ordered.queue_position
       FROM ordered
       WHERE qe.room_id = $1
         AND qe.id = ordered.id
       RETURNING qe.id, qe.room_id, qe.song_id,
                 qe.requested_by, qe.requested_by_user_phone, qe.requested_by_name, qe.queue_position, qe.status, qe.priority, qe.playback_options,
                 qe.requested_at, qe.started_at, qe.ended_at, qe.removed_at,
                 qe.removed_by_control_session_id, qe.undo_expires_at`,
      [roomId, orderedQueueEntryIds]
    );

    const rows = result.rows.map(mapQueueEntryRow);
    const order = new Map(orderedQueueEntryIds.map((queueEntryId, index) => [queueEntryId, index]));
    rows.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    return rows;
  }

  async markCompleted(input: MarkCompletedQueueEntryInput): Promise<QueueEntry | null> {
    const result = await this.db.query<QueueEntryRow>(
      `UPDATE queue_entries
       SET status = $3,
           ended_at = $4,
           removed_at = NULL,
           removed_by_control_session_id = NULL,
           undo_expires_at = NULL
       WHERE room_id = $1
         AND id = $2
       RETURNING ${queueEntrySelectColumns}`,
      [input.roomId, input.queueEntryId, input.status, input.endedAt]
    );

    const row = result.rows[0];
    return row ? mapQueueEntryRow(row) : null;
  }

  async markPlaybackState(input: MarkPlaybackStateQueueEntryInput): Promise<QueueEntry | null> {
    const result = await this.db.query<QueueEntryRow>(
      `UPDATE queue_entries
       SET status = $3,
           started_at = COALESCE(started_at, $4),
           ended_at = NULL,
           removed_at = NULL,
           removed_by_control_session_id = NULL,
           undo_expires_at = NULL
       WHERE room_id = $1
         AND id = $2
         AND status IN ('queued', 'preparing', 'loading', 'playing')
       RETURNING ${queueEntrySelectColumns}`,
      [input.roomId, input.queueEntryId, input.status, input.startedAt]
    );

    const row = result.rows[0];
    return row ? mapQueueEntryRow(row) : null;
  }

  async updatePreferredVocalMode(input: UpdatePreferredVocalModeInput): Promise<QueueEntry | null> {
    const result = await this.db.query<QueueEntryRow>(
      `UPDATE queue_entries
       SET playback_options = jsonb_set(COALESCE(playback_options, '{}'::jsonb), '{preferredVocalMode}', to_jsonb($3::text), true)
       WHERE room_id = $1
         AND id = $2
       RETURNING ${queueEntrySelectColumns}`,
      [input.roomId, input.queueEntryId, input.preferredVocalMode]
    );

    const row = result.rows[0];
    return row ? mapQueueEntryRow(row) : null;
  }
}

export class InMemoryQueueEntryRepository implements QueueEntryRepository {
  private readonly entries = new Map<QueueEntryId, QueueEntry>();

  constructor(initialEntries: readonly QueueEntry[] = []) {
    for (const entry of initialEntries) {
      this.entries.set(entry.id, cloneQueueEntry(entry));
    }
  }

  async findById(queueEntryId: QueueEntryId): Promise<QueueEntry | null> {
    const entry = this.entries.get(queueEntryId);
    return entry ? cloneQueueEntry(entry) : null;
  }

  async listEffectiveQueue(roomId: RoomId): Promise<QueueEntry[]> {
    return this.sortedEntries(roomId).filter((entry) => isEffectiveQueueStatus(entry.status));
  }

  async listGlobalSongRequestCounts(songIds: readonly SongId[]): Promise<Map<SongId, number>> {
    const requestedSongIds = new Set(songIds);
    const counts = new Map<SongId, number>();
    for (const entry of this.entries.values()) {
      const source = sourceRefFromQueueEntry(entry);
      if (source.sourceType !== "nas" || !requestedSongIds.has(source.songId) || entry.status === "removed") {
        continue;
      }
      counts.set(source.songId, (counts.get(source.songId) ?? 0) + 1);
    }
    return counts;
  }

  async listControllerUserSongHistory(phone: string, limit = 100): Promise<ControllerSongHistoryEntry[]> {
    const counts = new Map<SongId, { songId: SongId; assetId: string; count: number; lastRequestedAt: string }>();
    for (const entry of this.entries.values()) {
      if (entry.requestedByUserPhone !== phone) {
        continue;
      }
      const source = sourceRefFromQueueEntry(entry);
      const current = counts.get(source.songId);
      if (!current) {
        counts.set(source.songId, {
          songId: source.songId,
          assetId: source.assetId,
          count: 1,
          lastRequestedAt: entry.requestedAt
        });
        continue;
      }
      current.count += 1;
      if (new Date(entry.requestedAt).getTime() > new Date(current.lastRequestedAt).getTime()) {
        current.lastRequestedAt = entry.requestedAt;
      }
    }

    return Array.from(counts.values())
      .sort((left, right) => new Date(right.lastRequestedAt).getTime() - new Date(left.lastRequestedAt).getTime())
      .slice(0, Math.min(200, Math.max(1, Math.trunc(limit))))
      .map((entry) => ({
        songId: entry.songId,
        assetId: entry.assetId,
        title: entry.songId,
        artistName: "",
        requestCount: entry.count,
        lastRequestedAt: entry.lastRequestedAt
      }));
  }

  async listUndoableRemoved(roomId: RoomId, now: Date): Promise<QueueEntry[]> {
    return this.sortedEntries(roomId)
      .filter((entry) => entry.status === "removed" && entry.undoExpiresAt !== null && new Date(entry.undoExpiresAt).getTime() > now.getTime())
      .sort((left, right) => compareDates(right.removedAt, left.removedAt));
  }

  async findCurrentForRoom(roomId: RoomId): Promise<QueueEntry | null> {
    const entries = this.sortedEntries(roomId);
    const current = entries.find((entry) => entry.status === "playing")
      ?? entries.find((entry) => entry.status === "loading")
      ?? entries.find((entry) => entry.status === "preparing")
      ?? entries.find((entry) => entry.status === "queued")
      ?? null;
    return current ? cloneQueueEntry(current) : null;
  }

  async append(input: AppendQueueEntryInput): Promise<QueueEntry> {
    const source = normalizeAppendSource(input);
    const entry: QueueEntry = {
      id: `queue-entry-${this.entries.size + 1}`,
      roomId: input.roomId,
      source,
      songId: source.songId,
      assetId: source.assetId,
      requestedBy: input.requestedBy,
      requestedByUserPhone: input.requestedByUserPhone ?? null,
      requestedByName: input.requestedByName ?? null,
      queuePosition: input.queuePosition,
      status: input.status ?? "queued",
      priority: input.priority ?? 0,
      playbackOptions: normalizePlaybackOptions(input.playbackOptions),
      requestedAt: toIsoString(input.requestedAt ?? new Date()),
      startedAt: input.startedAt ? toIsoString(input.startedAt) : null,
      endedAt: input.endedAt ? toIsoString(input.endedAt) : null,
      removedAt: input.removedAt ? toIsoString(input.removedAt) : null,
      removedByControlSessionId: input.removedByControlSessionId ?? null,
      undoExpiresAt: input.undoExpiresAt ? toIsoString(input.undoExpiresAt) : null
    };

    this.entries.set(entry.id, cloneQueueEntry(entry));
    return cloneQueueEntry(entry);
  }

  async markRemoved(input: MarkRemovedQueueEntryInput): Promise<QueueEntry | null> {
    const entry = this.entries.get(input.queueEntryId);
    if (!entry || entry.roomId !== input.roomId) {
      return null;
    }

    const updated: QueueEntry = {
      ...entry,
      status: "removed",
      removedAt: input.removedAt.toISOString(),
      removedByControlSessionId: input.removedByControlSessionId,
      undoExpiresAt: input.undoExpiresAt?.toISOString() ?? null
    };
    this.entries.set(updated.id, cloneQueueEntry(updated));
    return cloneQueueEntry(updated);
  }

  async undoRemoved(input: UndoRemovedQueueEntryInput): Promise<QueueEntry | null> {
    const entry = this.entries.get(input.queueEntryId);
    if (
      !entry ||
      entry.roomId !== input.roomId ||
      entry.status !== "removed" ||
      entry.undoExpiresAt === null ||
      new Date(entry.undoExpiresAt).getTime() <= input.now.getTime()
    ) {
      return null;
    }

    const updated: QueueEntry = {
      ...entry,
      status: "queued",
      removedAt: null,
      removedByControlSessionId: null,
      undoExpiresAt: null
    };
    this.entries.set(updated.id, cloneQueueEntry(updated));
    return cloneQueueEntry(updated);
  }

  async renumberQueue(roomId: RoomId, orderedQueueEntryIds: readonly QueueEntryId[]): Promise<QueueEntry[]> {
    const updated: QueueEntry[] = [];
    orderedQueueEntryIds.forEach((queueEntryId, index) => {
      const entry = this.entries.get(queueEntryId);
      if (!entry || entry.roomId !== roomId) {
        return;
      }

      const nextEntry: QueueEntry = {
        ...entry,
        queuePosition: index + 1
      };
      this.entries.set(queueEntryId, cloneQueueEntry(nextEntry));
      updated.push(cloneQueueEntry(nextEntry));
    });

    return updated;
  }

  async markCompleted(input: MarkCompletedQueueEntryInput): Promise<QueueEntry | null> {
    const entry = this.entries.get(input.queueEntryId);
    if (!entry || entry.roomId !== input.roomId) {
      return null;
    }

    const updated: QueueEntry = {
      ...entry,
      status: input.status,
      endedAt: input.endedAt.toISOString(),
      removedAt: null,
      removedByControlSessionId: null,
      undoExpiresAt: null
    };
    this.entries.set(updated.id, cloneQueueEntry(updated));
    return cloneQueueEntry(updated);
  }

  async markPlaybackState(input: MarkPlaybackStateQueueEntryInput): Promise<QueueEntry | null> {
    const entry = this.entries.get(input.queueEntryId);
    if (!entry || entry.roomId !== input.roomId || !isEffectiveQueueStatus(entry.status)) {
      return null;
    }

    const updated: QueueEntry = {
      ...entry,
      status: input.status,
      startedAt: entry.startedAt ?? input.startedAt.toISOString(),
      endedAt: null,
      removedAt: null,
      removedByControlSessionId: null,
      undoExpiresAt: null
    };
    this.entries.set(updated.id, cloneQueueEntry(updated));
    return cloneQueueEntry(updated);
  }

  async updatePreferredVocalMode(input: UpdatePreferredVocalModeInput): Promise<QueueEntry | null> {
    const entry = this.entries.get(input.queueEntryId);
    if (!entry || entry.roomId !== input.roomId) {
      return null;
    }

    const updated: QueueEntry = {
      ...entry,
      playbackOptions: {
        ...entry.playbackOptions,
        preferredVocalMode: input.preferredVocalMode
      }
    };
    this.entries.set(updated.id, cloneQueueEntry(updated));
    return cloneQueueEntry(updated);
  }

  private sortedEntries(roomId: RoomId): QueueEntry[] {
    return [...this.entries.values()]
      .filter((entry) => entry.roomId === roomId)
      .sort((left, right) => left.queuePosition - right.queuePosition || left.requestedAt.localeCompare(right.requestedAt));
  }
}

function mapPlaybackOptions(value: Record<string, unknown>): PlaybackOptions {
  return {
    preferredVocalMode:
      value.preferredVocalMode === "original" ||
      value.preferredVocalMode === "instrumental" ||
      value.preferredVocalMode === "dual" ||
      value.preferredVocalMode === "unknown"
        ? value.preferredVocalMode
        : null,
    pitchSemitones: typeof value.pitchSemitones === "number" ? value.pitchSemitones : 0,
    requireReadyAsset: typeof value.requireReadyAsset === "boolean" ? value.requireReadyAsset : true
  };
}

function sourceRefFromQueueRow(row: QueueEntryRow): MediaSourceRef {
  return {
    sourceType: "nas",
    songId: row.song_id as SongId,
    assetId: row.song_id as SongId
  };
}

function sourceRefFromQueueEntry(entry: QueueEntry): MediaSourceRef {
  return entry.source ?? {
    sourceType: "nas",
    songId: entry.songId,
    assetId: entry.assetId
  };
}

function normalizeAppendSource(input: AppendQueueEntryInput): MediaSourceRef {
  if (input.source) {
    if (input.source.sourceType !== "nas") {
      throw new Error("Only NAS queue entries are supported");
    }
    return {
      sourceType: "nas",
      songId: input.source.songId,
      assetId: input.source.songId
    };
  }
  if (input.songId) {
    return {
      sourceType: "nas",
      songId: input.songId,
      assetId: input.songId
    };
  }
  throw new Error("Queue entry source is required");
}

function normalizePlaybackOptions(playbackOptions?: Partial<PlaybackOptions>): PlaybackOptions {
  return {
    preferredVocalMode: playbackOptions?.preferredVocalMode ?? null,
    pitchSemitones: playbackOptions?.pitchSemitones ?? 0,
    requireReadyAsset: playbackOptions?.requireReadyAsset ?? true
  };
}

function isEffectiveQueueStatus(status: QueueEntryStatus): boolean {
  return status === "queued" || status === "preparing" || status === "loading" || status === "playing";
}

function cloneQueueEntry(entry: QueueEntry): QueueEntry {
  return {
    ...entry,
    source: { ...sourceRefFromQueueEntry(entry) },
    playbackOptions: { ...entry.playbackOptions }
  };
}

function compareDates(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
