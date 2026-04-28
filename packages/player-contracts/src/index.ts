import type { AssetId, QueueEntryId, RoomId, SwitchFamily, VocalMode } from "@home-ktv/domain";
import type { PlayerTelemetryEventName } from "@home-ktv/protocol";

export interface QueueEntryPreview {
  queueEntryId: QueueEntryId;
  songTitle: string;
  artistName: string;
}

export interface PlaybackTarget {
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  assetId: AssetId;
  playbackUrl: string;
  resumePositionMs: number;
  vocalMode: VocalMode;
  switchFamily: SwitchFamily | null;
  nextQueueEntryPreview: QueueEntryPreview | null;
}

export interface SwitchTarget {
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  fromAssetId: AssetId;
  toAssetId: AssetId;
  playbackUrl: string;
  switchFamily: SwitchFamily;
  vocalMode: VocalMode;
  resumePositionMs: number;
  rollbackAssetId: AssetId;
}

export interface PlayerTelemetryEvent {
  type: PlayerTelemetryEventName;
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  assetId: AssetId;
  switchFamily: SwitchFamily | null;
  vocalMode: VocalMode;
  resumePositionMs: number;
  rollbackAssetId: AssetId | null;
  playbackPositionMs: number;
  emittedAt: string;
}
