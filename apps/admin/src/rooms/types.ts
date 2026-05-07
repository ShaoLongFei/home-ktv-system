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
  recentEvents: RoomRecentPlaybackEvent[];
  onlineTasks: RoomOnlineTaskSummary;
}

export interface RoomRecentPlaybackEvent {
  id: string;
  roomId: string;
  queueEntryId: string | null;
  eventType: string;
  eventPayload: Record<string, unknown>;
  createdAt: string;
}

export interface RoomOnlineTaskSummary {
  counts: Record<string, number>;
  tasks: RoomOnlineTaskSummaryRow[];
}

export interface RoomOnlineTaskSummaryRow {
  taskId: string;
  roomId: string;
  provider: string;
  providerCandidateId: string;
  title: string;
  artistName: string;
  sourceLabel: string;
  durationMs: number | null;
  candidateType: string;
  reliabilityLabel: string;
  riskLabel: string;
  status: string;
  failureReason: string | null;
  recentEvent: Record<string, unknown>;
  recentEventAt: string | null;
  readyAssetId: string | null;
  createdAt: string;
  updatedAt: string;
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
