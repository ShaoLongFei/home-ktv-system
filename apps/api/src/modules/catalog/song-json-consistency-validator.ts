import { access } from "node:fs/promises";
import path from "node:path";
import type {
  Asset,
  AssetStatus,
  Language,
  LyricMode,
  Song,
  SongStatus,
  SwitchQualityStatus,
  VocalMode
} from "@home-ktv/domain";
import { readSongJson } from "./song-json.js";

export type SongJsonConsistencyStatus = "passed" | "review_required" | "failed";
export type SongJsonConsistencySeverity = "warning" | "error";

export interface SongJsonConsistencyIssue {
  code: string;
  severity: SongJsonConsistencySeverity;
  message: string;
  assetId?: string;
  path?: string;
  reason?: string;
}

export interface ValidateSongJsonConsistencyInput {
  songsRoot: string;
  song: Song;
  assets: Asset[];
}

export interface SongJsonConsistencyResult {
  status: SongJsonConsistencyStatus;
  songId: string;
  songJsonPath: string;
  issues: SongJsonConsistencyIssue[];
}

interface FormalSongJsonAsset {
  id?: string;
  filePath?: string;
  vocalMode?: VocalMode;
  lyricMode?: LyricMode;
  status?: AssetStatus;
  switchFamily?: string | null;
  switchQualityStatus?: SwitchQualityStatus;
  durationMs?: number;
}

interface FormalSongJsonDocument {
  title?: string;
  artistName?: string;
  language?: Language;
  status?: SongStatus;
  defaultAssetId?: string | null;
  defaultAssetPath?: string | null;
  assets?: FormalSongJsonAsset[];
}

const songStatuses: SongStatus[] = ["ready", "review_required", "unavailable"];
const languages: Language[] = ["mandarin", "cantonese", "other"];
const assetStatuses: AssetStatus[] = ["ready", "caching", "failed", "unavailable", "stale", "promoted"];
const vocalModes: VocalMode[] = ["original", "instrumental", "dual", "unknown"];
const lyricModes: LyricMode[] = ["hard_sub", "soft_sub", "external_lrc", "none"];
const switchQualityStatuses: SwitchQualityStatus[] = ["verified", "review_required", "rejected", "unknown"];

export async function validateSongJsonConsistency(
  input: ValidateSongJsonConsistencyInput
): Promise<SongJsonConsistencyResult> {
  const songsRoot = path.resolve(input.songsRoot);
  const songDirectory = inferSongDirectory(input.song, input.assets);
  const songJsonPath = safeResolve(songsRoot, songDirectory, "song.json");
  const issues: SongJsonConsistencyIssue[] = [];

  if (!songJsonPath) {
    return {
      status: "failed",
      songId: input.song.id,
      songJsonPath: path.join(songsRoot, songDirectory, "song.json"),
      issues: [
        {
          code: "UNSAFE_SONG_JSON_PATH",
          severity: "error",
          message: "song.json path escapes the songs root",
          path: songDirectory
        }
      ]
    };
  }

  let document: FormalSongJsonDocument;
  try {
    const parsed = await readSongJson(songJsonPath);
    if (!isRecord(parsed)) {
      throw new Error("song.json must be an object");
    }
    document = parsed as FormalSongJsonDocument;
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        status: "failed",
        songId: input.song.id,
        songJsonPath,
        issues: [
          {
            code: "MISSING_SONG_JSON",
            severity: "error",
            message: "song.json is missing",
            path: path.posix.join(songDirectory, "song.json")
          }
        ]
      };
    }

    return {
      status: "failed",
      songId: input.song.id,
      songJsonPath,
      issues: [
        {
          code: "MALFORMED_SONG_JSON",
          severity: "error",
          message: error instanceof Error ? error.message : "song.json is malformed"
        }
      ]
    };
  }

  validateDocumentShape(document, issues);
  validateDocumentAgainstDatabase(document, input.song, input.assets, issues);
  await validateReferencedFiles(songsRoot, songDirectory, document.assets ?? [], issues);
  validateSwitchPair(input.assets, issues);

  return {
    status: statusFromIssues(issues),
    songId: input.song.id,
    songJsonPath,
    issues
  };
}

