import { existsSync, readFileSync } from "node:fs";
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
});
