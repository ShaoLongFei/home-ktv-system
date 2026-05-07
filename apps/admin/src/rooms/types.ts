export interface RoomQueueEntryPreview {
  queueEntryId: string;
  songId?: string;
  assetId?: string;
  songTitle: string;
  artistName: string;
  requestedBy?: string;
  queuePosition?: number;
  status?: string;
  canPromote?: boolean;
  canDelete?: boolean;
  undoExpiresAt?: string | null;
}

export interface TvPresence {
  online: boolean;
  deviceName: string | null;
  lastSeenAt: string | null;
  conflict: {
    kind: string;
    reason: string;
    roomId: string;
    activeDeviceId: string;
    activeDeviceName: string;
    message: string;
  } | null;
}

export interface RoomStatusResponse {
  room: {
    roomId: string;
    roomSlug: string;
    status: string;
  };
  pairing: {
    tokenExpiresAt: string;
    controllerUrl: string;
    qrPayload: string;
  };
  tvPresence: TvPresence;
  controllers: {
    onlineCount: number;
  };
  sessionVersion: number;
  current: {
    queueEntryId: string;
    songTitle: string;
    artistName: string;
    vocalMode: string;
  } | null;
  queue: RoomQueueEntryPreview[];
}

export interface RoomStatusRefreshResponse {
  pairing: RoomStatusResponse["pairing"] & {
    token?: string;
    tokenValue?: string;
  };
}

export interface RoomControlSnapshotMessage {
  type: "room.control.snapshot.updated";
  payload: RoomControlSnapshotPayload;
}

export interface RoomControlSnapshotPayload {
  roomId: string;
  roomSlug: string;
  sessionVersion: number;
  pairing: RoomStatusResponse["pairing"] & {
    token?: string;
  };
  tvPresence: TvPresence;
  controllers: RoomStatusResponse["controllers"];
  currentTarget: {
    queueEntryId: string;
    currentQueueEntryPreview: {
      songTitle: string;
      artistName: string;
    };
    vocalMode: string;
  } | null;
  queue: readonly RoomQueueEntryPreview[];
}