function validateDocumentShape(document: FormalSongJsonDocument, issues: SongJsonConsistencyIssue[]): void {
  const malformed =
    !nonEmptyString(document.title) ||
    !nonEmptyString(document.artistName) ||
    !isLanguage(document.language) ||
    (document.status !== undefined && !isSongStatus(document.status)) ||
    !Array.isArray(document.assets) ||
    document.assets.some(isMalformedJsonAsset);

  if (malformed) {
    issues.push({
      code: "MALFORMED_SONG_JSON",
      severity: "error",
      message: "song.json is missing required formal catalog fields or contains invalid enum values"
    });
  }
}

function validateDocumentAgainstDatabase(
  document: FormalSongJsonDocument,
  song: Song,
  assets: Asset[],
  issues: SongJsonConsistencyIssue[]
): void {
  if (document.status && document.status !== song.status) {
    issues.push({
      code: "SONG_STATUS_MISMATCH",
      severity: "warning",
      message: `song.json status ${document.status} does not match database status ${song.status}`
    });
  }

  if (document.defaultAssetId !== undefined && document.defaultAssetId !== song.defaultAssetId) {
    issues.push({
      code: "DEFAULT_ASSET_MISMATCH",
      severity: "error",
      message: "song.json default asset id does not match the database default asset"
    });
  }

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const jsonAsset of document.assets ?? []) {
    if (!jsonAsset.id) {
      continue;
    }

    const dbAsset = assetsById.get(jsonAsset.id);
    if (!dbAsset) {
      issues.push({
        code: "DB_ASSET_MISSING",
        severity: "error",
        message: "song.json references an asset that does not exist in the database",
        assetId: jsonAsset.id
      });
      continue;
    }

    if (jsonAsset.status && jsonAsset.status !== dbAsset.status) {
      issues.push({
        code: "ASSET_STATUS_MISMATCH",
        severity: "warning",
        message: `song.json asset status ${jsonAsset.status} does not match database status ${dbAsset.status}`,
        assetId: jsonAsset.id
      });
    }
  }
}

async function validateReferencedFiles(
  songsRoot: string,
  songDirectory: string,
  assets: FormalSongJsonAsset[],
  issues: SongJsonConsistencyIssue[]
): Promise<void> {
  for (const asset of assets) {
    if (!asset.filePath) {
      continue;
    }

    const absolutePath = resolveAssetPath(songsRoot, songDirectory, asset.filePath);
    if (!absolutePath) {
      const issue: SongJsonConsistencyIssue = {
        code: "UNSAFE_MEDIA_PATH",
        severity: "error",
        message: "song.json media path escapes the songs root",
        path: asset.filePath
      };
      if (asset.id) {
        issue.assetId = asset.id;
      }
      issues.push(issue);
      continue;
    }

    if (!(await pathExists(absolutePath))) {
      const issue: SongJsonConsistencyIssue = {
        code: "MISSING_MEDIA_FILE",
        severity: "error",
        message: "song.json references a missing media file",
        path: asset.filePath
      };
      if (asset.id) {
        issue.assetId = asset.id;
      }
      issues.push(issue);
    }
  }
}

function isMalformedJsonAsset(value: unknown): boolean {
  if (!isRecord(value)) {
    return true;
  }

  const durationMs = value.durationMs;
  return (
    !nonEmptyString(value.filePath) ||
    !isVocalMode(value.vocalMode) ||
    (value.lyricMode !== undefined && !isLyricMode(value.lyricMode)) ||
    (value.status !== undefined && !isAssetStatus(value.status)) ||
    (value.switchQualityStatus !== undefined && !isSwitchQualityStatus(value.switchQualityStatus)) ||
    (durationMs !== undefined && (typeof durationMs !== "number" || !Number.isInteger(durationMs) || durationMs < 0))
  );
}

