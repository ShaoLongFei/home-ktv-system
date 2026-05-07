import type { FastifyInstance } from "fastify";
import type { ApiConfig } from "../config.js";
import { buildRoomControlSnapshot } from "../modules/rooms/build-control-snapshot.js";
import { getOrCreatePairingInfo, refreshPairingToken } from "../modules/rooms/pairing-token-service.js";
import type { AssetGateway } from "../modules/assets/asset-gateway.js";
import type { AssetRepository } from "../modules/catalog/repositories/asset-repository.js";
import type { SongRepository } from "../modules/catalog/repositories/song-repository.js";
import type { ControlSessionRepository } from "../modules/controller/repositories/control-session-repository.js";
import type { PlaybackSessionRepository } from "../modules/playback/repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { QueueEntryStatus } from "@home-ktv/domain";
import type { RoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";
import type { PlayerDeviceSessionRepository } from "../modules/player/register-player.js";

export interface AdminRoomsRouteDependencies {
  config: ApiConfig;
  rooms: RoomRepository;
  pairingTokens: RoomPairingTokenRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
  songs: SongRepository;
  controlSessions: ControlSessionRepository;
  assetGateway: AssetGateway;
  deviceSessions: PlayerDeviceSessionRepository;
}

export async function registerAdminRoomsRoutes(
  server: FastifyInstance,
  dependencies: AdminRoomsRouteDependencies
): Promise<void> {
  server.get<{ Params: { roomSlug: string } }>("/admin/rooms/:roomSlug", async (request, reply) => {
    const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
    if (!room) {
      return reply.code(404).send({ error: "ROOM_NOT_FOUND" });
    }

    const snapshot = await buildRoomControlSnapshot({
      roomSlug: room.slug,
      config: dependencies.config,
      repositories: {
        rooms: dependencies.rooms,
        playbackSessions: dependencies.playbackSessions,
        queueEntries: dependencies.queueEntries,
        assets: dependencies.assets,
        songs: dependencies.songs,
        pairingTokens: dependencies.pairingTokens,
        controlSessions: dependencies.controlSessions,
        deviceSessions: dependencies.deviceSessions
      },
      assetGateway: dependencies.assetGateway
    });

    if (snapshot) {
      return toRoomStatusResponse(room, snapshot);
    }

    return toRoomStatusResponse(room, await buildFallbackRoomStatus(request.params.roomSlug, room, dependencies));
  });

  server.post<{ Params: { roomSlug: string } }>("/admin/rooms/:roomSlug/pairing-token/refresh", async (request, reply) => {
    const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
    if (!room) {
      return reply.code(404).send({ error: "ROOM_NOT_FOUND" });
    }

    const pairing = await refreshPairingToken({
      room,
      publicBaseUrl: dependencies.config.publicBaseUrl,
      repository: dependencies.pairingTokens,
      ...(dependencies.config.controllerBaseUrl ? { controllerBaseUrl: dependencies.config.controllerBaseUrl } : {})
    });

    return { pairing };
  });
}

async function buildFallbackRoomStatus(
  roomSlug: string,
  room: NonNullable<Awaited<ReturnType<RoomRepository["findBySlug"]>>>,
  dependencies: AdminRoomsRouteDependencies
): Promise<any> {
  const now = new Date();
  const [pairing, session, effectiveQueue, removedQueue, onlineCount] = await Promise.all([
    getOrCreatePairingInfo({
      room,
      publicBaseUrl: dependencies.config.publicBaseUrl,
      repository: dependencies.pairingTokens,
      now,
      ...(dependencies.config.controllerBaseUrl ? { controllerBaseUrl: dependencies.config.controllerBaseUrl } : {})
    }),
    dependencies.playbackSessions.findByRoomId(room.id),
    dependencies.queueEntries.listEffectiveQueue(room.id),
    dependencies.queueEntries.listUndoableRemoved(room.id, now),
    dependencies.controlSessions.countActiveByRoom(room.id, new Date(now.getTime() - 60 * 1000))
  ]);

  const currentQueueEntry = session?.currentQueueEntryId ? await dependencies.queueEntries.findById(session.currentQueueEntryId) : null;
  const currentAsset = session?.activeAssetId ? await dependencies.assets.findById(session.activeAssetId) : null;
  const currentSong = currentQueueEntry ? await dependencies.songs.findById(currentQueueEntry.songId) : null;
  const queue = await buildQueuePreview({
    currentQueueEntryId: currentQueueEntry?.id ?? null,
    queue: [...effectiveQueue, ...removedQueue],
    songs: dependencies.songs
  });

  return {
    type: "room.control.snapshot",
    roomId: room.id,
    roomSlug,
    sessionVersion: session?.version ?? 0,
    state: currentQueueEntry && currentAsset?.status === "ready" ? "playing" : room.status === "active" ? "idle" : "error",
    pairing,
    tvPresence: {
      online: Boolean(currentQueueEntry && currentAsset?.status === "ready"),
      deviceName: null,
      lastSeenAt: currentQueueEntry && currentAsset?.status === "ready" ? now.toISOString() : null,
      conflict: null
    },
    controllers: { onlineCount },
    currentTarget:
      currentQueueEntry && currentAsset?.status === "ready" && currentSong
        ? {
            roomId: room.id,
            sessionVersion: session?.version ?? 0,
            queueEntryId: currentQueueEntry.id,
            assetId: currentAsset.id,
            currentQueueEntryPreview: {
              queueEntryId: currentQueueEntry.id,
              songTitle: currentSong.title,
              artistName: currentSong.artistName
            },
            playbackUrl: dependencies.assetGateway.createPlaybackUrl(currentAsset.id),
            resumePositionMs: session?.playerPositionMs ?? 0,
            vocalMode: currentAsset.vocalMode,
            switchFamily: currentAsset.switchFamily,
            nextQueueEntryPreview: null
          }
        : null,
    switchTarget: null,
    queue,
    notice: null,
    generatedAt: now.toISOString()
  };
}

function toRoomStatusResponse(
  room: NonNullable<Awaited<ReturnType<RoomRepository["findBySlug"]>>>,
  snapshot: Awaited<ReturnType<typeof buildFallbackRoomStatus>>
) {
  return {
    room: { roomId: room.id, roomSlug: room.slug, status: room.status },
    pairing: {
      tokenExpiresAt: snapshot.pairing.tokenExpiresAt,
      controllerUrl: snapshot.pairing.controllerUrl,
      qrPayload: snapshot.pairing.qrPayload
    },
    tvPresence: snapshot.tvPresence,
    controllers: snapshot.controllers,
    sessionVersion: snapshot.sessionVersion,
    current: snapshot.currentTarget
      ? {
          queueEntryId: snapshot.currentTarget.queueEntryId,
          songTitle: snapshot.currentTarget.currentQueueEntryPreview.songTitle,
          artistName: snapshot.currentTarget.currentQueueEntryPreview.artistName,
          vocalMode: snapshot.currentTarget.vocalMode
        }
      : null,
    queue: snapshot.queue
  };
}

async function buildQueuePreview(input: {
  currentQueueEntryId: string | null;
  queue: readonly { id: string; songId: string; assetId: string; requestedBy: string; queuePosition: number; status: string; undoExpiresAt: string | null; removedAt: string | null; }[];
  songs: SongRepository;
}) {
  const previews: Array<{
    queueEntryId: string;
    songId: string;
    assetId: string;
    songTitle: string;
    artistName: string;
    requestedBy: string;
    queuePosition: number;
    status: QueueEntryStatus;
    canPromote: boolean;
    canDelete: boolean;
    undoExpiresAt: string | null;
  }> = [];
  for (const entry of input.queue) {
    const song = await input.songs.findById(entry.songId);
    if (!song) {
      continue;
    }

    previews.push({
      queueEntryId: entry.id,
      songId: entry.songId,
      assetId: entry.assetId,
      songTitle: song.title,
      artistName: song.artistName,
      requestedBy: entry.requestedBy,
      queuePosition: entry.queuePosition,
      status: entry.status as QueueEntryStatus,
      canPromote: entry.status === "queued" && entry.id !== input.currentQueueEntryId,
      canDelete: entry.status === "queued" && entry.id !== input.currentQueueEntryId,
      undoExpiresAt: entry.undoExpiresAt
    });
  }

  return previews;
}
