import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  applyProxyBypassHosts,
  buildAdapters,
  proxyBypassHosts
} from "./cli.js";
import { FusionAliasesSchema } from "./fuse/aliases.js";
import { loadSourceManifest, readJsonFile, resolveRunPath } from "./manifest.js";
import {
  readSourceReportFile,
  readSourceRowsFile
} from "./source-files.js";
import {
  defaultHotSongsRunDir,
  runHotSongsUpdate,
  type RunHotSongsUpdateOptions
} from "./update-pipeline.js";

const defaultManifestPath = "packages/hot-songs/config/sources.example.json";

export const HOT_SONGS_UPDATE_HELP = [
  "Usage: pnpm hot-songs:update -- [--manifest <path>] [--out <dir>] [options]",
  "",
  "Runs source collection, normalization, and fusion into one output directory.",
  "",
  "Options:",
  "  --manifest <path>       Source manifest. Defaults to packages/hot-songs/config/sources.example.json",
  "  --out <dir>             Output directory. Defaults to .planning/reports/hot-songs/run-<timestamp>",
  "  --timeout-ms <ms>       Per-source fetch timeout. Defaults to 10000",
  "  --source <id>           Limit live collection to one source. Repeatable",
  "  --aliases <path>        Optional title/artist alias JSON for fusion",
  "  --source-rows <path>    Use externally collected source rows instead of live collection",
  "  --source-report <path>  Optional source health report for external rows",
  "  --fixture               Use bundled fixture data for deterministic local checks",
  "  -h, --help              Show this help"
].join("\n");

export type UpdateArgs = {
  manifestPath: string | undefined;
  outDir: string | undefined;
  timeoutMs: number;
  sourceIds: string[];
  aliasesPath: string | undefined;
  sourceRowsPath: string | undefined;
  sourceReportPath: string | undefined;
  fixture: boolean;
  help: boolean;
};

export function parseUpdateArgs(argv: string[]): UpdateArgs {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: normalizedArgv,
    options: {
      manifest: { type: "string" },
      out: { type: "string" },
      "timeout-ms": { type: "string", default: "10000" },
      source: { type: "string", multiple: true },
      aliases: { type: "string" },
      "source-rows": { type: "string" },
      "source-report": { type: "string" },
      fixture: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });

  return {
    manifestPath: values.manifest,
    outDir: values.out,
    timeoutMs: Number.parseInt(values["timeout-ms"] ?? "10000", 10),
    sourceIds: values.source ?? [],
    aliasesPath: values.aliases,
    sourceRowsPath: values["source-rows"],
    sourceReportPath: values["source-report"],
    fixture: values.fixture === true,
    help: values.help === true
  };
}

export async function runUpdateCli(argv: string[]): Promise<number> {
  try {
    const args = parseUpdateArgs(argv);
    if (args.help) {
      console.log(HOT_SONGS_UPDATE_HELP);
      return 0;
    }

    applyProxyBypassHosts(proxyBypassHosts);

    const runRoot = process.env.INIT_CWD ?? process.cwd();
    const manifestPath = resolveRunPath(
      args.manifestPath ?? defaultManifestPath,
      runRoot
    );
    const outDir = resolveRunPath(args.outDir ?? defaultHotSongsRunDir(), runRoot);
    const aliasesPath =
      args.aliasesPath === undefined
        ? undefined
        : resolveRunPath(args.aliasesPath, runRoot);
    const sourceRowsPath =
      args.sourceRowsPath === undefined
        ? undefined
        : resolveRunPath(args.sourceRowsPath, runRoot);
    const sourceReportPath =
      args.sourceReportPath === undefined
        ? undefined
        : resolveRunPath(args.sourceReportPath, runRoot);

    const manifest = await loadSourceManifest(manifestPath);
    const aliases =
      aliasesPath === undefined
        ? undefined
        : FusionAliasesSchema.parse(await readJsonFile(aliasesPath));
    const sourceRowsFile =
      sourceRowsPath === undefined
        ? undefined
        : await readSourceRowsFile(sourceRowsPath);
    const sourceReportFile =
      sourceReportPath === undefined
        ? undefined
        : await readSourceReportFile(sourceReportPath);

    const updateOptions: RunHotSongsUpdateOptions = {
      manifest,
      outDir,
      runRoot,
      timeoutMs: args.timeoutMs
    };
    if (aliases !== undefined) {
      updateOptions.aliases = aliases;
    }
    if (sourceRowsFile !== undefined) {
      updateOptions.sourceRows = sourceRowsFile.rows;
    }
    if (sourceReportFile !== undefined) {
      updateOptions.sourceStatuses = sourceReportFile.sources;
    }

    const generatedAt = sourceReportFile?.generatedAt ?? sourceRowsFile?.generatedAt;
    if (generatedAt !== undefined) {
      updateOptions.generatedAt = generatedAt;
    }
    if (sourceRowsFile === undefined) {
      updateOptions.adapters = buildAdapters({ fixture: args.fixture, runRoot });
    }
    if (args.sourceIds.length > 0) {
      updateOptions.sourceIds = args.sourceIds;
    }

    const result = await runHotSongsUpdate(updateOptions);

    console.log(
      `Hot songs update complete: ${result.counts.rankedSongs} ranked songs from ${result.counts.sourceRows} source rows`
    );
    console.log(`CSV: ${result.artifacts.rankedSongsCsv}`);
    console.log(`Audit: ${result.artifacts.rankedSongsAuditJson}`);

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function isDirectRun(): boolean {
  return (
    process.argv[1] !== undefined &&
    pathToFileURL(process.argv[1]).href === import.meta.url
  );
}

if (isDirectRun()) {
  runUpdateCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
