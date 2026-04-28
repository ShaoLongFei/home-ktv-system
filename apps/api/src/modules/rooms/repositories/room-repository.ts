import type { DeviceSessionId, Room, RoomId, RoomStatus } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { RoomRow } from "../../../db/schema.js";

export interface RoomRepository {
  findById(roomId: RoomId): Promise<Room | null>;
  findBySlug(slug: string): Promise<Room | null>;
}

function mapRoomRow(row: RoomRow): Room {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status as RoomStatus,
    defaultPlayerDeviceId: row.default_player_device_id as DeviceSessionId | null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class PgRoomRepository implements RoomRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findById(roomId: RoomId): Promise<Room | null> {
    const result = await this.db.query<RoomRow>(
      `SELECT id, slug, name, status, default_player_device_id, created_at, updated_at
       FROM rooms
       WHERE id = $1
       LIMIT 1`,
      [roomId]
    );

    const row = result.rows[0];
    return row ? mapRoomRow(row) : null;
  }

  async findBySlug(slug: string): Promise<Room | null> {
    const result = await this.db.query<RoomRow>(
      `SELECT id, slug, name, status, default_player_device_id, created_at, updated_at
       FROM rooms
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );

    const row = result.rows[0];
    return row ? mapRoomRow(row) : null;
  }
}
