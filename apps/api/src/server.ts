import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import type { PlaybackSession, Room } from "@home-ktv/domain";
import { protocolMessageNames } from "@home-ktv/protocol";
import { loadConfig, type ApiConfig } from "./config.js";
import { MediaPathResolver } from "./modules/assets/media-path-resolver.js";
import { AssetGateway } from "./modules/assets/asset-gateway.js";
import { PgAssetRepository, type AssetRepository } from "./modules/catalog/repositories/asset-repository.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMediaRoutes } from "./routes/media.js";

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
  const pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl }) : null;
  const assetRepository = pool ? new PgAssetRepository(pool) : new MissingDatabaseAssetRepository();
  const assetGateway = new AssetGateway({
    assetRepository,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: config.mediaRoot }),
    publicBaseUrl: config.publicBaseUrl
  });

  if (pool) {
    server.addHook("onClose", async () => {
      await pool.end();
    });
  }

  await registerHealthRoutes(server, {
    config,
    room,
    session,
    snapshotEventName: protocolMessageNames.snapshotUpdated
  });
  await registerMediaRoutes(server, { assetGateway });

  return server;
}

class MissingDatabaseAssetRepository implements AssetRepository {
  async findById(): Promise<null> {
    return null;
  }

  async findVerifiedSwitchCounterparts(): Promise<[]> {
    return [];
  }
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
