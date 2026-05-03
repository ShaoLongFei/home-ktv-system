import type { ControlSession, ControlSessionId, RoomId } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { ControlSessionRow } from "../../../db/schema.js";

export interface UpsertControlSessionInput {
  roomId: RoomId;
  deviceId: string;
  deviceName: string;
  lastSeenAt: Date;
  expiresAt: Date;
  now: Date;
}

export interface TouchControlSessionInput {
  sessionId: ControlSessionId;
  lastSeenAt: Date;
  expiresAt: Date;
  now: Date;
}

export interface FindActiveControlSessionInput {
  sessionId: ControlSessionId;
  deviceId: string;
  now: Date;
}

export interface CountActiveByRoomInput {
  roomId: RoomId;
  activeAfter: Date;
}

export interface ControlSessionRepository {
  upsertForDevice(input: UpsertControlSessionInput): Promise<ControlSession>;
  findActiveByIdAndDevice(input: FindActiveControlSessionInput): Promise<ControlSession | null>;
  touch(input: TouchControlSessionInput): Promise<ControlSession | null>;
  countActiveByRoom(roomId: RoomId, activeAfter: Date): Promise<number>;
}

function mapControlSessionRow(row: ControlSessionRow): ControlSession {
  return {
    id: row.id as ControlSessionId,
    roomId: row.room_id as RoomId,
    deviceId: row.device_id,
    deviceName: row.device_name,
    lastSeenAt: row.last_seen_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class PgControlSessionRepository implements ControlSessionRepository {
  constructor(private readonly db: QueryExecutor) {}

  async upsertForDevice(input: UpsertControlSessionInput): Promise<ControlSession> {
    const result = await this.db.query<ControlSessionRow>(
      `INSERT INTO control_sessions (room_id, device_id, device_name, last_seen_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (room_id, device_id) DO UPDATE
       SET device_name = EXCLUDED.device_name,
           last_seen_at = EXCLUDED.last_seen_at,
           expires_at = EXCLUDED.expires_at,
           revoked_at = NULL,
           updated_at = now()
       RETURNING id, room_id, device_id, device_name, last_seen_at, expires_at, revoked_at, created_at, updated_at`,
      [input.roomId, input.deviceId, input.deviceName, input.lastSeenAt, input.expiresAt]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Control session upsert did not return a row");
    }

    return mapControlSessionRow(row);
  }

  async findActiveByIdAndDevice(input: FindActiveControlSessionInput): Promise<ControlSession | null> {
    const result = await this.db.query<ControlSessionRow>(
      `SELECT id, room_id, device_id, device_name, last_seen_at, expires_at, revoked_at, created_at, updated_at
       FROM control_sessions
       WHERE id = $1
         AND device_id = $2
         AND revoked_at IS NULL
         AND expires_at > $3
       LIMIT 1`,
      [input.sessionId, input.deviceId, input.now]
    );

    const row = result.rows[0];
    return row ? mapControlSessionRow(row) : null;
  }

  async touch(input: TouchControlSessionInput): Promise<ControlSession | null> {
    const result = await this.db.query<ControlSessionRow>(
      `UPDATE control_sessions
       SET last_seen_at = $2,
           expires_at = $3,
           updated_at = now()
       WHERE id = $1
         AND revoked_at IS NULL
       RETURNING id, room_id, device_id, device_name, last_seen_at, expires_at, revoked_at, created_at, updated_at`,
      [input.sessionId, input.lastSeenAt, input.expiresAt]
    );

    const row = result.rows[0];
    return row ? mapControlSessionRow(row) : null;
  }

  async countActiveByRoom(roomId: RoomId, activeAfter: Date): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM control_sessions
       WHERE room_id = $1
         AND revoked_at IS NULL
         AND expires_at > $2
         AND last_seen_at >= $2`,
      [roomId, activeAfter]
    );

    return Number(result.rows[0]?.count ?? 0);
  }
}

export class InMemoryControlSessionRepository implements ControlSessionRepository {
  private readonly sessions = new Map<ControlSessionId, ControlSession>();
  private readonly sessionsByRoomDevice = new Map<string, ControlSessionId>();

  constructor(initialSessions: readonly ControlSession[] = []) {
    for (const session of initialSessions) {
      this.sessions.set(session.id, { ...session });
      this.sessionsByRoomDevice.set(this.key(session.roomId, session.deviceId), session.id);
    }
  }

  async upsertForDevice(input: UpsertControlSessionInput): Promise<ControlSession> {
    const key = this.key(input.roomId, input.deviceId);
    const existingId = this.sessionsByRoomDevice.get(key);
    const existing = existingId ? this.sessions.get(existingId) ?? null : null;
    const session: ControlSession = {
      id: existing?.id ?? `control-session-${this.sessions.size + 1}`,
      roomId: input.roomId,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      lastSeenAt: input.lastSeenAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      revokedAt: null,
      createdAt: existing?.createdAt ?? input.now.toISOString(),
      updatedAt: input.now.toISOString()
    };

    this.sessions.set(session.id, { ...session });
    this.sessionsByRoomDevice.set(key, session.id);
    return { ...session };
  }

  async findActiveByIdAndDevice(input: FindActiveControlSessionInput): Promise<ControlSession | null> {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.deviceId !== input.deviceId || session.revokedAt !== null) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= input.now.getTime()) {
      return null;
    }

    return { ...session };
  }

  async touch(input: TouchControlSessionInput): Promise<ControlSession | null> {
    const existing = this.sessions.get(input.sessionId);
    if (!existing || existing.revokedAt !== null) {
      return null;
    }

    const updated: ControlSession = {
      ...existing,
      lastSeenAt: input.lastSeenAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      updatedAt: input.now.toISOString()
    };
    this.sessions.set(input.sessionId, updated);
    return { ...updated };
  }

  async countActiveByRoom(roomId: RoomId, activeAfter: Date): Promise<number> {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (
        session.roomId === roomId &&
        session.revokedAt === null &&
        new Date(session.expiresAt).getTime() > activeAfter.getTime() &&
        new Date(session.lastSeenAt).getTime() >= activeAfter.getTime()
      ) {
        count += 1;
      }
    }
    return count;
  }

  private key(roomId: RoomId, deviceId: string): string {
    return `${roomId}:${deviceId}`;
  }
}
