import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { z } from "zod";

import { SourceRowSchema, SourceStatusSchema } from "./contracts.js";
import { resolveRunPath } from "./manifest.js";
import { buildCandidateSnapshot } from "./normalize/candidates.js";

export const HOT_SONGS_NORMALIZE_HELP =
  "Usage: pnpm hot-songs:normalize -- --source-rows <path> --out <dir> [--source-report <path>]";

export type NormalizeSourcesArgs = {
  sourceRowsPath: string | undefined;
  sourceReportPath: string | undefined;
  outDir: string | undefined;
  help: boolean;
};

const SourceRowsFileSchema = z.union([
  SourceRowSchema.array(),
  z.object({
    rows: SourceRowSchema.array()
  })
]);

const SourceReportFileSchema = z.union([
  SourceStatusSchema.array(),
  z.object({
    sources: SourceStatusSchema.array()
  })
]);

export function parseNormalizeSourcesArgs(
  argv: string[]
): NormalizeSourcesArgs {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: normalizedArgv,
    options: {
      "source-rows": { type: "string" },
      "source-report": { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" }
    }
  });

  return {
    sourceRowsPath: values["source-rows"],
    sourceReportPath: values["source-report"],
    outDir: values.out,
    help: values.help === true
  };
}

export async function runNormalizeSourcesCli(argv: string[]): Promise<number> {
  try {
    const args = parseNormalizeSourcesArgs(argv);
    if (args.help) {
      console.log(HOT_SONGS_NORMALIZE_HELP);
      return 0;
    }

    const runRoot = process.env.INIT_CWD ?? process.cwd();
    const sourceRowsPath = resolveRunPath(
      validateRequiredPath(args.sourceRowsPath, "--source-rows"),
      runRoot
    );
    const outDir = resolveRunPath(
      validateRequiredPath(args.outDir, "--out"),
      runRoot
    );
    const sourceReportPath =
      args.sourceReportPath === undefined
        ? undefined
        : resolveRunPath(args.sourceReportPath, runRoot);

    const rows = await readSourceRows(sourceRowsPath);
    const sourceStatuses =
      sourceReportPath === undefined
        ? undefined
        : await readSourceStatuses(sourceReportPath);
    const snapshot = buildCandidateSnapshot(
      sourceStatuses === undefined ? { rows } : { rows, sourceStatuses }
    );

    await mkdir(outDir, { recursive: true });
    await writeFile(
      join(outDir, "candidate-snapshot.json"),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8"
    );

    console.log(
      `Candidate normalization complete: ${snapshot.candidateCount} candidates from ${snapshot.sourceRowCount} source rows`
    );

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function validateRequiredPath(
  filePath: string | undefined,
  optionName: string
): string {
  if (filePath === undefined || filePath.length === 0) {
    throw new Error(`Missing required ${optionName} <path>`);
  }

  return filePath;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const fileContent = await readFile(filePath, "utf8");
  return JSON.parse(fileContent) as unknown;
}

async function readSourceRows(filePath: string) {
  const parsed = SourceRowsFileSchema.parse(await readJsonFile(filePath));
  return Array.isArray(parsed) ? parsed : parsed.rows;
}

async function readSourceStatuses(filePath: string) {
  const parsed = SourceReportFileSchema.parse(await readJsonFile(filePath));
  return Array.isArray(parsed) ? parsed : parsed.sources;
}

function isDirectRun(): boolean {
  return (
    process.argv[1] !== undefined &&
    pathToFileURL(process.argv[1]).href === import.meta.url
  );
}

if (isDirectRun()) {
  runNormalizeSourcesCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
