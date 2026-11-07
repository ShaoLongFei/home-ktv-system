import type {
  AssetId,
  CompatibilityReason,
  CompatibilityStatus,
  MediaInfoProvenance,
  MediaInfoSummary,
  MediaSourceRef,
  PlaybackProfile,
  SongId,
  SongSourceType,
  TrackRoles
} from "@home-ktv/domain";

export type PlayableMediaStatus = "ready" | "unavailable" | "failed" | "stale";

export type PlayableMediaLookup = Pick<MediaSourceRef, "sourceType" | "assetId"> & {
  /** 同一首歌的派生音轨文件（如在线补歌抽出的伴奏轨）。 */
  variant?: "instrumental";
};

export interface PlayableMediaVariantPaths {
  instrumental?: string;
}

export interface PlayableMediaAsset {
  sourceType: SongSourceType;
  songId: SongId;
  assetId: AssetId;
  title: string;
  artistName: string;
  displayName: string;
  filePath: string;
  status: PlayableMediaStatus;
  durationMs: number;
  compatibilityStatus: CompatibilityStatus;
  compatibilityReasons: readonly CompatibilityReason[];
  mediaInfoSummary: MediaInfoSummary;
  mediaInfoProvenance: MediaInfoProvenance;
  trackRoles: TrackRoles;
  playbackProfile: PlaybackProfile;
  variantFilePaths?: PlayableMediaVariantPaths;
}

export interface PlayableMediaRepository {
  findPlayableBySource(source: PlayableMediaLookup): Promise<PlayableMediaAsset | null>;
}
