import type { FastifyInstance } from "fastify";
import type { PlaybackSession, Room } from "@home-ktv/domain";
import type { RoomEventName } from "@home-ktv/protocol";
import type { ApiConfig } from "../config.js";

export interface HealthRouteContext {
  config: ApiConfig;
  room: Room;
  session: PlaybackSession;
  snapshotEventName: RoomEventName;
}

const defaultHealthRoom = {
  roomSlug: "living-room"
} as const;

export async function registerHealthRoutes(fastify: FastifyInstance, context: HealthRouteContext): Promise<void> {
  fastify.get("/health", async () => ({
    status: "ok",
    roomSlug: context.config.roomSlug || defaultHealthRoom.roomSlug,
    mediaRootConfigured: context.config.mediaRoot.length > 0,
    room: {
      id: context.room.id,
      slug: context.room.slug,
      name: context.room.name,
      status: context.room.status
    },
    playback: {
      playerState: context.session.playerState,
      sessionVersion: context.session.version,
      activeAssetId: context.session.activeAssetId
    },
    protocol: {
      roomSnapshotUpdated: context.snapshotEventName
    }
  }));
}
