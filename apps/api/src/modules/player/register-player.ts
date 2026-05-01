import type { DeviceSession, DeviceSessionId, Room, RoomId } from "@home-ktv/domain";
import type { PairingInfo, PlayerConflictState } from "@home-ktv/player-contracts";
import type { QueryExecutor } from "../../db/query-executor.js";
import type { DeviceSessionRow } from "../../db/schema.js";
import { getOrCreatePairingInfo } from "../rooms/pairing-token-service.js";
import type { RoomPairingTokenRepository } from "../rooms/repositories/pairing-token-repository.js";
import { detectPlayerConflict } from "./conflict-service.js";

export interface RegisterPlayerInput {
  room: Room;
  deviceId: string;
  deviceName: string;
  capabilities: Record<string, boolean | string | number>;
  publicBaseUrl: string;
  repository: PlayerDeviceSessionRepository;
  pairingTokens: RoomPairingTokenRepository;
  now?: Date;
}

export type RegisterPlayerResult =
  | {
      status: "registered";
      deviceSession: DeviceSession;
      pairing: PairingInfo;
      conflict: null;
    }
  | {
      status: "conflict";
      deviceSession: null;
      pairing: PairingInfo;
      conflict: PlayerConflictState;
    };

export interface UpsertTvPlayerInput {
  roomId: RoomId;
  deviceId: string;
  deviceName: string;
  capabilities: Record<string, boolean | string | number>;
  pairingToken: string;
  now: Date;
}

export interface UpdateTvHeartbeatInput {
  roomId: RoomId;
  deviceId: string;
  now: Date;
}

export interface PlayerDeviceSessionRepository {
  findActiveTvPlayer(roomId: RoomId, activeAfter: Date): Promise<DeviceSession | null>;
  upsertTvPlayer(input: UpsertTvPlayerInput): Promise<DeviceSession>;
  updateTvHeartbeat(input: UpdateTvHeartbeatInput): Promise<DeviceSession | null>;
}

export async function registerPlayer(input: RegisterPlayerInput): Promise<RegisterPlayerResult> {
  const now = input.now ?? new Date();
  const pairing = await getOrCreatePairingInfo({
    room: input.room,
    publicBaseUrl: input.publicBaseUrl,
    repository: input.pairingTokens,
    now
  });
  const conflict = await detectPlayerConflict({
    roomId: input.room.id,
    deviceId: input.deviceId,
    repository: input.repository,
    now
  });

  if (conflict) {
    return {
      status: "conflict",
      deviceSession: null,
      pairing,
      conflict
    };
  }

  const deviceSession = await input.repository.upsertTvPlayer({
    roomId: input.room.id,
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    capabilities: input.capabilities,
    pairingToken: pairing.token,
    now
  });

  return {
    status: "registered",
    deviceSession,
    pairing,
    conflict: null
  };
}

function mapDeviceSessionRow(row: DeviceSessionRow): DeviceSession {
  return {
    id: row.id as DeviceSessionId,
    roomId: row.room_id as RoomId,
    deviceType: "tv",
    deviceName: row.device_name,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    capabilities: row.capabilities as Record<string, boolean | string | number>,
    pairingToken: row.pairing_token,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class PgPlayerDeviceSessionRepository implements PlayerDeviceSessionRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findActiveTvPlayer(roomId: RoomId, activeAfter: Date): Promise<DeviceSession | null> {
    const result = await this.db.query<DeviceSessionRow>(
      `SELECT id, room_id, device_type, device_name, last_seen_at, capabilities, pairing_token, created_at, updated_at
       FROM device_sessions
       WHERE room_id = $1
         AND device_type = 'tv'
         AND last_seen_at >= $2
       ORDER BY last_seen_at DESC
       LIMIT 1`,
      [roomId, activeAfter]
    );

    const row = result.rows[0];
    return row ? mapDeviceSessionRow(row) : null;
  }

  async upsertTvPlayer(input: UpsertTvPlayerInput): Promise<DeviceSession> {
    const result = await this.db.query<DeviceSessionRow>(
      `INSERT INTO device_sessions (id, room_id, device_type, device_name, last_seen_at, capabilities, pairing_token)
       VALUES ($1, $2, 'tv', $3, $4, $5::jsonb, $6)
       ON CONFLICT (id) DO UPDATE
       SET room_id = EXCLUDED.room_id,
           device_type = 'tv',
           device_name = EXCLUDED.device_name,
           last_seen_at = EXCLUDED.last_seen_at,
           capabilities = EXCLUDED.capabilities,
           pairing_token = EXCLUDED.pairing_token,
           updated_at = now()
       RETURNING id, room_id, device_type, device_name, last_seen_at, capabilities, pairing_token, created_at, updated_at`,
      [
        input.deviceId,
        input.roomId,
        input.deviceName,
        input.now,
        JSON.stringify(input.capabilities),
        input.pairingToken
      ]
    );

    await this.db.query(`UPDATE rooms SET default_player_device_id = $1, updated_at = now() WHERE id = $2`, [
      input.deviceId,
      input.roomId
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error("TV player upsert did not return a device session");
    }

    return mapDeviceSessionRow(row);
  }

  async updateTvHeartbeat(input: UpdateTvHeartbeatInput): Promise<DeviceSession | null> {
    const result = await this.db.query<DeviceSessionRow>(
      `UPDATE device_sessions
       SET last_seen_at = $3,
           updated_at = now()
       WHERE id = $1
         AND room_id = $2
         AND device_type = 'tv'
       RETURNING id, room_id, device_type, device_name, last_seen_at, capabilities, pairing_token, created_at, updated_at`,
      [input.deviceId, input.roomId, input.now]
    );

    const row = result.rows[0];
    return row ? mapDeviceSessionRow(row) : null;
  }
}
