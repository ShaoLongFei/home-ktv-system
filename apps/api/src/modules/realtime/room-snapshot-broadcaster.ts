import type { RoomControlSnapshot } from "@home-ktv/player-contracts";

export interface RoomSnapshotConnection {
  send(message: string): void;
  on(event: "close", listener: (...args: unknown[]) => void): unknown;
  close(code?: number, reason?: string): void;
}

interface RoomSnapshotEnvelope {
  type: "room.control.snapshot.updated";
  roomId: string;
  version: number;
  timestamp: string;
  payload: RoomControlSnapshot;
}

export class RoomSnapshotBroadcaster {
  private readonly subscribers = new Map<string, Set<RoomSnapshotConnection>>();

  subscribe(roomSlug: string, connection: RoomSnapshotConnection): void {
    const subscribers = this.subscribers.get(roomSlug) ?? new Set<RoomSnapshotConnection>();
    subscribers.add(connection);
    this.subscribers.set(roomSlug, subscribers);
  }

  unsubscribe(roomSlug: string, connection: RoomSnapshotConnection): void {
    const subscribers = this.subscribers.get(roomSlug);
    if (!subscribers) {
      return;
    }

    subscribers.delete(connection);
    if (subscribers.size === 0) {
      this.subscribers.delete(roomSlug);
    }
  }

  broadcastRoomSnapshot(roomSlug: string, snapshot: RoomControlSnapshot): void {
    const subscribers = this.subscribers.get(roomSlug);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify(toEnvelope(snapshot));
    for (const connection of [...subscribers]) {
      try {
        connection.send(message);
      } catch {
        this.unsubscribe(roomSlug, connection);
      }
    }
  }
}

function toEnvelope(snapshot: RoomControlSnapshot): RoomSnapshotEnvelope {
  return {
    type: "room.control.snapshot.updated",
    roomId: snapshot.roomId,
    version: snapshot.sessionVersion,
    timestamp: snapshot.generatedAt,
    payload: snapshot
  };
}
