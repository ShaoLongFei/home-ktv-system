import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  collectKugouRankHtmlSource,
  parseKugouRankHtmlRows
} from "./adapters/kugou-rank-html.js";
import {
  collectHolidayKtvRankSource,
  parseHolidayKtvRankRows
} from "./adapters/holiday-ktv-rank.js";
import { collectManualJsonSource } from "./adapters/manual-json.js";
import {
  collectNeteaseToplistHtmlSource,
  parseNeteaseToplistHtmlRows
} from "./adapters/netease-toplist-html.js";
import {
  collectQqToplistSource,
  parseQqToplistRows
} from "./adapters/qq-toplist.js";
import {
  collectSilverboxRankSource,
  parseSilverboxRankRows
} from "./adapters/silverbox-rank-html.js";
import {
  collectSpotifyPlaylistSource,
  parseSpotifyPlaylistRows
} from "./adapters/spotify-playlist.js";
import {
  collectTencentMusicYobangSource,
  parseTencentMusicYobangRows
} from "./adapters/tencent-music-yobang.js";
import {
  collectVvMusicRankSource,
  parseVvMusicRankRows
} from "./adapters/vv-music-rank-html.js";
import type { SourceDefinition, SourceRow, SourceStatus } from "./contracts.js";
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
  "Usage: pnpm hot-songs:sources -- --manifest <path> --out <dir> [--fixture]";

