import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssetKind,
  AssetStatus,
  CompatibilityReason,
  CompatibilityStatus,
  Language,
  LyricMode,
  MediaInfoProvenance,
  MediaInfoSummary,
  PlaybackProfile,
  SongStatus,
  SwitchQualityStatus,
  TrackRoles,
  VocalMode
} from "@home-ktv/domain";

export interface SongJsonAsset {
  id?: string;
  filePath: string;
  vocalMode: VocalMode;
  assetKind?: AssetKind;
  lyricMode?: LyricMode;
  status?: AssetStatus;
  durationMs: number;
  switchFamily: string | null;
  switchQualityStatus?: SwitchQualityStatus;
  displayName?: string;
  compatibilityStatus?: CompatibilityStatus;
  compatibilityReasons?: readonly CompatibilityReason[];
  mediaInfoSummary?: MediaInfoSummary | null;
  mediaInfoProvenance?: MediaInfoProvenance | null;
  trackRoles?: TrackRoles;
  playbackProfile?: PlaybackProfile;
  container?: string | null;
  videoCodec?: string | null;
  audioCodecs?: readonly string[];
}

export interface SongJsonDocument {
  title: string;
  artistName: string;
  language: Language;
  status?: SongStatus;
  coverPath?: string | null;
  defaultAssetId?: string | null;
  defaultAssetPath?: string | null;
  defaultVocalMode?: VocalMode;
  sameVersionConfirmed?: boolean;
  genre?: string[];
  tags?: string[];
  aliases?: string[];
  searchHints?: string[];
  releaseYear?: number | null;
  source?: Record<string, unknown>;
  assets: SongJsonAsset[];
}

export async function readSongJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export async function writeSongJson(targetDirectory: string, document: SongJsonDocument): Promise<void> {
  await mkdir(targetDirectory, { recursive: true });
  const targetPath = path.join(targetDirectory, "song.json");
  const tempPath = path.join(targetDirectory, `.song.json.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(tempPath, targetPath);
}
