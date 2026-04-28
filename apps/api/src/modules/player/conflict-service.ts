import type { DeviceSession, RoomId } from "@home-ktv/domain";
import type { PlayerConflictState } from "@home-ktv/player-contracts";

export const ACTIVE_TV_PLAYER_WINDOW_MS = 30_000;

export interface ActiveTvPlayerRepository {
  findActiveTvPlayer(roomId: RoomId, activeAfter: Date): Promise<DeviceSession | null>;
}

export interface DetectPlayerConflictInput {
  roomId: RoomId;
  deviceId: string;
  repository: ActiveTvPlayerRepository;
  now?: Date;
  activeWindowMs?: number;
}

export async function detectPlayerConflict(input: DetectPlayerConflictInput): Promise<PlayerConflictState | null> {
  const now = input.now ?? new Date();
  const activeAfter = new Date(now.getTime() - (input.activeWindowMs ?? ACTIVE_TV_PLAYER_WINDOW_MS));
  const activePlayer = await input.repository.findActiveTvPlayer(input.roomId, activeAfter);

  if (!activePlayer || activePlayer.id === input.deviceId) {
    return null;
  }

  return createPlayerConflictState(input.roomId, activePlayer);
}

export function createPlayerConflictState(roomId: RoomId, activePlayer: DeviceSession): PlayerConflictState {
  return {
    kind: "active-player-conflict",
    reason: "active-player-exists",
    roomId,
    activeDeviceId: activePlayer.id,
    activeDeviceName: activePlayer.deviceName,
    message: "This room already has an active TV player. This screen will stay disconnected instead of taking over."
  };
}
