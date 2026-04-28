import type { AssetId, LyricMode, QueueEntryId, RoomId, SwitchFamily, VocalMode } from "@home-ktv/domain";
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
  switchFamily: SwitchFamily | null;
  vocalMode: VocalMode;
  lyricMode: LyricMode;
  resumePositionMs: number;
  rollbackAssetId: AssetId | null;
  shouldAutoPlay: boolean;
  nextQueueEntryPreview: QueueEntryPreview | null;
}

export interface SwitchTarget {
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  assetId: AssetId;
  fromAssetId: AssetId;
  toAssetId: AssetId;
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
