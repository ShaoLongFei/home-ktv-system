import type { AssetGateway } from "../assets/asset-gateway.js";
import type { ApiConfig } from "../../config.js";
import type { RoomRepository } from "./repositories/room-repository.js";
import type { PlaybackSessionRepository } from "../playback/repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "../playback/repositories/queue-entry-repository.js";
import type { AssetRepository } from "../catalog/repositories/asset-repository.js";
import type { SongRepository } from "../catalog/repositories/song-repository.js";
import type { RoomPairingTokenRepository } from "./repositories/pairing-token-repository.js";
import type { ControlSessionRepository } from "../controller/repositories/control-session-repository.js";
import type { PlayerDeviceSessionRepository } from "../player/register-player.js";
import { ACTIVE_TV_PLAYER_WINDOW_MS } from "../player/conflict-service.js";
import { buildRoomSnapshot } from "../../routes/room-snapshots.js";
import type { QueueEntry, Song } from "@home-ktv/domain";
import type { RoomControlSnapshot, RoomQueueEntryPreview } from "@home-ktv/player-contracts";

export interface ControlSnapshotRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
  songs: SongRepository;
  pairingTokens: RoomPairingTokenRepository;
  controlSessions: ControlSessionRepository;
  deviceSessions: PlayerDeviceSessionRepository;
}

export interface BuildRoomControlSnapshotInput {
  roomSlug: string;
  config: ApiConfig;
  repositories: ControlSnapshotRepositories;
  assetGateway: AssetGateway;
  now?: Date;
}

export async function buildRoomControlSnapshot(input: BuildRoomControlSnapshotInput): Promise<RoomControlSnapshot | null> {
  const now = input.now ?? new Date();
  const baseSnapshot = await buildRoomSnapshot({
    roomSlug: input.roomSlug,
    config: input.config,
    repositories: input.repositories,
    assetGateway: input.assetGateway,
    now
  });
  if (!baseSnapshot) {
    return null;
  }

  const room = await input.repositories.rooms.findBySlug(input.roomSlug);
  if (!room) {
    return null;
  }

  const [session, queue, removedQueue] = await Promise.all([
    input.repositories.playbackSessions.findByRoomId(room.id),
    input.repositories.queueEntries.listEffectiveQueue(room.id),
    input.repositories.queueEntries.listUndoableRemoved(room.id, now)
  ]);
  const activeTvPlayer = await input.repositories.deviceSessions.findActiveTvPlayer(
    room.id,
    new Date(now.getTime() - ACTIVE_TV_PLAYER_WINDOW_MS)
  );

  const onlineCount = await input.repositories.controlSessions.countActiveByRoom(
    room.id,
    new Date(now.getTime() - 60 * 1000)
  );
  const queuePreview = await buildQueuePreview({
    currentQueueEntryId: session?.currentQueueEntryId ?? null,
    queue: [...queue, ...removedQueue],
    repositories: input.repositories,
    removedQueueIds: new Set(removedQueue.map((entry) => entry.id))
  });
  return {
    type: "room.control.snapshot",
    roomId: baseSnapshot.roomId,
    roomSlug: baseSnapshot.roomSlug,
    sessionVersion: session?.version ?? baseSnapshot.sessionVersion,
    state: baseSnapshot.state,
    pairing: baseSnapshot.pairing,
    tvPresence: activeTvPlayer
      ? {
          online: true,
          deviceName: activeTvPlayer.deviceName,
          lastSeenAt: activeTvPlayer.lastSeenAt,
          conflict: null
        }
      : { online: false, deviceName: null, lastSeenAt: null, conflict: null },
    controllers: { onlineCount },
    currentTarget: baseSnapshot.currentTarget,
    switchTarget: baseSnapshot.switchTarget,
    targetVocalMode: baseSnapshot.targetVocalMode ?? null,
    queue: queuePreview,
    notice: baseSnapshot.notice,
    generatedAt: baseSnapshot.generatedAt
  };
}

async function buildQueuePreview(input: {
  currentQueueEntryId: string | null;
  queue: readonly QueueEntry[];
  repositories: ControlSnapshotRepositories;
  removedQueueIds: Set<string>;
}): Promise<RoomQueueEntryPreview[]> {
  const previews: RoomQueueEntryPreview[] = [];

  for (const queueEntry of input.queue) {
    const song = await input.repositories.songs.findById(queueEntry.songId);
    if (!song) {
      continue;
    }

    previews.push(queueEntryPreview(queueEntry, song, input.currentQueueEntryId, input.removedQueueIds.has(queueEntry.id)));
  }

  return previews;
}

function queueEntryPreview(
  queueEntry: QueueEntry,
  song: Song,
  currentQueueEntryId: string | null,
  removed: boolean
): RoomQueueEntryPreview {
  const isCurrent = currentQueueEntryId === queueEntry.id;
  const canDelete = !removed && !isCurrent && queueEntry.status === "queued";
  const canPromote = !removed && !isCurrent && (queueEntry.status === "queued" || queueEntry.status === "preparing" || queueEntry.status === "loading");

  return {
    queueEntryId: queueEntry.id,
    songId: queueEntry.songId,
    assetId: queueEntry.assetId,
    songTitle: song.title,
    artistName: song.artistName,
    requestedBy: queueEntry.requestedBy,
    queuePosition: queueEntry.queuePosition,
    status: removed ? "removed" : queueEntry.status,
    canPromote: removed ? false : canPromote,
    canDelete: removed ? false : canDelete,
    undoExpiresAt: removed ? queueEntry.undoExpiresAt : null
  };
}
