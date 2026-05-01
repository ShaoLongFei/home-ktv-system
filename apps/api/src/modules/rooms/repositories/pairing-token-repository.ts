import type { RoomId, RoomPairingToken } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { RoomPairingTokenRow } from "../../../db/schema.js";

export interface UpsertRoomPairingTokenInput {
  roomId: RoomId;
  tokenValue: string;
  tokenHash: string;
  tokenExpiresAt: Date;
  now: Date;
}

export interface RoomPairingTokenRepository {
  findByRoomId(roomId: RoomId): Promise<RoomPairingToken | null>;
  upsert(input: UpsertRoomPairingTokenInput): Promise<RoomPairingToken>;
}

function mapRoomPairingTokenRow(row: RoomPairingTokenRow): RoomPairingToken {
  return {
    roomId: row.room_id as RoomId,
    tokenValue: row.token_value,
    tokenHash: row.token_hash,
    tokenExpiresAt: row.token_expires_at.toISOString(),
    rotatedAt: row.rotated_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class PgRoomPairingTokenRepository implements RoomPairingTokenRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findByRoomId(roomId: RoomId): Promise<RoomPairingToken | null> {
    const result = await this.db.query<RoomPairingTokenRow>(
      `SELECT room_id, token_value, token_hash, token_expires_at, rotated_at, created_at, updated_at
       FROM room_pairing_tokens
       WHERE room_id = $1
       LIMIT 1`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapRoomPairingTokenRow(row) : null;
  }

  async upsert(input: UpsertRoomPairingTokenInput): Promise<RoomPairingToken> {
    const result = await this.db.query<RoomPairingTokenRow>(
      `INSERT INTO room_pairing_tokens (room_id, token_value, token_hash, token_expires_at, rotated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (room_id) DO UPDATE
       SET token_value = EXCLUDED.token_value,
           token_hash = EXCLUDED.token_hash,
           token_expires_at = EXCLUDED.token_expires_at,
           rotated_at = EXCLUDED.rotated_at,
           updated_at = now()
       RETURNING room_id, token_value, token_hash, token_expires_at, rotated_at, created_at, updated_at`,
      [input.roomId, input.tokenValue, input.tokenHash, input.tokenExpiresAt, input.now]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Pairing token upsert did not return a row");
    }

    return mapRoomPairingTokenRow(row);
  }
}

export class InMemoryRoomPairingTokenRepository implements RoomPairingTokenRepository {
  private readonly tokens = new Map<RoomId, RoomPairingToken>();

  constructor(initialTokens: readonly RoomPairingToken[] = []) {
    for (const token of initialTokens) {
      this.tokens.set(token.roomId, { ...token });
    }
  }

  async findByRoomId(roomId: RoomId): Promise<RoomPairingToken | null> {
    const token = this.tokens.get(roomId);
    return token ? { ...token } : null;
  }

  async upsert(input: UpsertRoomPairingTokenInput): Promise<RoomPairingToken> {
    const nowIso = input.now.toISOString();
    const existing = this.tokens.get(input.roomId);
    const token: RoomPairingToken = {
      roomId: input.roomId,
      tokenValue: input.tokenValue,
      tokenHash: input.tokenHash,
      tokenExpiresAt: input.tokenExpiresAt.toISOString(),
      rotatedAt: nowIso,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso
    };

    this.tokens.set(input.roomId, token);
    return { ...token };
  }
}
