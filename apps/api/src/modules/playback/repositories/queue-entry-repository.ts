import type {
  AssetId,
  ControlSessionId,
  PlaybackOptions,
  QueueEntry,
  QueueEntryId,
  QueueEntryStatus,
  RoomId,
  SongId
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { QueueEntryRow } from "../../../db/schema.js";

export interface AppendQueueEntryInput {
  roomId: RoomId;
  songId: SongId;
  assetId: AssetId;
  requestedBy: string;
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

export interface QueueEntryRepository {
  findById(queueEntryId: QueueEntryId): Promise<QueueEntry | null>;
  listEffectiveQueue(roomId: RoomId): Promise<QueueEntry[]>;
  listUndoableRemoved(roomId: RoomId, now: Date): Promise<QueueEntry[]>;
  findCurrentForRoom(roomId: RoomId): Promise<QueueEntry | null>;
  append(input: AppendQueueEntryInput): Promise<QueueEntry>;
  markRemoved(input: MarkRemovedQueueEntryInput): Promise<QueueEntry | null>;
  undoRemoved(input: UndoRemovedQueueEntryInput): Promise<QueueEntry | null>;
  renumberQueue(roomId: RoomId, orderedQueueEntryIds: readonly QueueEntryId[]): Promise<QueueEntry[]>;
  markCompleted(input: MarkCompletedQueueEntryInput): Promise<QueueEntry | null>;
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
      `SELECT id, room_id, song_id, asset_id, requested_by, queue_position, status,
              priority, playback_options, requested_at, started_at, ended_at,
              removed_at, removed_by_control_session_id, undo_expires_at
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
      `SELECT id, room_id, song_id, asset_id, requested_by, queue_position, status,
              priority, playback_options, requested_at, started_at, ended_at,
              removed_at, removed_by_control_session_id, undo_expires_at
       FROM queue_entries
       WHERE room_id = $1
         AND status IN ('queued', 'preparing', 'loading', 'playing')
       ORDER BY queue_position ASC, priority DESC, requested_at ASC`,
      [roomId]
    );

    return result.rows.map(mapQueueEntryRow);
  }

  async listUndoableRemoved(roomId: RoomId, now: Date): Promise<QueueEntry[]> {
    const result = await this.db.query<QueueEntryRow>(
      `SELECT id, room_id, song_id, asset_id, requested_by, queue_position, status,
              priority, playback_options, requested_at, started_at, ended_at,
              removed_at, removed_by_control_session_id, undo_expires_at
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
      `SELECT id, room_id, song_id, asset_id, requested_by, queue_position, status,
              priority, playback_options, requested_at, started_at, ended_at,
              removed_at, removed_by_control_session_id, undo_expires_at
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
    const result = await this.db.query<QueueEntryRow>(
      `INSERT INTO queue_entries (
         room_id, song_id, asset_id, requested_by, queue_position, status, priority,
         playback_options, requested_at, started_at, ended_at, removed_at,
         removed_by_control_session_id, undo_expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)
       RETURNING id, room_id, song_id, asset_id, requested_by, queue_position, status,
                 priority, playback_options, requested_at, started_at, ended_at,
                 removed_at, removed_by_control_session_id, undo_expires_at`,
      [
        input.roomId,
        input.songId,
        input.assetId,
        input.requestedBy,
        input.queuePosition,
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

    return mapQueueEntryRow(row);
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
       RETURNING id, room_id, song_id, asset_id, requested_by, queue_position, status,
                 priority, playback_options, requested_at, started_at, ended_at,
                 removed_at, removed_by_control_session_id, undo_expires_at`,
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
       RETURNING id, room_id, song_id, asset_id, requested_by, queue_position, status,
                 priority, playback_options, requested_at, started_at, ended_at,
                 removed_at, removed_by_control_session_id, undo_expires_at`,
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
       RETURNING qe.id, qe.room_id, qe.song_id, qe.asset_id, qe.requested_by, qe.queue_position,
                 qe.status, qe.priority, qe.playback_options, qe.requested_at, qe.started_at,
                 qe.ended_at, qe.removed_at, qe.removed_by_control_session_id, qe.undo_expires_at`,
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
       RETURNING id, room_id, song_id, asset_id, requested_by, queue_position, status,
                 priority, playback_options, requested_at, started_at, ended_at,
                 removed_at, removed_by_control_session_id, undo_expires_at`,
      [input.roomId, input.queueEntryId, input.status, input.endedAt]
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
    const entry: QueueEntry = {
      id: `queue-entry-${this.entries.size + 1}`,
      roomId: input.roomId,
      songId: input.songId,
      assetId: input.assetId,
      requestedBy: input.requestedBy,
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

function toIsoString(value: Date): string {
  return value.toISOString();
}