function validateSwitchPair(assets: Asset[], issues: SongJsonConsistencyIssue[]): void {
  const readySwitchAssets = assets.filter(
    (asset) =>
      asset.status === "ready" &&
      Boolean(asset.switchFamily) &&
      (asset.vocalMode === "original" || asset.vocalMode === "instrumental")
  );
  const byFamily = new Map<string, Asset[]>();

  for (const asset of readySwitchAssets) {
    if (!asset.switchFamily) {
      continue;
    }
    byFamily.set(asset.switchFamily, [...(byFamily.get(asset.switchFamily) ?? []), asset]);
  }

  for (const familyAssets of byFamily.values()) {
    const originals = familyAssets.filter((asset) => asset.vocalMode === "original");
    const instrumentals = familyAssets.filter((asset) => asset.vocalMode === "instrumental");
    if (originals.length !== 1 || instrumentals.length !== 1) {
      continue;
    }

    const original = originals[0] as Asset;
    const instrumental = instrumentals[0] as Asset;
    if (Math.abs(original.durationMs - instrumental.durationMs) > 300) {
      issues.push({
        code: "SWITCH_PAIR_NOT_VERIFIED",
        severity: "error",
        message: "Original and instrumental durations differ by more than 300ms",
        reason: "duration-delta-over-300ms"
      });
    }
  }
}

function inferSongDirectory(song: Song, assets: Asset[]): string {
  const assetDirectory = assets.map((asset) => directoryFromAssetPath(asset.filePath)).find((directory) => directory !== null);
  return assetDirectory ?? path.posix.join(song.language, sanitizeSegment(song.artistName), sanitizeSegment(song.title));
}

function directoryFromAssetPath(filePath: string): string | null {
  const relativePath = stripSongsPrefix(filePath.replace(/\\/gu, "/"));
  const directory = path.posix.dirname(relativePath);
  return directory === "." ? null : directory;
}

function resolveAssetPath(songsRoot: string, songDirectory: string, filePath: string): string | null {
  if (path.isAbsolute(filePath)) {
    return null;
  }

  const normalized = filePath.replace(/\\/gu, "/");
  const relativePath = normalized.startsWith("songs/")
    ? stripSongsPrefix(normalized)
    : path.posix.join(songDirectory, normalized);
  return safeResolve(songsRoot, relativePath);
}

function safeResolve(root: string, ...segments: string[]): string | null {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, ...segments);
  const relativePath = path.relative(rootPath, targetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  return targetPath;
}

function stripSongsPrefix(filePath: string): string {
  return filePath.startsWith("songs/") ? filePath.slice("songs/".length) : filePath;
}

function statusFromIssues(issues: SongJsonConsistencyIssue[]): SongJsonConsistencyStatus {
  const hasStructuralError = issues.some((issue) => issue.severity === "error" && issue.code !== "SWITCH_PAIR_NOT_VERIFIED");
  if (hasStructuralError) {
    return "failed";
  }
  if (issues.length > 0) {
    return "review_required";
  }
  return "passed";
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSongStatus(value: unknown): value is SongStatus {
  return typeof value === "string" && songStatuses.includes(value as SongStatus);
}

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && languages.includes(value as Language);
}

function isAssetStatus(value: unknown): value is AssetStatus {
  return typeof value === "string" && assetStatuses.includes(value as AssetStatus);
}

function isVocalMode(value: unknown): value is VocalMode {
  return typeof value === "string" && vocalModes.includes(value as VocalMode);
}

function isLyricMode(value: unknown): value is LyricMode {
  return typeof value === "string" && lyricModes.includes(value as LyricMode);
}

function isSwitchQualityStatus(value: unknown): value is SwitchQualityStatus {
  return typeof value === "string" && switchQualityStatuses.includes(value as SwitchQualityStatus);
}

function sanitizeSegment(value: string): string {
  return value.replace(/[\\/]/gu, "-").trim() || "untitled";
}
