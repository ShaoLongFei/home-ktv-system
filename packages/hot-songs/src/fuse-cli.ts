import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { FusionAliasesSchema } from "./fuse/aliases.js";
import { buildFusionReport, type BuildFusionReportInput } from "./fuse/ranking.js";
import type { NearDuplicate, RankedSong } from "./fuse/contracts.js";
import { CandidateSnapshotSchema } from "./normalize/contracts.js";
import { loadSourceManifest, resolveRunPath } from "./manifest.js";

export const HOT_SONGS_FUSE_HELP =
  "Usage: pnpm hot-songs:fuse -- --manifest <path> --candidate-snapshot <path> --out <dir> [--aliases <path>]";

export type FuseArgs = {
  manifestPath: string | undefined;
  candidateSnapshotPath: string | undefined;
  aliasesPath: string | undefined;
  outDir: string | undefined;
  help: boolean;
};

export function parseFuseArgs(argv: string[]): FuseArgs {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: normalizedArgv,
    options: {
      manifest: { type: "string" },
      "candidate-snapshot": { type: "string" },
      aliases: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" }
    }
  });

  return {
    manifestPath: values.manifest,
    candidateSnapshotPath: values["candidate-snapshot"],
    aliasesPath: values.aliases,
    outDir: values.out,
    help: values.help === true
  };
}

export async function runFuseCli(argv: string[]): Promise<number> {
  try {
    const args = parseFuseArgs(argv);
    if (args.help) {
      console.log(HOT_SONGS_FUSE_HELP);
      return 0;
    }

    const runRoot = process.env.INIT_CWD ?? process.cwd();
    const manifestPath = resolveRunPath(
      validateRequiredPath(args.manifestPath, "--manifest"),
      runRoot
    );
    const candidateSnapshotPath = resolveRunPath(
      validateRequiredPath(args.candidateSnapshotPath, "--candidate-snapshot"),
      runRoot
    );
    const outDir = resolveRunPath(
      validateRequiredPath(args.outDir, "--out"),
      runRoot
    );
    const aliasesPath =
      args.aliasesPath === undefined
        ? undefined
        : resolveRunPath(args.aliasesPath, runRoot);

    const manifest = await loadSourceManifest(manifestPath);
    const candidateSnapshot = CandidateSnapshotSchema.parse(
      await readJsonFile(candidateSnapshotPath)
    );
    const aliases =
      aliasesPath === undefined
        ? undefined
        : FusionAliasesSchema.parse(await readJsonFile(aliasesPath));
    const reportInput: BuildFusionReportInput = {
      manifest,
      snapshot: candidateSnapshot
    };
    if (aliases !== undefined) {
      reportInput.aliases = aliases;
    }
    const report = buildFusionReport(reportInput);

    await mkdir(outDir, { recursive: true });
    await writeFile(
      join(outDir, "ranked-songs.csv"),
      serializeRankedSongsCsv(report.rankedSongs),
      "utf8"
    );
    await writeFile(
      join(outDir, "ranked-songs.audit.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      join(outDir, "near-duplicates.csv"),
      serializeNearDuplicatesCsv(report.nearDuplicates),
      "utf8"
    );

    console.log(
      `Fusion complete: ${report.rankedCount} ranked songs from ${report.candidateCount} candidates`
    );

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function serializeRankedSongsCsv(songs: RankedSong[]): string {
  return [
    ["rank", "title", "artist", "score"],
    ...songs.map((song) => [
      String(song.rank),
      song.title,
      song.artist,
      formatScore(song.score)
    ])
  ]
    .map((row) => row.map(escapeCsvField).join(","))
    .join("\n")
    .concat("\n");
}

export function serializeNearDuplicatesCsv(duplicates: NearDuplicate[]): string {
  return [
    ["left_title", "right_title", "artist", "similarity", "reason"],
    ...duplicates.map((duplicate) => [
      duplicate.leftTitle,
      duplicate.rightTitle,
      duplicate.artist,
      formatScore(duplicate.similarity),
      duplicate.reason
    ])
  ]
    .map((row) => row.map(escapeCsvField).join(","))
    .join("\n")
    .concat("\n");
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
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function formatScore(score: number): string {
  return score.toFixed(3).replace(/\.?0+$/u, "");
}

function escapeCsvField(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function isDirectRun(): boolean {
  return (
    process.argv[1] !== undefined &&
    pathToFileURL(process.argv[1]).href === import.meta.url
  );
}

if (isDirectRun()) {
  runFuseCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
