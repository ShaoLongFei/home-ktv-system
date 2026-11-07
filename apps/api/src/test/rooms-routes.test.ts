import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { Room } from "@home-ktv/domain";
import { registerRoomRoutes } from "../routes/rooms.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";

class FakeRoomRepository implements RoomRepository {
  readonly rooms = new Map<string, Room>();

  async findById(roomId: string): Promise<Room | null> {
    return this.rooms.get(roomId) ?? null;
  }

  async findBySlug(slug: string): Promise<Room | null> {
    return this.rooms.get(slug) ?? null;
  }

  async create(input: { id: string; slug: string; name: string; ownerDeviceId?: string | null }): Promise<Room> {
    const room: Room = {
      id: input.id,
      slug: input.slug,
      name: input.name,
      status: "active",
      defaultPlayerDeviceId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.rooms.set(room.id, room);
    return room;
  }

  async delete(roomId: string): Promise<boolean> {
    return this.rooms.delete(roomId);
  }

  async findStaleTvRooms(): Promise<Room[]> {
    return [];
  }
}

async function createHarness() {
  const server = Fastify();
  const repository = new FakeRoomRepository();
  await registerRoomRoutes(server, { rooms: repository });
  await server.ready();
  return { server, repository };
}

describe("room creation routes", () => {
  it("creates a TV-owned room with a generated slug", async () => {
    const { server, repository } = await createHarness();

    const response = await server.inject({
      method: "POST",
      url: "/rooms",
      payload: { name: "客厅", deviceId: "web-tv-1" }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.room.slug).toMatch(/^room-[0-9a-f]{6}$/u);
    expect(body.room.name).toBe("客厅");
    expect(repository.rooms.size).toBe(1);

    await server.close();
  });

  it("rejects a duplicate requested slug", async () => {
    const { server } = await createHarness();
    await server.inject({ method: "POST", url: "/rooms", payload: { slug: "my-room" } });

    const duplicate = await server.inject({ method: "POST", url: "/rooms", payload: { slug: "my-room" } });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ code: "ROOM_SLUG_TAKEN" });
    await server.close();
  });
});
