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

describe("control sessions", () => {
  it("POST /rooms/living-room/control-sessions sets the control session cookie", async () => {
    const server = await createServer({
      corsAllowedOrigins: [],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://ktv.local",
      roomSlug: "living-room"
    });

    const response = await server.inject({
      method: "POST",
      url: "/rooms/living-room/control-sessions",
      payload: {
        pairingToken: await seedPairingToken(server),
        deviceId: "phone-a",
        deviceName: "Controller A"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toContain(
      "ktv_control_session="
    );
    expect(String(response.headers["set-cookie"])).toContain(
      "HttpOnly; SameSite=Lax; Path=/; Max-Age=7200"
    );
    await server.close();
  });

  it("GET /rooms/living-room/control-session restores from cookie plus device id", async () => {
    const server = await createServer({
      corsAllowedOrigins: [],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://ktv.local",
      roomSlug: "living-room"
    });
    const pairingToken = await seedPairingToken(server);
    const created = await server.inject({
      method: "POST",
      url: "/rooms/living-room/control-sessions",
      payload: {
        pairingToken,
        deviceId: "phone-a",
        deviceName: "Controller A"
      }
    });
    const cookie = extractControlSessionCookie(created.headers["set-cookie"]);

    const restored = await server.inject({
      method: "GET",
      url: "/rooms/living-room/control-session?deviceId=phone-a",
      headers: {
        cookie
      }
    });

    expect(restored.statusCode).toBe(200);
    expect(restored.json().controlSession.deviceId).toBe("phone-a");
    expect(String(restored.headers["set-cookie"])).toContain("Max-Age=7200");
    await server.close();
  });

  it("restore touches last_seen_at, extends expires_at, and refreshes the cookie max age", async () => {
    const server = await createServer({
      corsAllowedOrigins: [],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://ktv.local",
      roomSlug: "living-room"
    });
    const pairingToken = await seedPairingToken(server);
    const created = await server.inject({
      method: "POST",
      url: "/rooms/living-room/control-sessions",
      payload: {
        pairingToken,
        deviceId: "phone-a",
        deviceName: "Controller A"
      }
    });
    const cookie = extractControlSessionCookie(created.headers["set-cookie"]);

    const restored = await server.inject({
      method: "GET",
      url: "/rooms/living-room/control-session?deviceId=phone-a",
      headers: {
        cookie
      }
    });

    expect(restored.statusCode).toBe(200);
    expect(restored.json().controlSession.expiresAt).toBeDefined();
    expect(String(restored.headers["set-cookie"])).toContain("Max-Age=7200");
    await server.close();
  });

  it("expired or revoked sessions return CONTROL_SESSION_REQUIRED", async () => {
    const server = await createServer({
      corsAllowedOrigins: [],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://ktv.local",
      roomSlug: "living-room"
    });

    const missing = await server.inject({
      method: "GET",
      url: "/rooms/living-room/control-session?deviceId=phone-a"
    });

    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toEqual({ code: "CONTROL_SESSION_REQUIRED" });
    await server.close();
  });

  it("POST /admin/rooms/living-room/pairing-token/refresh returns a different token and preserves active sessions", async () => {
    const server = await createServer({
      corsAllowedOrigins: [],
      databaseUrl: "",
      host: "0.0.0.0",
      mediaRoot: "/media-root",
      port: 4000,
      publicBaseUrl: "http://ktv.local",
      roomSlug: "living-room"
    });

    const originalPairing = await server.inject({
      method: "GET",
      url: "/rooms/living-room/snapshot"
    });
    const originalToken = originalPairing.json().pairing.token as string;

    const created = await server.inject({
      method: "POST",
      url: "/rooms/living-room/control-sessions",
      payload: {
        pairingToken: originalToken,
        deviceId: "phone-a",
        deviceName: "Controller A"
      }
    });
    const cookie = extractControlSessionCookie(created.headers["set-cookie"]);

    const refreshed = await server.inject({
      method: "POST",
      url: "/admin/rooms/living-room/pairing-token/refresh"
    });

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().pairing.token).not.toBe(originalToken);
    expect(refreshed.json().pairing.tokenExpiresAt).toContain("T");

    const rejected = await server.inject({
      method: "POST",
      url: "/rooms/living-room/control-sessions",
      payload: {
        pairingToken: originalToken,
        deviceId: "phone-b",
        deviceName: "Controller B"
      }
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toEqual({ code: "INVALID_PAIRING_TOKEN" });

    const restored = await server.inject({
      method: "GET",
      url: "/rooms/living-room/control-session?deviceId=phone-a",
      headers: {
        cookie
      }
    });

    expect(restored.statusCode).toBe(200);
    expect(restored.json().controlSession.deviceId).toBe("phone-a");
    await server.close();
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

async function seedPairingToken(server: Awaited<ReturnType<typeof createServer>>): Promise<string> {
  const response = await server.inject({
    method: "GET",
    url: "/rooms/living-room/snapshot"
  });

  return response.json().pairing.token;
}

function extractControlSessionCookie(setCookie: unknown): string {
  if (Array.isArray(setCookie)) {
    return String(setCookie[0] ?? "");
  }

  return String(setCookie ?? "");
}
