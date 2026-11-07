import type { AdminDashboardResponse, AdminDashboardTrendRange, KtvIndexDiagnosticsResponse } from "@home-ktv/domain";
import type { RoomStatusResponse, RoomStatusRefreshResponse } from "../rooms/types.js";

const adminDeviceIdStorageKey = "home_ktv_admin_device_id";

export async function fetchAdmin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(adminUrl(path), {
    ...init,
    headers: buildHeaders(init)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchKtvIndexDiagnostics(
  input: {
    query?: string;
    sampleSize?: number;
    sampleTimeoutMs?: number;
  } = {}
): Promise<KtvIndexDiagnosticsResponse> {
  const params = new URLSearchParams();
  const query = input.query?.trim();
  if (query) {
    params.set("q", query);
  }
  if (input.sampleSize !== undefined) {
    params.set("sampleSize", String(input.sampleSize));
  }
  if (input.sampleTimeoutMs !== undefined) {
    params.set("sampleTimeoutMs", String(input.sampleTimeoutMs));
  }
  const queryString = params.toString();
  return fetchAdmin<KtvIndexDiagnosticsResponse>(`/admin/ktv-index/diagnostics${queryString ? `?${queryString}` : ""}`);
}

export async function fetchAdminDashboard(
  input: { trendRange?: AdminDashboardTrendRange } = {}
): Promise<AdminDashboardResponse> {
  const params = new URLSearchParams();
  if (input.trendRange) {
    params.set("trendRange", input.trendRange);
  }
  const queryString = params.toString();
  return fetchAdmin<AdminDashboardResponse>(`/admin/ktv-index/dashboard${queryString ? `?${queryString}` : ""}`);
}

export async function fetchRoomStatus(roomSlug: string): Promise<RoomStatusResponse> {
  return fetchAdmin<RoomStatusResponse>(`/admin/rooms/${roomSlug}`);
}

export async function refreshRoomStatus(roomSlug: string): Promise<RoomStatusResponse> {
  return fetchRoomStatus(roomSlug);
}

export async function refreshPairingToken(roomSlug: string): Promise<RoomStatusRefreshResponse> {
  return fetchAdmin<RoomStatusRefreshResponse>(`/admin/rooms/${roomSlug}/pairing-token/refresh`, {
    method: "POST"
  });
}

export function getOrCreateAdminDeviceId(): string {
  try {
    const existing = localStorage.getItem(adminDeviceIdStorageKey);
    if (existing) {
      return existing;
    }

    const deviceId = createId("admin-");
    localStorage.setItem(adminDeviceIdStorageKey, deviceId);
    return deviceId;
  } catch {
    return createId("admin-");
  }
}

export function roomRealtimeUrl(input: { roomSlug: string; deviceId: string }): string {
  const path = `/rooms/${encodeURIComponent(input.roomSlug)}/realtime?deviceId=${encodeURIComponent(
    input.deviceId
  )}&client=admin`;
  const httpUrl = new URL(path, apiBaseUrl() || window.location.origin);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  return httpUrl.toString();
}

function adminUrl(path: string): string {
  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl()}${normalizedPath}`;
}

function apiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/u, "") ?? "";
}

function buildHeaders(init: RequestInit): HeadersInit {
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return headers;
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Admin request failed with ${response.status}`;
  const text = await response.text();

  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
    return stringValue(parsed.message) ?? stringValue(parsed.error) ?? text;
  } catch {
    return text;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function createId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}${randomPart}`;
}

export interface OnlineSourceStatusResponse {
  provider: string;
  enabled: boolean;
  cacheDir: string;
  pendingJobs: number;
  activeJobs: number;
  stats: {
    total: number;
    ready: number;
    caching: number;
    failed: number;
    unavailable: number;
    bytes: number;
  };
  quota: {
    maxBytes: number;
    maxItems: number;
    ttlDays: number;
    usedBytes: number;
    usedItems: number;
  };
  metrics: {
    downloads: number;
    evictions: number;
    failures: number;
    lastPruneAt: string | null;
  };
}

export interface OnlineAssetResponse {
  id: string;
  provider: string;
  providerAssetId: string;
  status: string;
  cachePath: string | null;
  cacheBytes: number | null;
  audioTrackCount: number | null;
  durationMs: number | null;
  errorReason: string | null;
  catalogSongId: string | null;
  metadata: Record<string, unknown>;
}

export interface OnlineHotModuleResponse {
  headId: string;
  title: string;
  subTitle: string;
  pictureUrl: string | null;
  link: string;
  objectType: string | null;
  objectId: string | null;
}

export async function fetchOnlineSourceStatus(): Promise<OnlineSourceStatusResponse> {
  return fetchAdmin<OnlineSourceStatusResponse>("/admin/online/sources");
}

export async function fetchOnlineAssets(limit = 50): Promise<{ assets: OnlineAssetResponse[] }> {
  return fetchAdmin<{ assets: OnlineAssetResponse[] }>(`/admin/online/assets?limit=${encodeURIComponent(String(limit))}`);
}

export async function fetchOnlineDiscovery(): Promise<{ hotModules: OnlineHotModuleResponse[] }> {
  return fetchAdmin<{ hotModules: OnlineHotModuleResponse[] }>("/admin/online/discovery");
}

export async function evictOnlineAsset(assetId: string): Promise<{ assetId: string; status: string; evicted: boolean }> {
  return fetchAdmin(`/admin/online/assets/${encodeURIComponent(assetId)}/evict`, { method: "POST" });
}

export async function pruneOnlineCache(): Promise<{ evicted: number; stale: number }> {
  return fetchAdmin("/admin/online/prune", { method: "POST" });
}

export async function importOnlineByQuery(input: { query: string; limit: number }): Promise<{ queued: number }> {
  return fetchAdmin("/admin/online/import", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function importOnlineByPackage(input: {
  packageType: number;
  packageId: string;
  limit: number;
}): Promise<{ queued: number }> {
  return fetchAdmin("/admin/online/import", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
