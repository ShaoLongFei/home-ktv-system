import type { PlaybackSession, PlayerState, QueueEntryId, Room } from "@home-ktv/domain";
import type { PlayerConflictState } from "@home-ktv/player-contracts";
import { detectPlayerConflict } from "./conflict-service.js";
import type { PlayerDeviceSessionRepository } from "./register-player.js";

export interface HeartbeatPlaybackSessionRepository {
  updatePlayerPosition(input: {
    roomId: string;
    currentQueueEntryId: QueueEntryId | null;
    playerPositionMs: number;
    playerState?: PlayerState;
  }): Promise<PlaybackSession | null>;
}

export interface RecordHeartbeatInput {
  room: Room;
  deviceId: string;
  currentQueueEntryId: QueueEntryId | null;
  playbackPositionMs: number;
  health: "ok" | "degraded" | "blocked";
  deviceRepository: PlayerDeviceSessionRepository;
  playbackSessions: HeartbeatPlaybackSessionRepository;
  now?: Date;
}

export type RecordHeartbeatResult =
  | { status: "ok"; conflict: null; session: PlaybackSession | null }
  | { status: "conflict"; conflict: PlayerConflictState; session: null };

export async function recordHeartbeat(input: RecordHeartbeatInput): Promise<RecordHeartbeatResult> {
  const now = input.now ?? new Date();
  const conflict = await detectPlayerConflict({
    roomId: input.room.id,
    deviceId: input.deviceId,
    repository: input.deviceRepository,
    now
  });

  if (conflict) {
    return { status: "conflict", conflict, session: null };
  }

  await input.deviceRepository.updateTvHeartbeat({
    roomId: input.room.id,
    deviceId: input.deviceId,
    now
  });

  const updateInput: Parameters<HeartbeatPlaybackSessionRepository["updatePlayerPosition"]>[0] = {
    roomId: input.room.id,
    currentQueueEntryId: input.currentQueueEntryId,
    playerPositionMs: Math.max(0, Math.trunc(input.playbackPositionMs))
  };

  if (input.health === "blocked") {
    updateInput.playerState = "error";
  }

  const session = await input.playbackSessions.updatePlayerPosition(updateInput);

  return {
    status: "ok",
    conflict: null,
    session
  };
}
