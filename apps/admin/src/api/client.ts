import type {
  AdminCatalogSong,
  CatalogAssetMutationResponse,
  CatalogAssetPatch,
  CatalogEvaluation,
  CatalogSongListFilters,
  CatalogSongListResponse,
  CatalogSongMutationResponse,
  CatalogValidationResult,
  SongMetadataPatch
} from "../songs/types.js";
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

export async function fetchCatalogSongs(filters: CatalogSongListFilters = {}): Promise<AdminCatalogSong[]> {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.language) {
    params.set("language", filters.language);
  }
  const query = params.toString();
  const response = await fetchAdmin<CatalogSongListResponse>(`/admin/catalog/songs${query ? `?${query}` : ""}`);
  return response.songs;
}

export async function updateCatalogSong(songId: string, input: SongMetadataPatch): Promise<CatalogSongMutationResponse> {
  return fetchAdmin<CatalogSongMutationResponse>(`/admin/catalog/songs/${songId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function updateCatalogDefaultAsset(songId: string, assetId: string): Promise<CatalogSongMutationResponse> {
  return fetchAdmin<CatalogSongMutationResponse>(`/admin/catalog/songs/${songId}/default-asset`, {
    method: "PATCH",
    body: JSON.stringify({ assetId })
  });
}

export async function updateCatalogAsset(assetId: string, patch: CatalogAssetPatch): Promise<CatalogAssetMutationResponse> {
  return fetchAdmin<CatalogAssetMutationResponse>(`/admin/catalog/assets/${assetId}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export async function revalidateCatalogSong(songId: string): Promise<CatalogSongMutationResponse & { evaluation: CatalogEvaluation }> {
  return fetchAdmin<CatalogSongMutationResponse & { evaluation: CatalogEvaluation }>(`/admin/catalog/songs/${songId}/revalidate`, {
    method: "POST"
  });
}

export async function validateCatalogSong(songId: string): Promise<CatalogValidationResult> {
  return fetchAdmin<CatalogValidationResult>(`/admin/catalog/songs/${songId}/validate`);
}

export async function fetchRoomStatus(roomSlug: string): Promise<RoomStatusResponse> {
  return fetchAdmin<RoomStatusResponse>(`/admin/rooms/${roomSlug}`);
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
