import type { AssetGateway } from "../assets/asset-gateway.js";
import type { ApiConfig } from "../../config.js";
import type { RoomRepository } from "./repositories/room-repository.js";
import type { PlaybackSessionRepository } from "../playback/repositories/playback-session-repository.js";
import type { QueueEntryRepository } from "../playback/repositories/queue-entry-repository.js";
import type { AssetRepository } from "../catalog/repositories/asset-repository.js";
import type { SongRepository } from "../catalog/repositories/song-repository.js";
import type { RoomPairingTokenRepository } from "./repositories/pairing-token-repository.js";
import type { ControlSessionRepository } from "../controller/repositories/control-session-repository.js";
import { buildRoomSnapshot } from "../../routes/room-snapshots.js";
import type { RoomControlSnapshot } from "@home-ktv/player-contracts";

export interface ControlSnapshotRepositories {
  rooms: RoomRepository;
  playbackSessions: PlaybackSessionRepository;
  queueEntries: QueueEntryRepository;
  assets: AssetRepository;
  songs: SongRepository;
  pairingTokens: RoomPairingTokenRepository;
  controlSessions: ControlSessionRepository;
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

  const onlineCount = await input.repositories.controlSessions.countActiveByRoom(
    room.id,
    new Date(now.getTime() - 60 * 1000)
  );
  return {
    type: "room.control.snapshot",
    roomId: baseSnapshot.roomId,
    roomSlug: baseSnapshot.roomSlug,
    sessionVersion: baseSnapshot.sessionVersion,
    state: baseSnapshot.state,
    pairing: baseSnapshot.pairing,
    tvPresence: baseSnapshot.currentTarget
      ? { online: true, deviceName: null, lastSeenAt: now.toISOString(), conflict: null }
      : { online: false, deviceName: null, lastSeenAt: null, conflict: null },
    controllers: { onlineCount },
    currentTarget: baseSnapshot.currentTarget,
    switchTarget: baseSnapshot.switchTarget,
    queue: [],
    notice: baseSnapshot.notice,
    generatedAt: baseSnapshot.generatedAt
  };
}
