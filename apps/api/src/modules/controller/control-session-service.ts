import type { ControlSession, Room } from "@home-ktv/domain";
import type { ControlSessionInfo } from "@home-ktv/player-contracts";
import type { ControlSessionRepository } from "./repositories/control-session-repository.js";
import type { RoomPairingTokenRepository } from "../rooms/repositories/pairing-token-repository.js";
import { verifyPairingToken } from "../rooms/pairing-token-service.js";

export const CONTROL_SESSION_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
export const CONTROL_SESSION_COOKIE = "ktv_control_session";

export interface CreateControlSessionInput {
  room: Room;
  pairingToken: string;
  deviceId: string;
  deviceName: string;
  pairingTokens: RoomPairingTokenRepository;
  controlSessions: ControlSessionRepository;
  now?: Date;
}

export interface RestoreControlSessionInput {
  room: Room;
  cookieHeader: string | undefined;
  deviceId: string;
  controlSessions: ControlSessionRepository;
  now?: Date;
}

export interface TouchControlSessionInput {
  session: ControlSession;
  controlSessions: ControlSessionRepository;
  now?: Date;
}

export interface SerializeControlSessionCookieInput {
  session: Pick<ControlSession, "id">;
}

export function parseControlSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === CONTROL_SESSION_COOKIE) {
      return rest.join("=").trim() || null;
    }
  }

  return null;
}

export async function createControlSession(input: CreateControlSessionInput): Promise<ControlSessionInfo> {
  const now = input.now ?? new Date();
  const isValid = await verifyPairingToken({
    roomId: input.room.id,
    pairingToken: input.pairingToken,
    repository: input.pairingTokens,
    now
  });
  if (!isValid) {
    throw new Error("INVALID_PAIRING_TOKEN");
  }

  const session = await input.controlSessions.upsertForDevice({
    roomId: input.room.id,
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + CONTROL_SESSION_IDLE_TTL_MS),
    now
  });

  return toControlSessionInfo({
    session,
    roomSlug: input.room.slug
  });
}

export async function restoreControlSession(input: RestoreControlSessionInput): Promise<ControlSessionInfo | null> {
  const now = input.now ?? new Date();
  const sessionId = parseControlSessionCookie(input.cookieHeader);
  if (!sessionId) {
    return null;
  }

  const session = await input.controlSessions.findActiveByIdAndDevice({
    sessionId,
    deviceId: input.deviceId,
    now
  });
  if (!session || session.roomId !== input.room.id) {
    return null;
  }

  const touched = await input.controlSessions.touch({
    sessionId: session.id,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + CONTROL_SESSION_IDLE_TTL_MS),
    now
  });
  if (!touched) {
    return null;
  }

  return toControlSessionInfo({
    session: touched,
    roomSlug: input.room.slug
  });
}

export async function touchControlSession(input: TouchControlSessionInput): Promise<ControlSessionInfo | null> {
  const now = input.now ?? new Date();
  const touched = await input.controlSessions.touch({
    sessionId: input.session.id,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + CONTROL_SESSION_IDLE_TTL_MS),
    now
  });
  return touched ? toControlSessionInfo({ session: touched, roomSlug: "" }) : null;
}

export function serializeControlSessionCookie(input: SerializeControlSessionCookieInput): string {
  return `${CONTROL_SESSION_COOKIE}=${input.session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200`;
}

export function toControlSessionInfo(input: { session: ControlSession; roomSlug: string }): ControlSessionInfo {
  return {
    id: input.session.id,
    roomId: input.session.roomId,
    roomSlug: input.roomSlug,
    deviceId: input.session.deviceId,
    deviceName: input.session.deviceName,
    expiresAt: input.session.expiresAt,
    lastSeenAt: input.session.lastSeenAt
  };
}
