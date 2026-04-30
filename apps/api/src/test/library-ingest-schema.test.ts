import { readFileSync } from "node:fs";
import type {
  ImportCandidate,
  ImportCandidateFile,
  ImportCandidateFileDetail,
  ImportCandidateStatus,
  ImportFileRootKind,
  ImportFileProbeStatus,
  SongStatus
} from "@home-ktv/domain";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL("../db/migrations/0002_library_ingest_admin.sql", import.meta.url),
  "utf8"
);

describe("library ingest schema contracts", () => {
  it("adds Song.status with the formal catalog status values", () => {
    expect(migrationSql).toContain("ALTER TABLE songs");
    expect(migrationSql).toContain("ADD COLUMN IF NOT EXISTS status");
    expect(migrationSql).toContain("'ready'");
    expect(migrationSql).toContain("'review_required'");
    expect(migrationSql).toContain("'unavailable'");
  });

  it("creates import staging tables and the verified switch pair guard", () => {
    for (const expected of [
      "CREATE TABLE IF NOT EXISTS import_scan_runs",
      "CREATE TABLE IF NOT EXISTS import_files",
      "CREATE TABLE IF NOT EXISTS import_candidates",
      "CREATE TABLE IF NOT EXISTS import_candidate_files",
      "CREATE TABLE IF NOT EXISTS source_records",
      "assets_verified_switch_family_mode_uq"
    ]) {
      expect(migrationSql).toContain(expected);
    }
  });

  it("exports domain contracts for import review and candidate file details", () => {
    const songStatus = "ready" satisfies SongStatus;
    const candidateStatus = "pending" satisfies ImportCandidateStatus;
    const rootKind = "imports_pending" satisfies ImportFileRootKind;
    const probeStatus = "probed" satisfies ImportFileProbeStatus;

    const candidate = {} as ImportCandidate;
    const candidateFile = {} as ImportCandidateFile;
    const detail = {} as ImportCandidateFileDetail;

    expect([songStatus, candidateStatus, rootKind, probeStatus]).toEqual([
      "ready",
      "pending",
      "imports_pending",
      "probed"
    ]);
    expect(candidate).toBeDefined();
    expect(candidateFile).toBeDefined();
    expect(detail).toBeDefined();
  });
});
