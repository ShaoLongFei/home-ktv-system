export interface ApiConfig {
  corsAllowedOrigins: readonly string[];
  databaseUrl: string;
  mediaRoot: string;
  publicBaseUrl: string;
  roomSlug: string;
  port: number;
  host: string;
  scanIntervalMinutes: number;
}

const DEFAULT_ROOM_SLUG = "living-room";
const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_SCAN_INTERVAL_MINUTES = 360;

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
  return {
    corsAllowedOrigins: readList(env.CORS_ALLOWED_ORIGINS),
    databaseUrl: readString(env.DATABASE_URL),
    mediaRoot: readString(env.MEDIA_ROOT),
    publicBaseUrl: readString(env.PUBLIC_BASE_URL),
    roomSlug: readString(env.TV_ROOM_SLUG) || DEFAULT_ROOM_SLUG,
    port: readPort(env.PORT),
    host: readString(env.HOST) || DEFAULT_HOST,
    scanIntervalMinutes: readPositiveInteger(env.SCAN_INTERVAL_MINUTES, DEFAULT_SCAN_INTERVAL_MINUTES)
  };
}
