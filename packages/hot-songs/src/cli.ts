import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { collectManualJsonSource } from "./adapters/manual-json.js";
import type { SourceRow } from "./contracts.js";
import { loadSourceManifest, resolveRunPath, validateManifestPath } from "./manifest.js";
import { buildSourceHealthReport, writeSourceReport } from "./report/source-health.js";
import {
  collectSources,
  CollectSourcesError,
  type CollectContext,
  type CollectSourcesResult,
  type SourceAdapter
} from "./runner.js";

export const HOT_SONGS_SOURCES_HELP =
  "Usage: pnpm hot-songs:sources -- --manifest <path> --out <dir>";

export type CollectSourcesArgs = {
  manifestPath: string | undefined;
  outDir: string | undefined;
  timeoutMs: number;
  sourceIds: string[];
  fixture: boolean;
  help: boolean;
};

export function parseCollectSourcesArgs(argv: string[]): CollectSourcesArgs {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: normalizedArgv,
    options: {
      manifest: { type: "string" },
      out: { type: "string" },
      "timeout-ms": { type: "string", default: "10000" },
      source: { type: "string", multiple: true },
      fixture: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });

  return {
    manifestPath: values.manifest,
    outDir: values.out,
    timeoutMs: Number.parseInt(values["timeout-ms"] ?? "10000", 10),
    sourceIds: values.source ?? [],
    fixture: values.fixture === true,
    help: values.help === true
  };
}

export async function runCollectSourcesCli(argv: string[]): Promise<number> {
  try {
    const args = parseCollectSourcesArgs(argv);
    if (args.help) {
      console.log(HOT_SONGS_SOURCES_HELP);
      return 0;
    }

    const runRoot = process.env.INIT_CWD ?? process.cwd();
    const manifestPath = resolveRunPath(
      validateManifestPath(args.manifestPath),
      runRoot
    );
    const outDir = resolveRunPath(validateOutDirPath(args.outDir), runRoot);
    const manifest = await loadSourceManifest(manifestPath);

    try {
      const result = await collectSources(manifest, {
        adapters: buildAdapters(),
        sourceIds: args.sourceIds,
        runRoot
      });
      await writeRunArtifacts(outDir, result);

      const report = buildSourceHealthReport({
        generatedAt: result.generatedAt,
        rows: result.rows,
        statuses: result.statuses
      });
      console.log(
        `Source collection complete: ${report.totalRows} rows from ${report.usableSourceCount} usable sources`
      );

      return 0;
    } catch (error) {
      if (error instanceof CollectSourcesError) {
        await writeRunArtifacts(outDir, error.result);
      }

      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function validateOutDirPath(outDir: string | undefined): string {
  if (outDir === undefined || outDir.length === 0) {
    throw new Error("Missing required --out <dir>");
  }

  return outDir;
}

function buildAdapters(): CollectContext["adapters"] {
  const notImplementedAdapter: SourceAdapter = async (source) => {
    throw new Error(`Adapter ${source.adapter} is not implemented in this plan`);
  };

  return {
    manual_json: collectManualJsonSource,
    qq_toplist: notImplementedAdapter,
    kugou_rank_html: notImplementedAdapter,
    netease_toplist_html: notImplementedAdapter
  };
}

async function writeRunArtifacts(
  outDir: string,
  result: CollectSourcesResult
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeSourceRows(outDir, result.generatedAt, result.rows);
  await writeSourceReport(
    outDir,
    buildSourceHealthReport({
      generatedAt: result.generatedAt,
      rows: result.rows,
      statuses: result.statuses
    })
  );
}

async function writeSourceRows(
  outDir: string,
  generatedAt: string,
  rows: SourceRow[]
): Promise<void> {
  await writeFile(
    join(outDir, "source-rows.json"),
    `${JSON.stringify(
      {
        schemaVersion: "hot-songs.source-rows.v1",
        generatedAt,
        rows
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function isDirectRun(): boolean {
  return (
    process.argv[1] !== undefined &&
    pathToFileURL(process.argv[1]).href === import.meta.url
  );
}

if (isDirectRun()) {
  runCollectSourcesCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
