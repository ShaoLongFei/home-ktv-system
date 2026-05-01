import { createHash, randomUUID } from "node:crypto";
import type { Room, RoomId } from "@home-ktv/domain";
import type { PairingInfo } from "@home-ktv/player-contracts";
import type { RoomPairingTokenRepository } from "./repositories/pairing-token-repository.js";

export const PAIRING_TOKEN_TTL_MS = 15 * 60 * 1000;

export interface PairingTokenInput {
  room: Room;
  publicBaseUrl: string;
  repository: RoomPairingTokenRepository;
  now?: Date;
}

export interface VerifyPairingTokenInput {
  roomId: RoomId;
  pairingToken: string;
  repository: RoomPairingTokenRepository;
  now?: Date;
}

export interface ToPairingInfoInput {
  roomSlug: string;
  publicBaseUrl: string;
  token: string;
  tokenExpiresAt: Date;
}

export function createOpaquePairingToken(): string {
  return randomUUID().replaceAll("-", "");
}

export function hashPairingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getOrCreatePairingInfo(input: PairingTokenInput): Promise<PairingInfo> {
  const now = input.now ?? new Date();
  const existing = await input.repository.findByRoomId(input.room.id);
  if (existing && new Date(existing.tokenExpiresAt).getTime() > now.getTime()) {
    return toPairingInfo({
      roomSlug: input.room.slug,
      publicBaseUrl: input.publicBaseUrl,
      token: existing.tokenValue,
      tokenExpiresAt: new Date(existing.tokenExpiresAt)
    });
  }

  return createAndStorePairingInfo({ ...input, now });
}

export async function refreshPairingToken(input: PairingTokenInput): Promise<PairingInfo> {
  return createAndStorePairingInfo({ ...input, now: input.now ?? new Date() });
}

export async function verifyPairingToken(input: VerifyPairingTokenInput): Promise<boolean> {
  const now = input.now ?? new Date();
  const existing = await input.repository.findByRoomId(input.roomId);
  if (!existing || new Date(existing.tokenExpiresAt).getTime() <= now.getTime()) {
    return false;
  }

  return existing.tokenHash === hashPairingToken(input.pairingToken);
}

export function toPairingInfo(input: ToPairingInfoInput): PairingInfo {
  const baseUrl = input.publicBaseUrl.trim().replace(/\/$/, "");
  const controllerUrl = `${baseUrl || ""}/controller?room=${encodeURIComponent(input.roomSlug)}&token=${encodeURIComponent(input.token)}`;

  return {
    roomSlug: input.roomSlug,
    controllerUrl,
    qrPayload: controllerUrl,
    token: input.token,
    tokenExpiresAt: input.tokenExpiresAt.toISOString()
  };
}

async function createAndStorePairingInfo(input: PairingTokenInput & { now: Date }): Promise<PairingInfo> {
  const token = createOpaquePairingToken();
  const tokenExpiresAt = new Date(input.now.getTime() + PAIRING_TOKEN_TTL_MS);
  const persisted = await input.repository.upsert({
    roomId: input.room.id,
    tokenValue: token,
    tokenHash: hashPairingToken(token),
    tokenExpiresAt,
    now: input.now
  });

  return toPairingInfo({
    roomSlug: input.room.slug,
    publicBaseUrl: input.publicBaseUrl,
    token: persisted.tokenValue,
    tokenExpiresAt: new Date(persisted.tokenExpiresAt)
  });
}
