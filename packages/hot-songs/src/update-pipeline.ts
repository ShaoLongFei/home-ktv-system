import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  SourceManifest,
  SourceRow,
  SourceStatus
} from "./contracts.js";
import type { FusionAliases } from "./fuse/aliases.js";
import {
  serializeNearDuplicatesCsv,
  serializeRankedSongsCsv
} from "./fuse-cli.js";
import { buildFusionReport, type BuildFusionReportInput } from "./fuse/ranking.js";
import {
  buildCandidateSnapshot,
  type BuildCandidateSnapshotInput
} from "./normalize/candidates.js";
import { buildSourceHealthReport } from "./report/source-health.js";
import {
  collectSources,
  type CollectContext,
  type CollectSourcesResult
} from "./runner.js";
import {
  writeSourceCollectionArtifacts,
  type SourceCollectionArtifacts
} from "./source-artifacts.js";

export type HotSongsUpdateArtifacts = SourceCollectionArtifacts & {
  candidateSnapshotJson: string;
  rankedSongsCsv: string;
  rankedSongsAuditJson: string;
  nearDuplicatesCsv: string;
};

export type HotSongsUpdateCounts = {
  sourceRows: number;
  usableSources: number;
  candidates: number;
  rankedSongs: number;
  nearDuplicates: number;
};

export type HotSongsUpdateResult = {
  generatedAt: string;
  outDir: string;
  artifacts: HotSongsUpdateArtifacts;
  counts: HotSongsUpdateCounts;
};

export type RunHotSongsUpdateOptions = {
  manifest: SourceManifest;
  outDir: string;
  generatedAt?: string;
  aliases?: FusionAliases;
  sourceRows?: SourceRow[];
  sourceStatuses?: SourceStatus[];
  adapters?: CollectContext["adapters"];
  sourceIds?: readonly string[];
  runRoot?: string;
  timeoutMs?: number;
};

export function defaultHotSongsRunDir(date = new Date()): string {
  const timestamp = date.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/u, "Z");
  return `.planning/reports/hot-songs/run-${timestamp}`;
}

export async function runHotSongsUpdate(
  options: RunHotSongsUpdateOptions
): Promise<HotSongsUpdateResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const collection = await resolveCollection(options, generatedAt);

  const sourceArtifacts = await writeSourceCollectionArtifacts(options.outDir, {
    generatedAt: collection.generatedAt,
    rows: collection.rows,
    statuses: collection.statuses
  });

  // Stage 2 normalizes cross-platform spellings into stable candidate songs.
  const snapshotInput: BuildCandidateSnapshotInput = {
    rows: collection.rows,
    sourceStatuses: collection.statuses,
    generatedAt: collection.generatedAt
  };
  const candidateSnapshot = buildCandidateSnapshot(snapshotInput);
  const candidateSnapshotJson = join(options.outDir, "candidate-snapshot.json");
  await mkdir(options.outDir, { recursive: true });
  await writeFile(
    candidateSnapshotJson,
    `${JSON.stringify(candidateSnapshot, null, 2)}\n`,
    "utf8"
  );

  // Stage 3 keeps the public CSV compact and writes a richer audit file for debugging.
  const reportInput: BuildFusionReportInput = {
    manifest: options.manifest,
    snapshot: candidateSnapshot
  };
  if (options.aliases !== undefined) {
    reportInput.aliases = options.aliases;
  }
  const fusionReport = buildFusionReport(reportInput);
  const rankedSongsCsv = join(options.outDir, "ranked-songs.csv");
  const rankedSongsAuditJson = join(options.outDir, "ranked-songs.audit.json");
  const nearDuplicatesCsv = join(options.outDir, "near-duplicates.csv");

  await Promise.all([
    writeFile(rankedSongsCsv, serializeRankedSongsCsv(fusionReport.rankedSongs), "utf8"),
    writeFile(
      rankedSongsAuditJson,
      `${JSON.stringify(fusionReport, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      nearDuplicatesCsv,
      serializeNearDuplicatesCsv(fusionReport.nearDuplicates),
      "utf8"
    )
  ]);

  return {
    generatedAt: collection.generatedAt,
    outDir: options.outDir,
    artifacts: {
      ...sourceArtifacts,
      candidateSnapshotJson,
      rankedSongsCsv,
      rankedSongsAuditJson,
      nearDuplicatesCsv
    },
    counts: {
      sourceRows: collection.rows.length,
      usableSources: buildSourceHealthReport(collection).usableSourceCount,
      candidates: candidateSnapshot.candidateCount,
      rankedSongs: fusionReport.rankedCount,
      nearDuplicates: fusionReport.nearDuplicates.length
    }
  };
}

async function resolveCollection(
  options: RunHotSongsUpdateOptions,
  generatedAt: string
): Promise<CollectSourcesResult> {
  if (options.sourceRows !== undefined) {
    return {
      generatedAt,
      rows: filterUsableRows(options.sourceRows, options.sourceStatuses),
      statuses:
        options.sourceStatuses ??
        buildSyntheticStatuses(options.manifest, options.sourceRows, generatedAt)
    };
  }

  if (options.adapters === undefined) {
    throw new Error("Live collection requires adapters");
  }

  const context: CollectContext = {
    adapters: options.adapters,
    generatedAt
  };
  if (options.sourceIds !== undefined) {
    context.sourceIds = options.sourceIds;
  }
  if (options.runRoot !== undefined) {
    context.runRoot = options.runRoot;
  }
  if (options.timeoutMs !== undefined) {
    context.timeoutMs = options.timeoutMs;
  }

  // Stage 1 talks to source adapters. Keeping this here makes the CLI thin
  // and keeps tests able to inject deterministic adapters.
  return collectSources(options.manifest, context);
}

function filterUsableRows(
  rows: SourceRow[],
  statuses: SourceStatus[] | undefined
): SourceRow[] {
  if (statuses === undefined) {
    return rows;
  }

  const usableSourceIds = new Set(
    statuses.filter((status) => status.usable).map((status) => status.sourceId)
  );
  return rows.filter((row) => usableSourceIds.has(row.sourceId));
}

function buildSyntheticStatuses(
  manifest: SourceManifest,
  rows: SourceRow[],
  generatedAt: string
): SourceStatus[] {
  return manifest.sources.map((source) => {
    const rowCount = rows.filter((row) => row.sourceId === source.id).length;
    return {
      sourceId: source.id,
      status: rowCount > 0 ? "succeeded" : "skipped",
      usable: rowCount > 0,
      rowCount,
      targetRows: source.targetRows,
      minRows: source.minRows ?? source.expectedMinRows,
      platformCapRows: source.platformCapRows,
      authCookieEnv: source.authCookieEnv,
      authUsed:
        source.authCookieEnv === undefined
          ? undefined
          : (process.env[source.authCookieEnv]?.length ?? 0) > 0,
      warnings: rowCount > 0 ? [] : ["source-not-present-in-external-rows"],
      startedAt: generatedAt,
      finishedAt: generatedAt
    };
  });
}
