import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import type { DeviceSession, PlaybackEvent, PlaybackSession, Room } from "@home-ktv/domain";
import { protocolMessageNames } from "@home-ktv/protocol";
import { loadConfig, normalizeApiConfig, type ApiConfig, type ApiConfigInput } from "./config.js";
import { MediaPathResolver } from "./modules/assets/media-path-resolver.js";
import { MediaGateway } from "./modules/media/media-gateway.js";
import { NasPlayableMediaRepository } from "./modules/media/nas-playable-media-repository.js";
import { IgebaClient } from "./modules/online/igeba/igeba-client.js";
import { createIgebaProvider } from "./modules/online/igeba/igeba-provider.js";
import {
  InMemoryOnlineCatalogRepository,
  PgOnlineCatalogRepository,
  type OnlineCatalogRepository
} from "./modules/online/online-catalog-repository.js";
import { OnlineImportService } from "./modules/online/online-import-service.js";
import {
  InMemoryOnlineCatalogPromoter,
  PgOnlineCatalogPromoter,
  type OnlineCatalogPromoter
} from "./modules/online/online-catalog-promoter.js";
import type { PlayerDeviceSessionRepository } from "./modules/player/register-player.js";
import {
  InMemoryControlSessionRepository,
  type ControlSessionRepository
} from "./modules/controller/repositories/control-session-repository.js";
import { InMemoryControllerAuthRepository } from "./modules/controller/repositories/controller-auth-repository.js";
import type { PlaybackEventRepository } from "./modules/playback/repositories/playback-event-repository.js";
import type {
  UpdatePlaybackFactsInput,
  UpdatePlayerPositionInput
} from "./modules/playback/repositories/playback-session-repository.js";
import { InMemoryQueueEntryRepository } from "./modules/playback/repositories/queue-entry-repository.js";
import {
  type RoomSessionCommandRecord,
  type RoomSessionCommandRepository
} from "./modules/playback/repositories/room-session-command-repository.js";
import { InMemoryRoomPairingTokenRepository } from "./modules/rooms/repositories/pairing-token-repository.js";
import type { RoomRepository } from "./modules/rooms/repositories/room-repository.js";
import { buildRoomControlSnapshot } from "./modules/rooms/build-control-snapshot.js";
import { RoomSnapshotBroadcaster } from "./modules/realtime/room-snapshot-broadcaster.js";
import {
  createPgRuntimeRepositories,
  type RuntimeRepositories
} from "./runtime/pg-runtime-repositories.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerCors } from "./routes/cors.js";
import { registerAdminKtvIndexRoutes } from "./routes/admin-ktv-index.js";
import { registerAdminRoomsRoutes } from "./routes/admin-rooms.js";
import { registerControlCommandRoutes } from "./routes/control-commands.js";
import { registerControllerAuthRoutes } from "./routes/controller-auth.js";
import { registerControllerUserHistoryRoutes } from "./routes/controller-user-history.js";
import { registerControlSessionRoutes } from "./routes/control-sessions.js";
import { PgKtvIndexRawAssetRepository, registerMediaRoutes } from "./routes/media.js";
import { registerPlayerRoutes } from "./routes/player.js";
import { registerRealtimeRoutes } from "./routes/realtime.js";
import { registerRoomInteractionRoutes } from "./routes/room-interactions.js";
import { registerRoomSnapshotRoutes } from "./routes/room-snapshots.js";
import { registerOnlineCatalogRoutes } from "./routes/online-catalog.js";
import { startPlaybackIfIdle } from "./modules/playback/session-command-service.js";
import { registerRoomRoutes } from "./routes/rooms.js";
import { registerSongDiscoveryRoutes } from "./routes/song-discovery.js";
import { registerSongSearchRoutes } from "./routes/song-search.js";

export interface CreateServerOptions {
  poolFactory?: (databaseUrl: string) => Pool;
}

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

