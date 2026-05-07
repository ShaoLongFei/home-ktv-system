import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import type { Asset, DeviceSession, PlaybackEvent, PlaybackSession, QueueEntry, Room, Song } from "@home-ktv/domain";
import { protocolMessageNames } from "@home-ktv/protocol";
import { loadConfig, normalizeApiConfig, type ApiConfig, type ApiConfigInput } from "./config.js";
import { MediaPathResolver } from "./modules/assets/media-path-resolver.js";
import { AssetGateway } from "./modules/assets/asset-gateway.js";
import { CatalogAdmissionService, PgCatalogAdmissionWriter } from "./modules/catalog/admission-service.js";
import { PgAssetRepository, type AssetRepository } from "./modules/catalog/repositories/asset-repository.js";
import {
  PgSongRepository,
  type AdminCatalogSongRepository,
  type SongRepository
} from "./modules/catalog/repositories/song-repository.js";
import { CandidateBuilder } from "./modules/ingest/candidate-builder.js";
import { ImportScanner } from "./modules/ingest/import-scanner.js";
import { resolveLibraryPaths } from "./modules/ingest/library-paths.js";
import { PgImportCandidateRepository } from "./modules/ingest/repositories/import-candidate-repository.js";
import { PgImportFileRepository } from "./modules/ingest/repositories/import-file-repository.js";
import { PgScanRunRepository } from "./modules/ingest/repositories/scan-run-repository.js";
import { createScanScheduler, type ScanScheduler, type ScanSchedulerOptions } from "./modules/ingest/scan-scheduler.js";
import { PgPlayerDeviceSessionRepository, type PlayerDeviceSessionRepository } from "./modules/player/register-player.js";
import {
  InMemoryControlSessionRepository,
  PgControlSessionRepository,
  type ControlSessionRepository
} from "./modules/controller/repositories/control-session-repository.js";
import { PgPlaybackEventRepository, type PlaybackEventRepository } from "./modules/playback/repositories/playback-event-repository.js";
import { PgPlaybackSessionRepository } from "./modules/playback/repositories/playback-session-repository.js";
import type {
  UpdatePlaybackFactsInput,
  UpdatePlayerPositionInput
} from "./modules/playback/repositories/playback-session-repository.js";
import { InMemoryQueueEntryRepository, PgQueueEntryRepository } from "./modules/playback/repositories/queue-entry-repository.js";
import {
  PgRoomSessionCommandRepository,
  type RoomSessionCommandRecord,
  type RoomSessionCommandRepository
} from "./modules/playback/repositories/room-session-command-repository.js";
import {
  InMemoryRoomPairingTokenRepository,
  PgRoomPairingTokenRepository
} from "./modules/rooms/repositories/pairing-token-repository.js";
import { PgRoomRepository, type RoomRepository } from "./modules/rooms/repositories/room-repository.js";
import { RoomSnapshotBroadcaster } from "./modules/realtime/room-snapshot-broadcaster.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerCors } from "./routes/cors.js";
import { registerAdminCatalogRoutes } from "./routes/admin-catalog.js";
import { registerAdminImportRoutes } from "./routes/admin-imports.js";
import { registerAdminRoomsRoutes } from "./routes/admin-rooms.js";
import { registerAvailableSongsRoutes } from "./routes/available-songs.js";
import { registerControlCommandRoutes } from "./routes/control-commands.js";
import { registerControlSessionRoutes } from "./routes/control-sessions.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerPlayerRoutes, type PlayerRouteRepositories } from "./routes/player.js";
import { registerRealtimeRoutes } from "./routes/realtime.js";
import { registerRoomSnapshotRoutes } from "./routes/room-snapshots.js";
import { registerSongSearchRoutes } from "./routes/song-search.js";

export interface CreateServerOptions {
  poolFactory?: (databaseUrl: string) => Pool;
  scanSchedulerFactory?: (options: ScanSchedulerOptions) => ScanScheduler;
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
  const repositories = pool ? createPgRepositories(pool) : createInMemoryRepositories(room, session);
  const assetRepository = repositories.assets;
  const assetGateway = new AssetGateway({
    assetRepository,
    mediaPathResolver: new MediaPathResolver({ mediaRoot: resolvedConfig.mediaRoot }),
    publicBaseUrl: resolvedConfig.publicBaseUrl
  });
  const broadcaster = new RoomSnapshotBroadcaster();
  const ingest =
    pool && resolvedConfig.mediaRoot
      ? createRuntimeIngest({
          config: resolvedConfig,
          pool,
          scanSchedulerFactory: options.scanSchedulerFactory ?? createScanScheduler
        })
      : null;
  const scheduler = ingest?.scheduler ?? null;

  if (scheduler) {
    await scheduler.start();
  }

