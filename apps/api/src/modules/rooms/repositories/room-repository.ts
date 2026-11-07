import type { DeviceSessionId, Room, RoomId, RoomStatus } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { RoomRow } from "../../../db/schema.js";

export interface RoomRepository {
  findById(roomId: RoomId): Promise<Room | null>;
  findBySlug(slug: string): Promise<Room | null>;
  create?(input: { id: string; slug: string; name: string; ownerDeviceId?: string | null }): Promise<Room>;
  delete?(roomId: RoomId): Promise<boolean>;
  /** TV 超过 cutoff 没有心跳的房间（含刚创建还没连上的）。 */
  findStaleTvRooms?(input: { cutoff: Date }): Promise<Room[]>;
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

  async create(input: { id: string; slug: string; name: string; ownerDeviceId?: string | null }): Promise<Room> {
    const result = await this.db.query<RoomRow>(
      `INSERT INTO rooms (id, slug, name, status, owner_device_id)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING id, slug, name, status, default_player_device_id, created_at, updated_at`,
      [input.id, input.slug, input.name, input.ownerDeviceId ?? null]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("room insert did not return a row");
    }
    return mapRoomRow(row);
  }

  async delete(roomId: RoomId): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(`DELETE FROM rooms WHERE id = $1 RETURNING id`, [roomId]);
    return result.rows.length > 0;
  }

  async findStaleTvRooms(input: { cutoff: Date }): Promise<Room[]> {
    const result = await this.db.query<RoomRow>(
      `SELECT r.id, r.slug, r.name, r.status, r.default_player_device_id, r.created_at, r.updated_at
       FROM rooms r
       WHERE r.created_at < $1
         AND r.owner_device_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM room_clients c
           WHERE c.room_id = r.id
             AND c.client_type = 'tv'
             AND c.last_seen_at >= $1
         )`,
      [input.cutoff]
    );
    return result.rows.map(mapRoomRow);
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
