import type {
  AdminCatalogSong,
  CatalogSongListFilters,
  CatalogSongListResponse
} from "../songs/types.js";

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

function adminUrl(path: string): string {
  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/u, "") ?? "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
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
