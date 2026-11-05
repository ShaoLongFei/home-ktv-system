import type { RoomControlSnapshot, RoomInteractionEnvelope, RoomInteractionEvent } from "@home-ktv/player-contracts";

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
    this.broadcast(roomSlug, JSON.stringify(toSnapshotEnvelope(snapshot)));
  }

  broadcastRoomInteraction(roomSlug: string, interaction: RoomInteractionEvent): void {
    this.broadcast(roomSlug, JSON.stringify(toInteractionEnvelope(interaction)));
  }

  /**
   * 让电视立刻上报一次播放位置。
   * 手机打开「同步画面」时用：心跳默认 10 秒一次，等下一次心跳太久，
   * 主动要一次才能对齐到当前进度。
   */
  broadcastPlayerPositionRequest(roomSlug: string): void {
    this.broadcast(
      roomSlug,
      JSON.stringify({
        type: "room.player.position.requested",
        roomId: roomSlug,
        timestamp: new Date().toISOString()
      })
    );
  }

  private broadcast(roomSlug: string, message: string): void {
    const subscribers = this.subscribers.get(roomSlug);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const connection of [...subscribers]) {
      try {
        connection.send(message);
      } catch {
        this.unsubscribe(roomSlug, connection);
      }
    }
  }
}

function toSnapshotEnvelope(snapshot: RoomControlSnapshot): RoomSnapshotEnvelope {
  return {
    type: "room.control.snapshot.updated",
    roomId: snapshot.roomId,
    version: snapshot.sessionVersion,
    timestamp: snapshot.generatedAt,
    payload: snapshot
  };
}

function toInteractionEnvelope(interaction: RoomInteractionEvent): RoomInteractionEnvelope {
  return {
    type: "room.interaction.created",
    roomId: interaction.roomId,
    version: new Date(interaction.createdAt).getTime(),
    timestamp: interaction.createdAt,
    payload: interaction
  };
}
