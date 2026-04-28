export interface ApiConfig {
  databaseUrl: string;
  mediaRoot: string;
  publicBaseUrl: string;
  roomSlug: string;
  port: number;
  host: string;
}

const DEFAULT_ROOM_SLUG = "living-room";
const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "0.0.0.0";

function readString(value: string | undefined): string {
  return value?.trim() ?? "";
}

function readPort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    databaseUrl: readString(env.DATABASE_URL),
    mediaRoot: readString(env.MEDIA_ROOT),
    publicBaseUrl: readString(env.PUBLIC_BASE_URL),
    roomSlug: readString(env.TV_ROOM_SLUG) || DEFAULT_ROOM_SLUG,
    port: readPort(env.PORT),
    host: readString(env.HOST) || DEFAULT_HOST
  };
}