export async function createServer(config: ApiConfigInput = loadConfig(), options: CreateServerOptions = {}) {
  const resolvedConfig = normalizeApiConfig(config);
  const server = Fastify({ logger: true });
  const room = createLivingRoom(resolvedConfig);
  const session = createInitialPlaybackSession(room);
  const pool = resolvedConfig.databaseUrl ? (options.poolFactory ?? createPgPool)(resolvedConfig.databaseUrl) : null;
  const repositories = pool
    ? createPgRuntimeRepositories(pool, { mediaPathMappings: resolvedConfig.mediaPathMappings })
    : await createInMemoryRepositories(room, session, resolvedConfig);
  const mediaPathResolver = new MediaPathResolver({
    mediaRoot: resolvedConfig.mediaRoot,
    pathMappings: resolvedConfig.mediaPathMappings
  });
  const onlineRepository: OnlineCatalogRepository = pool
    ? new PgOnlineCatalogRepository(pool)
    : new InMemoryOnlineCatalogRepository();
  const onlinePromoter: OnlineCatalogPromoter = pool
    ? new PgOnlineCatalogPromoter(pool)
    : new InMemoryOnlineCatalogPromoter();
  const onlineImport = createOnlineImportService(resolvedConfig, onlineRepository, onlinePromoter);
  if (onlineImport) {
    // 启动对账 + 每小时清理过期缓存与卡住的任务
    void onlineImport.pruneExpired().catch(() => undefined);
    // 回收 TV 端离线超过 1 小时的自建房
  const sweepStaleRooms = async (): Promise<void> => {
    if (!repositories.rooms.findStaleTvRooms || !repositories.rooms.delete) {
      return;
    }
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const staleRooms = await repositories.rooms.findStaleTvRooms({ cutoff });
    for (const room of staleRooms) {
      await repositories.rooms.delete(room.id);
      server.log.info({ roomSlug: room.slug }, "stale TV room removed");
    }
  };
  void sweepStaleRooms().catch(() => undefined);
  const sweepTimer = setInterval(() => {
    void sweepStaleRooms().catch(() => undefined);
  }, 10 * 60 * 1000);
  sweepTimer.unref?.();

  // 历史缓存补齐伴奏变体（幂等，失败不影响启动）
    void onlineImport.backfillVariants().catch(() => undefined);
    const maintenanceTimer = setInterval(() => {
      void onlineImport.pruneExpired().catch(() => undefined);
    }, 60 * 60 * 1000);
    maintenanceTimer.unref?.();
    server.addHook("onClose", async () => {
      clearInterval(maintenanceTimer);
    });
  }
  const mediaGateway = new MediaGateway({
    playableMedia: repositories.playableMedia ?? { findPlayableBySource: async () => null },
    mediaPathResolver,
    publicBaseUrl: resolvedConfig.publicBaseUrl,
    onlineAssets: onlineRepository
  });
  const broadcaster = new RoomSnapshotBroadcaster();

  if (pool) {
    server.addHook("onClose", async () => {
      await pool.end();
    });
  }

  await server.register(websocket);
  await registerCors(server, { allowedOrigins: resolvedConfig.corsAllowedOrigins });
  await registerHealthRoutes(server, {
    config: resolvedConfig,
    room,
    session,
    snapshotEventName: protocolMessageNames.snapshotUpdated
  });
  await registerMediaRoutes(server, {
    coverRoot: resolvedConfig.mediaRoot ? join(resolvedConfig.mediaRoot, "covers") : "",
    mediaGateway,
    ...(pool
      ? {
          ktvIndexRawAssets: new PgKtvIndexRawAssetRepository(pool),
          mediaPathResolver
        }
      : {})
  });
  if (pool && repositories.ktvIndex) {
    await registerAdminKtvIndexRoutes(server, { ktvIndex: repositories.ktvIndex });
  }
  await registerAdminRoomsRoutes(server, {
    config: resolvedConfig,
    rooms: repositories.rooms,
    pairingTokens: repositories.pairingTokens,
    playbackSessions: repositories.playbackSessions,
    queueEntries: repositories.queueEntries,
    ...(repositories.playableMedia ? { playableMedia: repositories.playableMedia } : {}),
    controlSessions: repositories.controlSessions,
    deviceSessions: repositories.deviceSessions,
    playbackEvents: repositories.playbackEvents,
    ...(mediaGateway ? { mediaGateway } : {}),
    broadcaster
  });
  await registerRoomSnapshotRoutes(server, {
    config: resolvedConfig,
    repositories,
    ...(mediaGateway ? { mediaGateway } : {})
  });
  await registerControllerAuthRoutes(server, {
    controllerAuth: repositories.controllerAuth
  });
  await registerControllerUserHistoryRoutes(server, {
    controllerAuth: repositories.controllerAuth,
    queueEntries: repositories.queueEntries
  });
  await registerControlSessionRoutes(server, {
    config: resolvedConfig,
    repositories,
    ...(mediaGateway ? { mediaGateway } : {})
  });
  await registerRealtimeRoutes(server, {
    config: resolvedConfig,
    repositories,
    ...(mediaGateway ? { mediaGateway } : {}),
    broadcaster
  });
  await registerPlayerRoutes(server, {
    config: resolvedConfig,
    repositories,
    ...(mediaGateway ? { mediaGateway } : {}),
    broadcaster
  });
  await registerSongSearchRoutes(server, {
    rooms: repositories.rooms,
    queueEntries: repositories.queueEntries,
    ...(repositories.ktvIndex ? { ktvIndex: repositories.ktvIndex } : {}),
    ...(onlineImport
      ? {
          onlineCatalog: {
            search: (keyword: string, limit: number) => onlineImport.search(keyword, limit),
            searchPage: (keyword: string, options: { page: number; pageSize: number }) =>
              onlineImport.searchPage(keyword, options)
          }
        }
      : {})
  });
  if (onlineImport) {
    let ensureInFlight: Promise<void> | null = null;
    const ensurePlaybackStarted = async (room: Room): Promise<void> => {
      if (ensureInFlight) {
        return ensureInFlight;
      }
      ensureInFlight = (async () => {
        const snapshot = await startPlaybackIfIdle({
          config: resolvedConfig,
          room,
          repositories,
          mediaGateway
        });
        if (snapshot) {
          broadcaster.broadcastRoomSnapshot(room.slug, snapshot);
        }
      })().finally(() => {
        ensureInFlight = null;
      });
      return ensureInFlight;
    };

    // 在线歌入库后会直接写队列，绕过了命令链路，所以这里必须补一次广播：
    // 否则房间已在播放时 ensurePlaybackStarted 不产生快照，手机歌单和电视都收不到新歌。
    const broadcastRoomSnapshot = async (room: Room): Promise<void> => {
      const snapshot = await buildRoomControlSnapshot({
        roomSlug: room.slug,
        config: resolvedConfig,
        repositories,
        ...(mediaGateway ? { mediaGateway } : {})
      });
      if (snapshot) {
        broadcaster.broadcastRoomSnapshot(room.slug, snapshot);
      }
    };

    await registerOnlineCatalogRoutes(server, {
      rooms: repositories.rooms,
      onlineImport,
      queueEntries: repositories.queueEntries,
      ensurePlaybackStarted,
      broadcastRoomSnapshot
    });
  }
  await registerRoomRoutes(server, { rooms: repositories.rooms });
  await registerSongDiscoveryRoutes(server, {
    rooms: repositories.rooms,
    queueEntries: repositories.queueEntries,
    ...(repositories.ktvIndex ? { ktvIndex: repositories.ktvIndex } : {}),
    ...(repositories.songCovers ? { songCovers: repositories.songCovers } : {}),
    ...(onlineImport ? { onlineDiscovery: onlineImport } : {})
  });
  await registerRoomInteractionRoutes(server, {
    rooms: repositories.rooms,
    controlSessions: repositories.controlSessions,
    broadcaster
  });
  await registerControlCommandRoutes(server, {
    config: resolvedConfig,
    repositories,
    ...(mediaGateway ? { mediaGateway } : {}),
    broadcaster
  });

  return server;
}

