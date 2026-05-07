import type { ControlSessionInfo, RoomControlSnapshot } from "@home-ktv/player-contracts";

const deviceIdStorageKey = "home_ktv_device_id";

export interface AvailableSong {
  songId: string;
  title: string;
  artistName: string;
  language: string;
  defaultAssetId: string;
  durationMs: number;
}

export interface ControllerSessionResponse {
  controlSession: ControlSessionInfo;
  snapshot: RoomControlSnapshot | null;
}

export interface CommandAcceptedResponse {
  status: "accepted";
  commandId: string;
  sessionVersion: number;
  snapshot: RoomControlSnapshot;
  undo?: { queueEntryId: string; undoExpiresAt: string };
}

export interface CommandConflictResponse {
  code: "SESSION_VERSION_CONFLICT";
  latestSessionVersion: number;
  snapshot: RoomControlSnapshot;
}

export class ControllerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly payload: unknown
  ) {
    super(message);
  }
}

interface CommandBaseInput {
  roomSlug: string;
  deviceId: string;
  sessionVersion: number;
}

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(deviceIdStorageKey);
  if (existing) {
    return existing;
  }

  const deviceId = `mobile-${crypto.randomUUID()}`;
  localStorage.setItem(deviceIdStorageKey, deviceId);
  return deviceId;
}

export async function restoreControlSession(input: {
  roomSlug: string;
  deviceId: string;
}): Promise<ControllerSessionResponse> {
  return fetchController<ControllerSessionResponse>(
    `/rooms/${encodeURIComponent(input.roomSlug)}/control-session?deviceId=${encodeURIComponent(input.deviceId)}`
  );
}

export async function createControlSession(input: {
  roomSlug: string;
  pairingToken: string;
  deviceId: string;
  deviceName?: string;
}): Promise<ControllerSessionResponse> {
  return fetchController<ControllerSessionResponse>(`/rooms/${encodeURIComponent(input.roomSlug)}/control-sessions`, {
    method: "POST",
    body: JSON.stringify({
      pairingToken: input.pairingToken,
      deviceId: input.deviceId,
      deviceName: input.deviceName ?? "Mobile Controller"
    })
  });
}

export async function fetchAvailableSongs(roomSlug: string): Promise<AvailableSong[]> {
  const response = await fetchController<{ songs: AvailableSong[] }>(
    `/rooms/${encodeURIComponent(roomSlug)}/available-songs`
  );
  return response.songs;
}

export async function fetchControlSnapshot(input: {
  roomSlug: string;
  deviceId: string;
}): Promise<RoomControlSnapshot | null> {
  const response = await restoreControlSession(input);
  return response.snapshot;
}

export async function addQueueEntry(input: CommandBaseInput & { songId: string }) {
  return sendCommand(input, "add-queue-entry", { songId: input.songId });
}

export async function deleteQueueEntry(input: CommandBaseInput & { queueEntryId: string }) {
  return sendCommand(input, "delete-queue-entry", { queueEntryId: input.queueEntryId });
}

export async function undoDeleteQueueEntry(input: CommandBaseInput & { queueEntryId: string }) {
  return sendCommand(input, "undo-delete-queue-entry", { queueEntryId: input.queueEntryId });
}

export async function promoteQueueEntry(input: CommandBaseInput & { queueEntryId: string }) {
  return sendCommand(input, "promote-queue-entry", { queueEntryId: input.queueEntryId });
}

export async function skipCurrent(input: CommandBaseInput & { confirmSkip: boolean }) {
  return sendCommand(input, "skip-current", { confirmSkip: input.confirmSkip });
}

export async function switchVocalMode(input: CommandBaseInput & { playbackPositionMs?: number }) {
  return sendCommand(input, "switch-vocal-mode", {
    playbackPositionMs: input.playbackPositionMs
  });
}

export function realtimeUrl(input: { roomSlug: string; deviceId: string }): string {
  const path = `/rooms/${encodeURIComponent(input.roomSlug)}/realtime?deviceId=${encodeURIComponent(
    input.deviceId
  )}&client=mobile`;
  const base = apiBaseUrl();
  const httpUrl = new URL(path, base || window.location.origin);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  return httpUrl.toString();
}

async function sendCommand(
  input: CommandBaseInput,
  command: string,
  payload: Record<string, unknown>
): Promise<CommandAcceptedResponse> {
  return fetchController<CommandAcceptedResponse>(
    `/rooms/${encodeURIComponent(input.roomSlug)}/commands/${command}`,
    {
      method: "POST",
      body: JSON.stringify({
        commandId: createCommandId(),
        sessionVersion: input.sessionVersion,
        deviceId: input.deviceId,
        ...payload
      })
    }
  );
}

async function fetchController<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(controllerUrl(path), {
    ...init,
    credentials: "include",
    headers: buildHeaders(init)
  });

  if (!response.ok) {
    const payload = await readJson(response);
    const code = payload && typeof payload === "object" && "code" in payload ? String(payload.code) : null;
    throw new ControllerApiError(code ?? `Controller request failed with ${response.status}`, response.status, code, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function controllerUrl(path: string): string {
  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  const baseUrl = apiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
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

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createCommandId(): string {
  return `mobile-command-${crypto.randomUUID()}`;
}
