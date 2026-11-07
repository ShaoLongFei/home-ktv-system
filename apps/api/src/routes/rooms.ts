import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";

export interface RoomRouteDependencies {
  rooms: RoomRepository;
}

interface CreateRoomBody {
  name?: unknown;
  deviceId?: unknown;
  slug?: unknown;
}

/** TV 端建房：生成短 slug，owner 记为电视设备，1 小时无心跳后由 sweeper 回收。 */
export async function registerRoomRoutes(server: FastifyInstance, dependencies: RoomRouteDependencies): Promise<void> {
  server.post<{ Body: CreateRoomBody }>("/rooms", async (request, reply) => {
    if (!dependencies.rooms.create) {
      await reply.code(503).send({ code: "ROOM_CREATE_UNAVAILABLE" });
      return;
    }

    const body = request.body ?? {};
    const name = readText(body.name, 40) ?? "我的 KTV";
    const deviceId = readText(body.deviceId, 120);
    const requestedSlug = normalizeSlug(readText(body.slug, 40));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = requestedSlug ?? `room-${randomBytes(3).toString("hex")}`;
      if (await dependencies.rooms.findBySlug(slug)) {
        if (requestedSlug) {
          await reply.code(409).send({ code: "ROOM_SLUG_TAKEN" });
          return;
        }
        continue;
      }

      const room = await dependencies.rooms.create({
        id: slug,
        slug,
        name,
        ownerDeviceId: deviceId ?? null
      });
      await reply.code(201).send({
        room: { slug: room.slug, name: room.name },
        controllerUrl: `/controller?room=${encodeURIComponent(room.slug)}`
      });
      return;
    }

    await reply.code(500).send({ code: "ROOM_SLUG_EXHAUSTED" });
  });
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function normalizeSlug(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const slug = value.toLowerCase().replace(/[^a-z0-9-]/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
  return slug.length >= 2 ? slug.slice(0, 40) : null;
}