  if (pool) {
    server.addHook("onClose", async () => {
      await scheduler?.close();
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
  await registerMediaRoutes(server, { assetGateway });
  if (ingest) {
    await registerAdminImportRoutes(server, {
      importCandidates: ingest.importCandidates,
      scanScheduler: ingest.scheduler,
      admissionService: ingest.admissionService
    });
    await registerAdminCatalogRoutes(server, {
      songs: ingest.catalogSongs,
      admissionService: ingest.admissionService,
      songsRoot: ingest.paths.songsRoot
    });
  }
  await registerAdminRoomsRoutes(server, {
    config: resolvedConfig,
    rooms: repositories.rooms,
    pairingTokens: repositories.pairingTokens,
    playbackSessions: repositories.playbackSessions,
    queueEntries: repositories.queueEntries,
    assets: repositories.assets,
    songs: repositories.songs,
    controlSessions: repositories.controlSessions,
    deviceSessions: repositories.deviceSessions,
    assetGateway
  });
  await registerRoomSnapshotRoutes(server, {
    config: resolvedConfig,
    repositories,
    assetGateway
  });
  await registerControlSessionRoutes(server, {
    config: resolvedConfig,
    repositories,
    assetGateway
  });
  await registerRealtimeRoutes(server, {
    config: resolvedConfig,
    repositories,
    assetGateway,
    broadcaster
  });
  await registerPlayerRoutes(server, {
    config: resolvedConfig,
    repositories,
    assetGateway,
    broadcaster
  });
  await registerAvailableSongsRoutes(server, {
    rooms: repositories.rooms,
    songs: repositories.songs,
    assets: repositories.assets,
    assetGateway
  });
  await registerSongSearchRoutes(server, {
    rooms: repositories.rooms,
    songs: repositories.songs,
    queueEntries: repositories.queueEntries
  });
  await registerControlCommandRoutes(server, {
    config: resolvedConfig,
    repositories,
    assetGateway,
    broadcaster
  });

  return server;
}

function createPgPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

type RuntimeRepositories = PlayerRouteRepositories & {
  songs: SongRepository & AdminCatalogSongRepository;
  controlSessions: ControlSessionRepository;
  controlCommands: RoomSessionCommandRepository;
};

function createPgRepositories(pool: Pool): RuntimeRepositories {
  const playbackSessions = new PgPlaybackSessionRepository(pool);

  return {
    rooms: new PgRoomRepository(pool),
    playbackSessions,
    queueEntries: new PgQueueEntryRepository(pool),
    assets: new PgAssetRepository(pool),
    songs: new PgSongRepository(pool),
    pairingTokens: new PgRoomPairingTokenRepository(pool),
    controlSessions: new PgControlSessionRepository(pool),
    controlCommands: new PgRoomSessionCommandRepository(pool),
    deviceSessions: new PgPlayerDeviceSessionRepository(pool),
    playbackEvents: new PgPlaybackEventRepository(pool)
  };
}

function createRuntimeIngest(input: {
  config: ApiConfig;
  pool: Pool;
  scanSchedulerFactory: (options: ScanSchedulerOptions) => ScanScheduler;
}): {
  scheduler: ScanScheduler;
  importCandidates: PgImportCandidateRepository;
  catalogSongs: PgSongRepository;
  paths: ReturnType<typeof resolveLibraryPaths>;
  admissionService: CatalogAdmissionService;
} {
  const paths = resolveLibraryPaths(input.config.mediaRoot);
  const importCandidates = new PgImportCandidateRepository(input.pool);
  const importFiles = new PgImportFileRepository(input.pool);
  const catalogSongs = new PgSongRepository(input.pool);
  const catalogAssets = new PgAssetRepository(input.pool);
  const candidateBuilder = new CandidateBuilder({ importCandidates });
  const scanner = new ImportScanner({
    paths,
    importFiles,
    scanRuns: new PgScanRunRepository(input.pool),
    candidateBuilder
  });
  const admissionService = new CatalogAdmissionService({
    paths,
    importCandidates,
    importFiles,
    catalogWriter: new PgCatalogAdmissionWriter(input.pool),
    formalSongs: catalogSongs,
    formalAssets: catalogAssets
  });

  return {
    admissionService,
    catalogSongs,
    paths,
    importCandidates,
    scheduler: input.scanSchedulerFactory({
      scanner,
      paths,
      scanIntervalMinutes: input.config.scanIntervalMinutes
    })
  };
}

function createInMemoryRepositories(room: Room, session: PlaybackSession): RuntimeRepositories {
  return new InMemoryRuntimeRepositories(room, session);
}

class InMemoryRuntimeRepositories implements RuntimeRepositories {
  readonly rooms: RoomRepository = {
    findById: async (roomId) => (roomId === this.room.id ? this.room : null),
    findBySlug: async (slug) => (slug === this.room.slug ? this.room : null)
  };

  readonly assets: AssetRepository = {
    findById: async () => null,
    findVerifiedSwitchCounterparts: async () => []
  };

  readonly songs: SongRepository & AdminCatalogSongRepository = {
    findById: async () => null,
    listFormalSongs: async () => [],
    getFormalSongWithAssets: async () => null,
    searchFormalSongs: async () => [],
    updateSongMetadata: async () => null,
    updateDefaultAsset: async () => null,
    updateSongStatus: async () => null
  };

  readonly pairingTokens = new InMemoryRoomPairingTokenRepository();
  readonly controlSessions = new InMemoryControlSessionRepository();
  readonly controlCommands = new InMemoryRoomSessionCommandRepository();

  readonly queueEntries = new InMemoryQueueEntryRepository();

  readonly deviceSessions: PlayerDeviceSessionRepository = {
    findActiveTvPlayer: async (roomId, activeAfter) => this.findActiveTvPlayer(roomId, activeAfter),
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

  constructor(
    private readonly room: Room,
    private session: PlaybackSession
  ) {}

  async findByRoomId(roomId: string): Promise<PlaybackSession | null> {
    return roomId === this.room.id ? this.session : null;
  }

  async findActiveTvPlayer(roomId: string, activeAfter: Date): Promise<DeviceSession | null> {
    const active = Array.from(this.devices.values())
      .filter(
        (device) =>
          device.roomId === roomId &&
          device.deviceType === "tv" &&
          Boolean(device.lastSeenAt) &&
          new Date(device.lastSeenAt ?? 0).getTime() >= activeAfter.getTime()
      )
      .sort((a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime());

    return active[0] ?? null;
  }

  async upsertTvPlayer(input: Parameters<PlayerDeviceSessionRepository["upsertTvPlayer"]>[0]): Promise<DeviceSession> {
    const nowIso = input.now.toISOString();
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
