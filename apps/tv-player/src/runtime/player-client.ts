import type {
  PlayerTelemetryKind,
  ReconnectRecoveryResult,
  RoomSnapshot,
  SwitchTransitionResult
} from "@home-ktv/player-contracts";

type VocalMode = NonNullable<RoomSnapshot["currentTarget"]>["vocalMode"];

export interface PlayerClientOptions {
  apiBaseUrl: string;
  deviceId: string;
  deviceName: string;
  fetchImpl?: typeof fetch;
  roomSlug: string;
}

export interface BootstrapResult {
  status: "registered" | "conflict";
  snapshot: RoomSnapshot | null;
}

export class PlayerClient {
  readonly deviceId: string;
  readonly roomSlug: string;

  private readonly apiBaseUrl: string;
  private readonly deviceName: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PlayerClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.deviceId = options.deviceId;
    this.deviceName = options.deviceName;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.roomSlug = options.roomSlug;
  }

  async bootstrap(): Promise<BootstrapResult> {
    return this.postJson<BootstrapResult>("/player/bootstrap", {
      roomSlug: this.roomSlug,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      capabilities: {
        videoPool: "dual-video",
        runtime: "web-tv-player"
      }
    });
  }

  async fetchSnapshot(): Promise<RoomSnapshot> {
    return this.getJson<RoomSnapshot>(`/rooms/${encodeURIComponent(this.roomSlug)}/snapshot`);
  }

  async sendHeartbeat(input: { currentQueueEntryId: string | null; playbackPositionMs: number; health?: "ok" | "degraded" | "blocked" }): Promise<void> {
    await this.postJson("/player/heartbeat", {
      roomSlug: this.roomSlug,
      deviceId: this.deviceId,
      currentQueueEntryId: input.currentQueueEntryId,
      playbackPositionMs: input.playbackPositionMs,
      health: input.health ?? "ok"
    });
  }

  async sendTelemetry(input: {
    roomSlug?: string;
    deviceId?: string;
    eventType: PlayerTelemetryKind;
    sessionVersion: number;
    queueEntryId: string;
    assetId: string;
    playbackPositionMs: number;
    vocalMode: VocalMode;
    switchFamily: string | null;
    rollbackAssetId: string | null;
    message?: string;
    errorCode?: string;
    stage?: string;
  }): Promise<void> {
    await this.postJson("/player/telemetry", {
      roomSlug: input.roomSlug ?? this.roomSlug,
      deviceId: input.deviceId ?? this.deviceId,
      eventType: input.eventType,
      sessionVersion: input.sessionVersion,
      queueEntryId: input.queueEntryId,
      assetId: input.assetId,
      playbackPositionMs: input.playbackPositionMs,
      vocalMode: input.vocalMode,
      switchFamily: input.switchFamily,
      rollbackAssetId: input.rollbackAssetId,
      message: input.message,
      errorCode: input.errorCode,
      stage: input.stage
    });
  }

  async requestSwitchTransition(input: { roomSlug?: string; playbackPositionMs: number }): Promise<SwitchTransitionResult> {
    return this.postJson<SwitchTransitionResult>("/player/switch-transition", {
      roomSlug: input.roomSlug ?? this.roomSlug,
      playbackPositionMs: input.playbackPositionMs
    });
  }

  async requestReconnectRecovery(input: { roomSlug?: string; deviceId?: string }): Promise<ReconnectRecoveryResult> {
    return this.postJson<ReconnectRecoveryResult>("/player/reconnect-recovery", {
      roomSlug: input.roomSlug ?? this.roomSlug,
      deviceId: input.deviceId ?? this.deviceId
    });
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      headers: {
        Accept: "application/json"
      }
    });
    return parseJsonResponse<T>(response);
  }

  private async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    return parseJsonResponse<T>(response);
  }
}

export function createBrowserPlayerClient(): PlayerClient {
  return new PlayerClient({
    apiBaseUrl: readRuntimeSetting("apiBaseUrl", globalThis.location?.origin ?? ""),
    deviceId: readOrCreateDeviceId(),
    deviceName: readRuntimeSetting("deviceName", "Living Room TV"),
    roomSlug: readRuntimeSetting("roomSlug", "living-room")
  });
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`TV player request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function readRuntimeSetting(key: string, fallback: string): string {
  const search = new URLSearchParams(globalThis.location?.search ?? "");
  const fromQuery = search.get(key);
  if (fromQuery) {
    return fromQuery;
  }

  return fallback;
}

function readOrCreateDeviceId(): string {
  const storageKey = "home-ktv.tv-player.device-id";
  try {
    const existing = globalThis.localStorage?.getItem(storageKey);
    if (existing) {
      return existing;
    }

    const created = `web-tv-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    globalThis.localStorage?.setItem(storageKey, created);
    return created;
  } catch {
    return `web-tv-${Math.random().toString(36).slice(2)}`;
  }
}