function createOnlineImportService(
  config: ApiConfig,
  repository: OnlineCatalogRepository,
  promoter: OnlineCatalogPromoter
): OnlineImportService | undefined {
  const igeba = config.igeba;
  if (!igeba?.enabled || !igeba.cacheDir) {
    return undefined;
  }

  const client = new IgebaClient({
    baseUrl: igeba.baseUrl,
    uid: igeba.uid,
    minIntervalMs: igeba.minIntervalMs,
    requestTimeoutMs: igeba.requestTimeoutMs,
    resolveAttempts: igeba.resolveAttempts
  });

  return new OnlineImportService({
    provider: createIgebaProvider(client),
    repository,
    promoter,
    cacheDir: igeba.cacheDir,
    concurrency: igeba.concurrency,
    cacheMaxBytes: igeba.cacheMaxBytes,
    cacheMaxItems: igeba.cacheMaxItems,
    cacheTtlDays: igeba.cacheTtlDays
  });
}

function createPgPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

async function createInMemoryRepositories(room: Room, session: PlaybackSession, _config: ApiConfig): Promise<RuntimeRepositories> {
  return new InMemoryRuntimeRepositories(room, session);
}

class InMemoryRuntimeRepositories implements RuntimeRepositories {
  readonly rooms: RoomRepository = {
    findById: async (roomId) => (roomId === this.room.id ? this.room : null),
    findBySlug: async (slug) => (slug === this.room.slug ? this.room : null)
  };

