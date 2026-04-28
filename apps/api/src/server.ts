import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import type { PlaybackSession, Room } from "@home-ktv/domain";
import { protocolMessageNames } from "@home-ktv/protocol";
import { loadConfig, type ApiConfig } from "./config.js";
import { registerHealthRoutes } from "./routes/health.js";

function createLivingRoom(config: ApiConfig): Room {
  const now = new Date().toISOString();

  return {
    id: config.roomSlug,
    slug: config.roomSlug,
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: now,
    updatedAt: now
  };
}

function createInitialPlaybackSession(room: Room): PlaybackSession {
  return {
    roomId: room.id,
    currentQueueEntryId: null,
    nextQueueEntryId: null,
    activeAssetId: null,
    targetVocalMode: "instrumental",
    playerState: "idle",
    playerPositionMs: 0,
    mediaStartedAt: null,
    version: 1,
    updatedAt: new Date().toISOString()
  };
}

export async function createServer(config: ApiConfig = loadConfig()) {
  const server = Fastify({ logger: true });
  const room = createLivingRoom(config);
  const session = createInitialPlaybackSession(room);

  await registerHealthRoutes(server, {
    config,
    room,
    session,
    snapshotEventName: protocolMessageNames.snapshotUpdated
  });

  return server;
}

export async function startServer(config: ApiConfig = loadConfig()): Promise<void> {
  const server = await createServer(config);
  await server.listen({ host: config.host, port: config.port });
}

const entrypointUrl = pathToFileURL(process.argv[1] ?? "").href;

if (import.meta.url === entrypointUrl) {
  startServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
