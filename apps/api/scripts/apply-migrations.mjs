#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "pg";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT_DIR, "src", "db", "migrations");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const MIGRATION_FILES = (await readMigrations()).sort((left, right) => left.localeCompare(right));

if (import.meta.url === pathToScriptUrl(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

async function main() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedRows = await client.query("SELECT filename FROM schema_migrations ORDER BY filename");
    const applied = new Set(appliedRows.rows.map((row) => row.filename));

    for (const file of MIGRATION_FILES) {
      if (applied.has(file)) {
        process.stdout.write(`Skipping ${file}\n`);
        continue;
      }

      if (await isMigrationAlreadyApplied(client, file)) {
        process.stdout.write(`Skipping ${file} (already applied)\n`);
        await markMigrationApplied(client, file);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`Applying ${file}\n`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      await markMigrationApplied(client, file);
    }
  } finally {
    await client.end();
  }
}

async function readMigrations() {
  return (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql"));
}

async function markMigrationApplied(client, filename) {
  await client.query(
    `INSERT INTO schema_migrations (filename)
     VALUES ($1)
     ON CONFLICT (filename) DO NOTHING`,
    [filename]
  );
}

async function isMigrationAlreadyApplied(client, filename) {
  switch (filename) {
    case "0001_media_contract.sql":
      return hasConstraint(client, "songs_default_asset_fk");
    case "0002_library_ingest_admin.sql":
      return (
        (await hasTable(client, "import_candidates")) &&
        (await hasColumn(client, "songs", "status")) &&
        (await hasTable(client, "import_scan_runs"))
      );
    case "0003_room_sessions_control.sql":
      return (await hasTable(client, "control_sessions")) && (await hasTable(client, "control_commands"));
    case "0004_queue_commands.sql":
      return await hasColumn(client, "queue_entries", "removed_at");
    default:
      return false;
  }
}

async function hasTable(client, tableName) {
  const result = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`]
  );
  return Boolean(result.rows[0]?.exists);
}

async function hasColumn(client, tableName, columnName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [tableName, columnName]
  );
  return Boolean(result.rows[0]?.exists);
}

async function hasConstraint(client, constraintName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = $1
     ) AS exists`,
    [constraintName]
  );
  return Boolean(result.rows[0]?.exists);
}

function pathToScriptUrl(scriptPath) {
  return pathToFileURL(path.resolve(scriptPath ?? "")).href;
}