  readonly pairingTokens = new InMemoryRoomPairingTokenRepository();
  readonly controlSessions = new InMemoryControlSessionRepository();
  readonly controllerAuth = new InMemoryControllerAuthRepository();
  readonly controlCommands = new InMemoryRoomSessionCommandRepository();

  readonly queueEntries = new InMemoryQueueEntryRepository();

  readonly deviceSessions: PlayerDeviceSessionRepository = {
    findActiveTvPlayer: async (roomId, activeAfter) => this.findActiveTvPlayer(roomId, activeAfter),
    listActiveTvPlayers: async (roomId, activeAfter) => this.listActiveTvPlayers(roomId, activeAfter),
    upsertTvPlayer: async (input) => this.upsertTvPlayer(input),
    updateTvHeartbeat: async (input) => this.updateTvHeartbeat(input)
  };

  readonly playbackEvents: PlaybackEventRepository = {
    append: async (input) => this.append(input)
  };

  readonly playbackSessions = {
    findByRoomId: async (roomId: string) => this.findByRoomId(roomId),
    startQueueEntry: async () => this.findByRoomId(this.room.id),
    setIdle: async () => this.findByRoomId(this.room.id),
    requestSwitchTarget: async () => this.findByRoomId(this.room.id),
    bumpVersion: async () => this.bumpVersion(),
    updatePlayerPosition: async (input: UpdatePlayerPositionInput) => this.updatePlayerPosition(input),
    updatePlaybackFacts: async (input: UpdatePlaybackFactsInput) => this.updatePlaybackFacts(input)
  };

  private readonly devices = new Map<string, DeviceSession>();
  private readonly events: PlaybackEvent[] = [];

  constructor(private readonly room: Room, private session: PlaybackSession) {}

  async findByRoomId(roomId: string): Promise<PlaybackSession | null> {
    return roomId === this.room.id ? this.session : null;
  }

  async findActiveTvPlayer(roomId: string, activeAfter: Date): Promise<DeviceSession | null> {
    const active = await this.listActiveTvPlayers(roomId, activeAfter);
    return active[0] ?? null;
  }

