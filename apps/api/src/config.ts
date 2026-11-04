import { join } from "node:path";
import { parseMediaPathMappings, type MediaPathMapping } from "./modules/assets/media-path-mapping.js";

export interface IgebaSourceConfig {
  enabled: boolean;
  baseUrl: string;
  uid: number;
  minIntervalMs: number;
  requestTimeoutMs: number;
  resolveAttempts: number;
  cacheDir: string;
  concurrency: number;
}

export interface ApiConfig {
  corsAllowedOrigins: readonly string[];
  databaseUrl: string;
  controllerBaseUrl?: string;
  igeba?: IgebaSourceConfig;
  mediaPathMappings: readonly MediaPathMapping[];
  mediaRoot: string;
  onlineDemoReadyAssetId: string;
  onlineProviderIds: readonly string[];
  onlineProviderKillSwitchIds: readonly string[];
  publicBaseUrl: string;
  roomSlug: string;
  port: number;
  host: string;
  scanIntervalMinutes: number;
}

export type ApiConfigInput = Omit<
  ApiConfig,
  | "igeba"
  | "mediaPathMappings"
  | "onlineDemoReadyAssetId"
  | "onlineProviderIds"
  | "onlineProviderKillSwitchIds"
  | "scanIntervalMinutes"
> & {
  igeba?: IgebaSourceConfig;
  mediaPathMappings?: readonly MediaPathMapping[];
  onlineDemoReadyAssetId?: string;
  onlineProviderIds?: readonly string[];
  onlineProviderKillSwitchIds?: readonly string[];
  scanIntervalMinutes?: number;
};

const DEFAULT_ROOM_SLUG = "living-room";
const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_SCAN_INTERVAL_MINUTES = 360;
const IGEBA_PROVIDER_ID = "igeba";
const DEFAULT_IGEBA_BASE_URL = "http://app.ige8.net";
const DEFAULT_IGEBA_MIN_INTERVAL_MS = 1000;
const DEFAULT_IGEBA_REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_IGEBA_RESOLVE_ATTEMPTS = 30;

function readString(value: string | undefined): string {
  return value?.trim() ?? "";
}

function readPort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const mediaRoot = readString(env.MEDIA_ROOT);
  const onlineProviderIds = readList(env.ONLINE_PROVIDER_IDS);
  const killSwitchIds = readList(env.ONLINE_PROVIDER_KILL_SWITCH_IDS);
  return {
    corsAllowedOrigins: readList(env.CORS_ALLOWED_ORIGINS),
    databaseUrl: readString(env.DATABASE_URL),
    controllerBaseUrl: readString(env.CONTROLLER_BASE_URL),
    igeba: {
      enabled: resolveIgebaEnabled(env, onlineProviderIds, killSwitchIds, mediaRoot),
      baseUrl: readString(env.IGEBA_BASE_URL) || DEFAULT_IGEBA_BASE_URL,
      uid: readNonNegativeInteger(env.IGEBA_UID, 0),
      minIntervalMs: readNonNegativeInteger(env.IGEBA_MIN_INTERVAL_MS, DEFAULT_IGEBA_MIN_INTERVAL_MS),
      requestTimeoutMs: readPositiveInteger(env.IGEBA_REQUEST_TIMEOUT_MS, DEFAULT_IGEBA_REQUEST_TIMEOUT_MS),
      resolveAttempts: readPositiveInteger(env.IGEBA_RESOLVE_ATTEMPTS, DEFAULT_IGEBA_RESOLVE_ATTEMPTS),
      cacheDir: readString(env.IGEBA_CACHE_DIR) || (mediaRoot ? join(mediaRoot, "online-cache", "igeba") : ""),
      concurrency: readPositiveInteger(env.IGEBA_CONCURRENCY, 1)
    },
    mediaPathMappings: parseMediaPathMappings(env.MEDIA_PATH_MAPPINGS),
    mediaRoot,
    onlineDemoReadyAssetId: readString(env.ONLINE_DEMO_READY_ASSET_ID),
    onlineProviderIds,
    onlineProviderKillSwitchIds: killSwitchIds,
    publicBaseUrl: readString(env.PUBLIC_BASE_URL),
    roomSlug: readString(env.TV_ROOM_SLUG) || DEFAULT_ROOM_SLUG,
    port: readPort(env.PORT),
    host: readString(env.HOST) || DEFAULT_HOST,
    scanIntervalMinutes: readPositiveInteger(env.SCAN_INTERVAL_MINUTES, DEFAULT_SCAN_INTERVAL_MINUTES)
  };
}

function resolveIgebaEnabled(
  env: NodeJS.ProcessEnv,
  onlineProviderIds: readonly string[],
  killSwitchIds: readonly string[],
  mediaRoot: string
): boolean {
  if (killSwitchIds.includes(IGEBA_PROVIDER_ID)) {
    return false;
  }
  if (!mediaRoot) {
    return false;
  }
  const explicit = readString(env.IGEBA_ENABLED).toLowerCase();
  if (explicit === "false" || explicit === "0") {
    return false;
  }
  return explicit === "true" || explicit === "1" || onlineProviderIds.includes(IGEBA_PROVIDER_ID);
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeApiConfig(config: ApiConfigInput): ApiConfig {
  const onlineProviderIds = config.onlineProviderIds ?? [];
  const killSwitchIds = config.onlineProviderKillSwitchIds ?? [];
  const mediaRoot = config.mediaRoot;
  return {
    ...config,
    igeba: config.igeba ?? {
      enabled: mediaRoot.length > 0 && onlineProviderIds.includes(IGEBA_PROVIDER_ID) && !killSwitchIds.includes(IGEBA_PROVIDER_ID),
      baseUrl: DEFAULT_IGEBA_BASE_URL,
      uid: 0,
      minIntervalMs: DEFAULT_IGEBA_MIN_INTERVAL_MS,
      requestTimeoutMs: DEFAULT_IGEBA_REQUEST_TIMEOUT_MS,
      resolveAttempts: DEFAULT_IGEBA_RESOLVE_ATTEMPTS,
      cacheDir: mediaRoot ? join(mediaRoot, "online-cache", "igeba") : "",
      concurrency: 1
    },
    mediaPathMappings: config.mediaPathMappings ?? [],
    onlineDemoReadyAssetId: config.onlineDemoReadyAssetId ?? "",
    onlineProviderIds,
    onlineProviderKillSwitchIds: killSwitchIds,
    scanIntervalMinutes: config.scanIntervalMinutes ?? DEFAULT_SCAN_INTERVAL_MINUTES
  };
}
