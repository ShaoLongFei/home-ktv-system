import { existsSync, readFileSync } from "node:fs";
import type {
  ControlCommandResultStatus,
  ControlCommandType,
  ControlSession,
  RoomPairingToken
} from "@home-ktv/domain";
import type { ControlSessionInfo, RoomControlSnapshot } from "@home-ktv/player-contracts";
import { schemaSql } from "../db/schema";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../db/migrations/0003_room_sessions_control.sql", import.meta.url);
const migrationSql = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";

const schemaSources = [migrationSql, schemaSql];

describe("room control session schema contracts", () => {
  it("creates pairing token, control session, and command tables in migration and schemaSql", () => {
    for (const sql of schemaSources) {
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS room_pairing_tokens");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS control_sessions");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS control_commands");
    }
  });

  it("stores displayable pairing tokens alongside verification hashes until expiry", () => {
    for (const sql of schemaSources) {
      expect(sql).toContain("token_value text NOT NULL");
      expect(sql).toContain("token_hash text NOT NULL");
      expect(sql).toContain("token_expires_at timestamptz NOT NULL");
    }
  });

  it("tracks restorable control sessions with idle expiry and revocation", () => {
    for (const sql of schemaSources) {
      expect(sql).toContain("device_id text NOT NULL");
      expect(sql).toContain("last_seen_at timestamptz NOT NULL DEFAULT now()");
      expect(sql).toContain("expires_at timestamptz NOT NULL");
      expect(sql).toContain("revoked_at timestamptz");
    }
  });

  it("records idempotent control commands and command outcomes", () => {
    for (const sql of schemaSources) {
      expect(sql).toContain("command_id text PRIMARY KEY");
      expect(sql).toContain("'accepted'");
      expect(sql).toContain("'duplicate'");
      expect(sql).toContain("'conflict'");
      expect(sql).toContain("'rejected'");
    }
  });

  it("exports domain control session and command contracts", () => {
    const commandType = "switch-vocal-mode" satisfies ControlCommandType;
    const resultStatus = "accepted" satisfies ControlCommandResultStatus;
    const pairingToken = {
      roomId: "living-room",
      tokenValue: "opaque-token",
      tokenHash: "hash",
      tokenExpiresAt: "2026-05-01T14:00:00.000Z",
      rotatedAt: "2026-05-01T13:45:00.000Z",
      createdAt: "2026-05-01T13:45:00.000Z",
      updatedAt: "2026-05-01T13:45:00.000Z"
    } satisfies RoomPairingToken;
    const controlSession = {
      id: "session-1",
      roomId: "living-room",
      deviceId: "phone-1",
      deviceName: "Mobile Controller",
      lastSeenAt: "2026-05-01T13:45:00.000Z",
      expiresAt: "2026-05-01T15:45:00.000Z",
      revokedAt: null,
      createdAt: "2026-05-01T13:45:00.000Z",
      updatedAt: "2026-05-01T13:45:00.000Z"
    } satisfies ControlSession;

    expect([commandType, resultStatus, pairingToken.roomId, controlSession.deviceId]).toEqual([
      "switch-vocal-mode",
      "accepted",
      "living-room",
      "phone-1"
    ]);
  });

  it("exports a mobile room control snapshot with full control room state", () => {
    const session = {
      id: "session-1",
      roomId: "living-room",
      roomSlug: "living-room",
      deviceId: "phone-1",
      deviceName: "Mobile Controller",
      expiresAt: "2026-05-01T15:45:00.000Z",
      lastSeenAt: "2026-05-01T13:45:00.000Z"
    } satisfies ControlSessionInfo;
    const snapshot = {
      type: "room.control.snapshot",
      roomId: "living-room",
      roomSlug: "living-room",
      sessionVersion: 7,
      state: "playing",
      pairing: {
        roomSlug: "living-room",
        controllerUrl: "http://localhost:5173/rooms/living-room",
        qrPayload: "http://localhost:5173/rooms/living-room?token=opaque-token",
        token: "opaque-token",
        tokenExpiresAt: "2026-05-01T14:00:00.000Z"
      },
      tvPresence: {
        online: true,
        deviceName: "Living Room TV",
        lastSeenAt: "2026-05-01T13:45:00.000Z",
        conflict: null
      },
      controllers: {
        onlineCount: 2
      },
      currentTarget: null,
      switchTarget: null,
      queue: [
        {
          queueEntryId: "queue-1",
          songId: "song-1",
          assetId: "asset-1",
          songTitle: "Song",
          artistName: "Artist",
          requestedBy: "phone-1",
          queuePosition: 1,
          status: "queued",
          canPromote: true,
          canDelete: true,
          undoExpiresAt: null
        }
      ],
      notice: null,
      generatedAt: "2026-05-01T13:45:00.000Z"
    } satisfies RoomControlSnapshot;

    expect(session.roomSlug).toBe("living-room");
    expect(snapshot.type).toBe("room.control.snapshot");
    expect(snapshot.queue[0]?.canPromote).toBe(true);
  });
});