  async listActiveTvPlayers(roomId: string, activeAfter: Date): Promise<DeviceSession[]> {
    const active = Array.from(this.devices.values())
      .filter(
        (device) =>
          device.roomId === roomId &&
          device.deviceType === "tv" &&
          Boolean(device.lastSeenAt) &&
          new Date(device.lastSeenAt ?? 0).getTime() >= activeAfter.getTime()
      )
      .sort((a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime());

    return active;
  }

  async upsertTvPlayer(input: Parameters<PlayerDeviceSessionRepository["upsertTvPlayer"]>[0]): Promise<DeviceSession> {
    const nowIso = input.now.toISOString();
    for (const device of this.devices.values()) {
      if (device.roomId === input.roomId && device.deviceType === "tv" && device.id !== input.deviceId) {
        this.devices.delete(device.id);
      }
    }

    const existing = this.devices.get(input.deviceId);
    const device: DeviceSession = {
      id: input.deviceId,
      roomId: input.roomId,
      deviceType: "tv",
      deviceName: input.deviceName,
      lastSeenAt: nowIso,
      capabilities: input.capabilities,
      pairingToken: input.pairingToken,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso
    };

    this.devices.set(input.deviceId, device);
    return device;
  }

  async updateTvHeartbeat(input: Parameters<PlayerDeviceSessionRepository["updateTvHeartbeat"]>[0]): Promise<DeviceSession | null> {
    const existing = this.devices.get(input.deviceId);
    if (!existing || existing.roomId !== input.roomId) {
      return null;
    }

    const updated: DeviceSession = {
      ...existing,
      lastSeenAt: input.now.toISOString(),
      updatedAt: input.now.toISOString()
    };
    this.devices.set(input.deviceId, updated);
    return updated;
  }

  async updatePlayerPosition(input: UpdatePlayerPositionInput): Promise<PlaybackSession | null> {
    if (input.roomId !== this.room.id) {
      return null;
    }

    this.session = {
      ...this.session,
      currentQueueEntryId: input.currentQueueEntryId ?? this.session.currentQueueEntryId,
      playerPositionMs: input.playerPositionMs,
      playerState: input.playerState ?? this.session.playerState,
      updatedAt: new Date().toISOString()
    };
    return this.session;
  }

  async updatePlaybackFacts(input: UpdatePlaybackFactsInput): Promise<PlaybackSession | null> {
    if (input.roomId !== this.room.id) {
      return null;
    }

    this.session = {
      ...this.session,
      currentQueueEntryId: input.queueEntryId,
      activeAssetId: input.activeAssetId ?? this.session.activeAssetId,
      targetVocalMode: input.targetVocalMode ?? this.session.targetVocalMode,
      playerState: input.playerState,
      playerPositionMs: input.playerPositionMs,
      version: this.session.version + 1,
      updatedAt: new Date().toISOString()
    };
    return this.session;
  }

  async bumpVersion(): Promise<PlaybackSession | null> {
    this.session = {
      ...this.session,
      version: this.session.version + 1,
      updatedAt: new Date().toISOString()
    };
    return this.session;
  }

  async append<TPayload extends Record<string, unknown>>(input: {
    roomId: string;
    queueEntryId: string | null;
    eventType: string;
    eventPayload: TPayload;
  }): Promise<PlaybackEvent<TPayload>> {
    const event: PlaybackEvent<TPayload> = {
      id: `event-${this.events.length + 1}`,
      roomId: input.roomId,
      queueEntryId: input.queueEntryId,
      eventType: input.eventType,
      eventPayload: input.eventPayload,
      createdAt: new Date().toISOString()
    };
    this.events.push(event);
    return event;
  }
}

class InMemoryRoomSessionCommandRepository {
  private readonly records = new Map<string, RoomSessionCommandRecord>();

  async findCommand(commandId: string): Promise<RoomSessionCommandRecord | null> {
    return this.records.get(commandId) ?? null;
  }

  async insertCommandAttempt(
    input: Parameters<RoomSessionCommandRepository["insertCommandAttempt"]>[0]
  ): Promise<RoomSessionCommandRecord> {
    const record: RoomSessionCommandRecord = {
      commandId: input.commandId,
      roomId: input.roomId,
      controlSessionId: input.controlSessionId,
      sessionVersion: input.sessionVersion,
      type: input.type,
      payload: input.payload,
      resultStatus: input.resultStatus,
      resultPayload: input.resultPayload ?? {},
      createdAt: new Date().toISOString()
    };
    this.records.set(record.commandId, record);
    return { ...record };
  }

  async updateCommandResult(
    input: Parameters<RoomSessionCommandRepository["updateCommandResult"]>[0]
  ): Promise<RoomSessionCommandRecord | null> {
    const existing = this.records.get(input.commandId);
    if (!existing) {
      return null;
    }

    const updated: RoomSessionCommandRecord = {
      ...existing,
      resultStatus: input.resultStatus,
      resultPayload: input.resultPayload ?? {}
    };
    this.records.set(input.commandId, updated);
    return { ...updated };
  }
}

export async function startServer(config: ApiConfigInput = loadConfig()): Promise<void> {
  const resolvedConfig = normalizeApiConfig(config);
  const server = await createServer(config);
  await server.listen({ host: resolvedConfig.host, port: resolvedConfig.port });
}

const entrypointUrl = pathToFileURL(process.argv[1] ?? "").href;

if (import.meta.url === entrypointUrl) {
  startServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
