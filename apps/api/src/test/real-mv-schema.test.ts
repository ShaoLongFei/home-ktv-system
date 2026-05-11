import { existsSync, readFileSync } from "node:fs";
import { enumValues, schemaSql } from "../db/schema.js";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../db/migrations/0007_real_mv_contracts.sql", import.meta.url);
const migrationSql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

describe("real MV schema contracts", () => {
  it("adds additive real-MV columns to assets and import candidate files", () => {
    expect(migrationSql).toContain(
      "compatibility_status text NOT NULL DEFAULT 'unknown' CHECK (compatibility_status IN ('unknown', 'review_required', 'playable', 'unsupported'))"
    );

    for (const tableName of ["assets", "import_candidate_files"]) {
      expect(migrationSql).toContain(`ALTER TABLE ${tableName}`);
    }

    for (const column of [
      "compatibility_reasons jsonb NOT NULL DEFAULT '[]'::jsonb",
      `media_info_summary jsonb NOT NULL DEFAULT '{"container":null,"durationMs":null,"videoCodec":null,"resolution":null,"fileSizeBytes":0,"audioTracks":[]}'::jsonb`,
      `media_info_provenance jsonb NOT NULL DEFAULT '{"source":"unknown","sourceVersion":null,"probedAt":null,"importedFrom":null}'::jsonb`,
      `track_roles jsonb NOT NULL DEFAULT '{"original":null,"instrumental":null}'::jsonb`,
      `playback_profile jsonb NOT NULL DEFAULT '{"kind":"separate_asset_pair","container":null,"videoCodec":null,"audioCodecs":[],"requiresAudioTrackSelection":false}'::jsonb`
    ]) {
      expect(migrationSql).toContain(column);
    }
  });

  it("indexes real-MV compatibility and backfills legacy verified ready assets", () => {
    expect(migrationSql).toContain("assets_compatibility_status_idx");
    expect(migrationSql).toContain("import_candidate_files_compatibility_status_idx");
    expect(migrationSql).toContain("UPDATE assets SET compatibility_status = 'playable'");
    expect(migrationSql).toContain("WHERE status = 'ready'");
    expect(migrationSql).toContain("AND switch_quality_status = 'verified'");
    expect(migrationSql).toContain("AND compatibility_status = 'unknown'");
  });

  it("mirrors real-MV enum values and asset schemaSql columns", () => {
    expect(enumValues.compatibilityStatus).toEqual(["unknown", "review_required", "playable", "unsupported"]);
    expect(schemaSql).toContain(
      "compatibility_status text NOT NULL DEFAULT 'unknown' CHECK (compatibility_status IN ('unknown', 'review_required', 'playable', 'unsupported'))"
    );
    expect(schemaSql).toContain("media_info_summary jsonb NOT NULL DEFAULT");
    expect(schemaSql).toContain("media_info_provenance jsonb NOT NULL DEFAULT");
    expect(schemaSql).toContain("track_roles jsonb NOT NULL DEFAULT");
    expect(schemaSql).toContain("playback_profile jsonb NOT NULL DEFAULT");
    expect(schemaSql).toContain("assets_compatibility_status_idx");
  });

  it("does not add Android-specific storage contracts", () => {
    const storageContracts = `${migrationSql}\n${schemaSql}`.toLowerCase();
    for (const forbidden of ["and" + "roid", "media" + "3", "ex" + "o"]) {
      expect(storageContracts).not.toContain(forbidden);
    }
  });
});