const proxyBypassHosts = ["music.163.com", "www.51vv.com"];

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

    applyProxyBypassHosts(proxyBypassHosts);

    const runRoot = process.env.INIT_CWD ?? process.cwd();
    const manifestPath = resolveRunPath(
      validateManifestPath(args.manifestPath),
      runRoot
    );
    const outDir = resolveRunPath(validateOutDirPath(args.outDir), runRoot);
    const manifest = await loadSourceManifest(manifestPath);

    try {
      const result = await collectSources(manifest, {
        adapters: buildAdapters({ fixture: args.fixture, runRoot }),
        sourceIds: args.sourceIds,
        runRoot,
        timeoutMs: args.timeoutMs
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

function applyProxyBypassHosts(hosts: readonly string[]): void {
  const bypassHosts = new Set(
    [
      ...(process.env.NO_PROXY ?? process.env.no_proxy ?? "")
        .split(",")
        .map((host) => host.trim())
        .filter((host) => host.length > 0),
      ...hosts
    ].filter((host) => host.length > 0)
  );

  const merged = [...bypassHosts].join(",");
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

function buildAdapters(options: {
  fixture: boolean;
  runRoot: string;
}): CollectContext["adapters"] {
  if (options.fixture) {
    return {
      manual_json: collectManualJsonSource,
      qq_toplist: async (source, context) =>
        expandFixtureRows(
          source,
          parseQqToplistRows(
            source,
            await readFixtureHtml(options.runRoot, fixtureFileForSource(source.id)),
            context.generatedAt ?? new Date().toISOString()
          )
        ),
      kugou_rank_html: async (source, context) =>
        expandFixtureRows(
          source,
          parseKugouRankHtmlRows(
            source,
            await readFixtureHtml(options.runRoot, "kugou-rank-home.fixture.html"),
            context.generatedAt ?? new Date().toISOString()
          )
        ),
      netease_toplist_html: async (source, context) =>
        expandFixtureRows(
          source,
          parseNeteaseToplistHtmlRows(
            source,
            await readFixtureHtml(options.runRoot, "netease-toplist.fixture.html"),
            context.generatedAt ?? new Date().toISOString()
          )
        ),
      tencent_music_yobang: async (source, context) =>
        expandFixtureRows(
          source,
          parseTencentMusicYobangRows(
            source,
            buildTencentMusicFixtureHtml(),
            context.generatedAt ?? new Date().toISOString()
          )
        ),
      spotify_playlist: async (source, context) =>
        expandFixtureRows(
          source,
          parseSpotifyPlaylistRows(
            source,
            await readFixtureHtml(options.runRoot, "spotify-playlist.fixture.html"),
            context.generatedAt ?? new Date().toISOString()
          )
        ),
      holiday_ktv_rank: async (source, context) =>
        expandFixtureRows(
          source,
          parseHolidayKtvRankRows(
            source,
            JSON.parse(
              await readFixtureHtml(options.runRoot, "holiday-ktv-rank.fixture.json")
            ) as unknown,
            context.generatedAt ?? new Date().toISOString()
          )
        ),
      silverbox_rank_html: async (source, context) =>
        expandFixtureRows(
          source,
          parseSilverboxRankRows(
            source,
            await readFixtureHtml(options.runRoot, "silverbox-rank.fixture.html"),
            context.generatedAt ?? new Date().toISOString()
          )
        ),
      vv_music_rank_html: async (source, context) =>
        expandFixtureRows(
          source,
          parseVvMusicRankRows(
            source,
            await readFixtureHtml(options.runRoot, "vv-ktv-rank.fixture.html"),
            context.generatedAt ?? new Date().toISOString()
          )
        )
    };
  }

  return {
    manual_json: collectManualJsonSource,
    qq_toplist: collectQqToplistSource,
    kugou_rank_html: collectKugouRankHtmlSource,
    netease_toplist_html: collectNeteaseToplistHtmlSource,
    tencent_music_yobang: collectTencentMusicYobangSource,
    spotify_playlist: collectSpotifyPlaylistSource,
    holiday_ktv_rank: collectHolidayKtvRankSource,
    silverbox_rank_html: collectSilverboxRankSource,
    vv_music_rank_html: collectVvMusicRankSource
  };
}

async function readFixtureHtml(
  runRoot: string,
  fixtureFile: string
): Promise<string> {
  return readFile(
    resolveRunPath(`packages/hot-songs/fixtures/html/${fixtureFile}`, runRoot),
    "utf8"
  );
}

function fixtureFileForSource(sourceId: string): string {
  if (sourceId.startsWith("qq-")) {
    return "qq-kge-toplist.fixture.html";
  }

  throw new Error(`No fixture HTML configured for ${sourceId}`);
}

function expandFixtureRows(
  source: SourceDefinition,
  rows: SourceRow[]
): SourceRow[] {
  const targetRowCount = source.platformCapRows ?? source.targetRows;
  if (rows.length === 0 || rows.length >= targetRowCount) {
    return rows.slice(0, targetRowCount);
  }

  return Array.from({ length: targetRowCount }, (_, index) => {
    const baseRow = rows[index % rows.length] as SourceRow;
    const cycle = Math.floor(index / rows.length);

    return {
      ...baseRow,
      sourceId: source.id,
      sourceType: source.sourceType,
      provider: source.provider,
      rank: index + 1,
      rawTitle:
        cycle === 0 ? baseRow.rawTitle : `${baseRow.rawTitle} Fixture ${cycle + 1}`,
      sourceUrl: source.url ?? source.urls?.[0] ?? baseRow.sourceUrl
    };
  });
}

function buildTencentMusicFixtureHtml(): string {
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        issueStart: "2026-05-11 00:00:00",
        chartsList: [
          { rank: 1, songName: "星昼", singerName: "周深" },
          { rank: 2, songName: "后来", singerName: "刘若英" },
          { rank: 3, songName: "Run Wild（向风而野）", singerName: "是晚星呀" }
        ]
      }
    }
  })}</script>`;
}

async function writeRunArtifacts(
  outDir: string,
  result: CollectSourcesResult
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeSourceRows(outDir, result.generatedAt, result.rows);
  await writePerSourceRows(outDir, result.generatedAt, result.rows, result.statuses);
  await writeSourceReport(
    outDir,
    buildSourceHealthReport({
      generatedAt: result.generatedAt,
      rows: result.rows,
      statuses: result.statuses
    })
  );
}

async function writePerSourceRows(
  outDir: string,
  generatedAt: string,
  rows: SourceRow[],
  statuses: SourceStatus[]
): Promise<void> {
  const sourcesDir = join(outDir, "sources");
  await mkdir(sourcesDir, { recursive: true });

  await Promise.all(
    statuses.map((status) => {
      const sourceRows = rows.filter((row) => row.sourceId === status.sourceId);
      return writeFile(
        join(sourcesDir, `${status.sourceId}.json`),
        `${JSON.stringify(
          {
            schemaVersion: "hot-songs.source-file.v1",
            generatedAt,
            sourceId: status.sourceId,
            rowCount: sourceRows.length,
            rows: sourceRows
          },
          null,
          2
        )}\n`,
        "utf8"
      );
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
