import { describe, expect, it } from "vitest";
import type { Room } from "@home-ktv/domain";
import { createServer } from "../server.js";
import {
  getOrCreatePairingInfo,
  PAIRING_TOKEN_TTL_MS,
  refreshPairingToken,
  verifyPairingToken
} from "../modules/rooms/pairing-token-service.js";
import { InMemoryRoomPairingTokenRepository } from "../modules/rooms/repositories/pairing-token-repository.js";

const room = createRoom();

describe("room pairing tokens", () => {
  it("repeated room snapshot requests return the same PairingInfo.token until expiry", async () => {
    const server = await createServer({
      corsAllowedOrigins: [],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://ktv.local",
      roomSlug: "living-room"
    });

    const first = await server.inject({ method: "GET", url: "/rooms/living-room/snapshot" });
    const second = await server.inject({ method: "GET", url: "/rooms/living-room/snapshot" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().pairing.token).toEqual(second.json().pairing.token);
    await server.close();
  });

  it("repository-only reload returns the same displayable token until expiry", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const repository = new InMemoryRoomPairingTokenRepository();
    const pairing = await getOrCreatePairingInfo({
      room,
      publicBaseUrl: "http://ktv.local",
      repository,
      now
    });
    const persisted = await repository.findByRoomId(room.id);
    const reloadedRepository = new InMemoryRoomPairingTokenRepository(persisted ? [persisted] : []);

    const reloadedPairing = await getOrCreatePairingInfo({
      room,
      publicBaseUrl: "http://ktv.local",
      repository: reloadedRepository,
      now: new Date("2026-05-01T10:14:59.000Z")
    });

    expect(reloadedPairing.token).toBe(pairing.token);
    expect(reloadedPairing.controllerUrl).toContain(`token=${encodeURIComponent(pairing.token)}`);
  });

  it("uses a fifteen minute pairing token TTL", () => {
    expect(PAIRING_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
  });

  it("verifyPairingToken accepts the current token and rejects expired or rotated tokens", async () => {
    const repository = new InMemoryRoomPairingTokenRepository();
    const now = new Date("2026-05-01T10:00:00.000Z");
    const pairing = await getOrCreatePairingInfo({
      room,
      publicBaseUrl: "http://ktv.local",
      repository,
      now
    });

    await expect(
      verifyPairingToken({ roomId: room.id, pairingToken: pairing.token, repository, now })
    ).resolves.toBe(true);
    await expect(
      verifyPairingToken({
        roomId: room.id,
        pairingToken: pairing.token,
        repository,
        now: new Date("2026-05-01T10:15:01.000Z")
      })
    ).resolves.toBe(false);

    const refreshed = await refreshPairingToken({
      room,
      publicBaseUrl: "http://ktv.local",
      repository,
      now: new Date("2026-05-01T10:05:00.000Z")
    });

    expect(refreshed.token).not.toBe(pairing.token);
    await expect(
      verifyPairingToken({
        roomId: room.id,
        pairingToken: pairing.token,
        repository,
        now: new Date("2026-05-01T10:05:01.000Z")
      })
    ).resolves.toBe(false);
    await expect(
      verifyPairingToken({
        roomId: room.id,
        pairingToken: refreshed.token,
        repository,
        now: new Date("2026-05-01T10:05:01.000Z")
      })
    ).resolves.toBe(true);
  });
});

function createRoom(): Room {
  const now = "2026-05-01T10:00:00.000Z";
  return {
    id: "living-room",
    slug: "living-room",
    name: "Living Room",
    status: "active",
    defaultPlayerDeviceId: null,
    createdAt: now,
    updatedAt: now
  };
}
