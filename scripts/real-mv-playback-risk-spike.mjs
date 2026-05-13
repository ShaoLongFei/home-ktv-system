#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const UNSUPPORTED_SWITCH_MESSAGE = "current device does not support audio-track switching";
const SAMPLE_REQUIRED_MESSAGE = "Phase 16 local hardening report requires both --sample-mkv and --sample-mpg sample files";
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_SAMPLE_PATHS = {
  mkv: "songs-sample/关喆-想你的夜(MTV)-国语-流行.mkv",
  mpg: "songs-sample/蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg"
};

export async function main(argv = process.argv.slice(2), io = process) {
  const args = parseArgs(argv);
  if (args.help) {
    io.stdout.write(`${usage()}\n`);
    return 0;
  }

  const sampleResolution = await resolveSamples(args, process.env);
  if (!sampleResolution.ok) {
    io.stderr.write(`${sampleResolution.message}\n`);
    return 1;
  }

  const browser = await inspectBrowserCapabilities();
  const controlledNote = await tryGenerateControlledFixtures();
  const sections = [
    buildSampleSection({
      heading: "Controlled fixture - MKV sample",
      contentType: "video/x-matroska",
      browser,
      fixtureNote: controlledNote,
      summary: defaultSummary("matroska,webm")
    }),
    buildSampleSection({
      heading: "Controlled fixture - MPEG sample",
      contentType: "video/mpeg",
      browser,
      fixtureNote: controlledNote,
      summary: defaultSummary("mpeg")
    })
  ];

  if (sampleResolution.mode === "local") {
    const indexCrossCheck = await buildIndexCrossCheck(args.databaseUrl, sampleResolution);
    sections.push(
      buildLocalHardeningSection({ sampleResolution, indexCrossCheck }),
      buildSampleSection({
        heading: "Real sample - MKV sample",
        contentType: "video/x-matroska",
        browser,
        summary: await probeSampleSummary(sampleResolution.mkvPath, "matroska,webm")
      }),
      buildSampleSection({
        heading: "Real sample - MPEG sample",
        contentType: "video/mpeg",
        browser,
        summary: await probeSampleSummary(sampleResolution.mpgPath, "mpeg")
      }),
      buildIndexCrossCheckSection(indexCrossCheck)
    );
  }

  const report = [
    "# Phase 16 Real MV Playback Hardening Report",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Browser capability",
    "",
    `- canPlayType video/x-matroska: ${browser.canPlayTypes["video/x-matroska"]}`,
    `- canPlayType video/mpeg: ${browser.canPlayTypes["video/mpeg"]}`,
    `- hasAudioTracksApi: ${browser.hasAudioTracksApi}`,
    `- audioTrackSwitchMessage: ${browser.hasAudioTracksApi ? "none" : UNSUPPORTED_SWITCH_MESSAGE}`,
    browser.note ? `- note: ${browser.note}` : null,
    "",
    ...sections.flat()
  ].filter((line) => line !== null).join("\n");

  const output = args.output ?? path.join(process.cwd(), "real-mv-playback-risk-spike.md");
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, report, "utf8");
  io.stdout.write(`${path.resolve(output)}\n`);
  return 0;
}

function usage() {
  return `Real MV playback-risk spike

Usage:
  pnpm real-mv:risk-spike -- --controlled-only --output <report.md>
  pnpm real-mv:risk-spike -- --sample-mkv <sample.mkv> --sample-mpg <sample.mpg|sample.mpeg> --output <report.md>
  MEDIA_ROOT=/media/library pnpm real-mv:risk-spike -- --output <report.md>

Options:
  --help                 Show this help
  --controlled-only      Run controlled fixture checks without local samples
  --media-root <path>    Root that contains the default songs-sample files
  --sample-mkv <path>    Local MKV representative sample path
  --sample-mpg <path>    Local MPG/MPEG representative sample path
  --database-url <url>   Optional Postgres URL for read-only catalog index cross-check
  --mkv <path>           Backward-compatible alias for --sample-mkv
  --mpeg <path>          Backward-compatible alias for --sample-mpg
  --output <path>        Markdown report path`;
}

function parseArgs(argv) {
  const args = {
    controlledOnly: false,
    help: false,
    mediaRoot: null,
    sampleMkv: null,
    sampleMpg: null,
    databaseUrl: null,
    output: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--controlled-only") args.controlledOnly = true;
    else if (arg === "--media-root") args.mediaRoot = argv[++index] ?? null;
    else if (arg === "--sample-mkv" || arg === "--mkv") args.sampleMkv = argv[++index] ?? null;
    else if (arg === "--sample-mpg" || arg === "--mpeg") args.sampleMpg = argv[++index] ?? null;
    else if (arg === "--database-url") args.databaseUrl = argv[++index] ?? null;
    else if (arg === "--output") args.output = argv[++index] ?? null;
  }
  return args;
}

async function resolveSamples(args, env) {
  if (args.controlledOnly) {
    return { ok: true, mode: "controlled-only" };
  }

  if (args.sampleMkv || args.sampleMpg) {
    if (!(await isFile(args.sampleMkv)) || !(await isFile(args.sampleMpg))) {
      return { ok: false, message: SAMPLE_REQUIRED_MESSAGE };
    }
    return {
      ok: true,
      mode: "local",
      source: "explicit",
      mkvPath: path.resolve(args.sampleMkv),
      mpgPath: path.resolve(args.sampleMpg)
    };
  }

  const mediaRoot = (args.mediaRoot ?? env.MEDIA_ROOT ?? "").trim();
  if (mediaRoot) {
    const resolvedRoot = path.resolve(mediaRoot);
    const mkvPath = resolveUnderMediaRoot(resolvedRoot, DEFAULT_SAMPLE_PATHS.mkv);
    const mpgPath = resolveUnderMediaRoot(resolvedRoot, DEFAULT_SAMPLE_PATHS.mpg);
    const missing = [];
    if (!(await isFile(mkvPath))) missing.push(DEFAULT_SAMPLE_PATHS.mkv);
    if (!(await isFile(mpgPath))) missing.push(DEFAULT_SAMPLE_PATHS.mpg);
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Missing default local sample file: ${missing.join(", ")} under ${resolvedRoot}`
      };
    }
    return {
      ok: true,
      mode: "local",
      source: "media-root",
      mediaRoot: resolvedRoot,
      mkvPath,
      mpgPath
    };
  }

  return { ok: true, mode: "controlled-fixtures" };
}

function resolveUnderMediaRoot(mediaRoot, relativePath) {
  return path.join(mediaRoot, ...relativePath.split("/"));
}

async function isFile(filePath) {
  if (!filePath) return false;
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function inspectBrowserCapabilities() {
  const chromeBin = process.env.CHROME_BIN?.trim() || DEFAULT_CHROME;
  try {
    await access(chromeBin, constants.X_OK);
  } catch {
    return {
      canPlayTypes: { "video/x-matroska": "", "video/mpeg": "" },
      hasAudioTracksApi: false,
      note: "Chrome capability check skipped: Chrome unavailable"
    };
  }

  const script = "const v=document.createElement('video');document.body.innerText=JSON.stringify({matroska:v.canPlayType('video/x-matroska'),mpeg:v.canPlayType('video/mpeg'),hasAudioTracksApi:'audioTracks' in v});";
  const url = `data:text/html,<script>${encodeURIComponent(script)}</script>`;
  const result = await spawnCapture(chromeBin, ["--headless=new", "--disable-gpu", "--dump-dom", url]);
  if (result.code !== 0) {
    return {
      canPlayTypes: { "video/x-matroska": "", "video/mpeg": "" },
      hasAudioTracksApi: false,
      note: "Chrome capability check skipped: Chrome returned an error"
    };
  }

  const match = /\{.*\}/u.exec(result.stdout);
  if (!match) {
    return {
      canPlayTypes: { "video/x-matroska": "", "video/mpeg": "" },
      hasAudioTracksApi: false,
      note: "Chrome capability check skipped: no JSON result"
    };
  }
  const payload = JSON.parse(match[0]);
  return {
    canPlayTypes: {
      "video/x-matroska": normalizeCanPlayType(payload.matroska),
      "video/mpeg": normalizeCanPlayType(payload.mpeg)
    },
    hasAudioTracksApi: payload.hasAudioTracksApi === true,
    note: null
  };
}

async function tryGenerateControlledFixtures() {
  const result = await spawnCapture("ffmpeg", ["-version"]);
  if (result.code !== 0) {
    return "controlled fixture generation skipped: ffmpeg unavailable";
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "real-mv-controlled-"));
  return `controlled fixture workspace: ${tempDir}`;
}

async function probeSampleSummary(samplePath, fallbackContainer) {
  const ffprobe = await spawnCapture("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    samplePath
  ]);
  if (ffprobe.code !== 0) {
    return defaultSummary(fallbackContainer);
  }

  const payload = JSON.parse(ffprobe.stdout || "{}");
  const stats = await stat(samplePath);
  const streams = Array.isArray(payload.streams) ? payload.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audioTracks = streams
    .filter((stream) => stream.codec_type === "audio")
    .map((stream, fallbackIndex) => ({
      index: typeof stream.index === "number" ? stream.index : fallbackIndex,
      id: typeof stream.id === "string" && stream.id ? stream.id : `stream-${typeof stream.index === "number" ? stream.index : fallbackIndex}`,
      label: stream.tags?.title ?? stream.tags?.handler_name ?? `Audio ${fallbackIndex + 1}`,
      language: stream.tags?.language ?? null,
      codec: stream.codec_name ?? null,
      channels: typeof stream.channels === "number" ? stream.channels : null
    }));

  return {
    container: payload.format?.format_name ?? fallbackContainer,
    durationMs: parseDurationMs(payload.format?.duration),
    videoCodec: video?.codec_name ?? null,
    resolution: typeof video?.width === "number" && typeof video.height === "number" ? { width: video.width, height: video.height } : null,
    fileSizeBytes: stats.size,
    audioTracks
  };
}

function buildSampleSection({ heading, contentType, browser, summary, fixtureNote = null }) {
  const trackRoles = {
    original: summary.audioTracks[0] ? { index: summary.audioTracks[0].index, id: summary.audioTracks[0].id, label: summary.audioTracks[0].label } : null,
    instrumental: summary.audioTracks[1] ? { index: summary.audioTracks[1].index, id: summary.audioTracks[1].id, label: summary.audioTracks[1].label } : null
  };
  const canPlayType = browser.canPlayTypes[contentType] ?? "";
  const compatibility = evaluateCompatibility({ summary, trackRoles, currentWebCanPlayType: canPlayType });
  const reasonsJson = JSON.stringify(compatibility.compatibilityReasons);

  return [
    `## ${heading}`,
    "",
    fixtureNote ? `- fixture: ${fixtureNote}` : null,
    `- canPlayType: ${canPlayType}`,
    `- hasAudioTracksApi: ${browser.hasAudioTracksApi}`,
    `- audioTrackSwitchMessage: ${browser.hasAudioTracksApi ? "none" : UNSUPPORTED_SWITCH_MESSAGE}`,
    `- compatibilityStatus: ${compatibility.compatibilityStatus}`,
    `- compatibilityReasons: ${reasonsJson}`,
    ""
  ].filter((line) => line !== null);
}

function buildLocalHardeningSection({ sampleResolution, indexCrossCheck }) {
  return [
    "## Local hardening samples",
    "",
    `- sampleSource: ${sampleResolution.source === "explicit" ? "explicit sample paths" : "default sample paths"}`,
    sampleResolution.mediaRoot ? `- mediaRoot: ${sampleResolution.mediaRoot}` : null,
    `- sampleMkvPath: ${sampleResolution.mkvPath}`,
    `- sampleMkvFilename: ${path.basename(sampleResolution.mkvPath)}`,
    `- sampleMpgPath: ${sampleResolution.mpgPath}`,
    `- sampleMpgFilename: ${path.basename(sampleResolution.mpgPath)}`,
    indexCrossCheck.status === "skipped" ? "- index cross-check skipped" : "- index cross-check requested",
    ""
  ].filter((line) => line !== null);
}

async function buildIndexCrossCheck(databaseUrl, sampleResolution) {
  if (!databaseUrl) {
    return { status: "skipped" };
  }

  let client = null;
  try {
    const pg = await import("pg");
    const Client = pg.Client ?? pg.default?.Client;
    if (!Client) {
      return { status: "unavailable", reason: "pg Client export unavailable" };
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();

    const songs = await countTable(client, "songs");
    const assets = await countTable(client, "assets");
    const sourceRecords = await countTable(client, "source_records");
    const matches = await findAssetMatches(client, sampleResolution);

    return { status: "ok", songs, assets, sourceRecords, matches };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  } finally {
    if (client) {
      await client.end().catch(() => undefined);
    }
  }
}

async function countTable(client, tableName) {
  try {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
    return typeof result.rows[0]?.count === "number" ? result.rows[0].count : Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}

async function findAssetMatches(client, sampleResolution) {
  try {
    const candidatePaths = [
      sampleResolution.mkvPath,
      sampleResolution.mpgPath,
      DEFAULT_SAMPLE_PATHS.mkv,
      DEFAULT_SAMPLE_PATHS.mpg
    ];
    const filenamePatterns = [
      `%${path.basename(sampleResolution.mkvPath)}`,
      `%${path.basename(sampleResolution.mpgPath)}`
    ];
    const result = await client.query(
      `SELECT file_path, display_name, compatibility_status
       FROM assets
       WHERE file_path = ANY($1::text[]) OR file_path LIKE ANY($2::text[])
       ORDER BY updated_at DESC
       LIMIT 10`,
      [candidatePaths, filenamePatterns]
    );
    return result.rows.map((row) => ({
      filePath: row.file_path,
      displayName: row.display_name,
      compatibilityStatus: row.compatibility_status
    }));
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}

function buildIndexCrossCheckSection(indexCrossCheck) {
  if (indexCrossCheck.status === "skipped") {
    return [];
  }
  if (indexCrossCheck.status !== "ok") {
    return [
      "## Index cross-check",
      "",
      "- status: unavailable",
      `- reason: ${indexCrossCheck.reason}`,
      ""
    ];
  }

  const matchLines = Array.isArray(indexCrossCheck.matches) && indexCrossCheck.matches.length > 0
    ? indexCrossCheck.matches.map((match) => `- match: ${match.filePath} (${match.compatibilityStatus})`)
    : ["- matches: none"];
  return [
    "## Index cross-check",
    "",
    "- status: ok",
    `- songs: ${formatCount(indexCrossCheck.songs)}`,
    `- assets: ${formatCount(indexCrossCheck.assets)}`,
    `- sourceRecords: ${formatCount(indexCrossCheck.sourceRecords)}`,
    ...matchLines,
    ""
  ];
}

function formatCount(value) {
  if (typeof value === "number") return String(value);
  return `unavailable (${value.unavailable})`;
}

function evaluateCompatibility({ summary, trackRoles, currentWebCanPlayType }) {
  const compatibilityReasons = [];
  if (summary.videoCodec === null) {
    compatibilityReasons.push({ code: "missing-video-codec", severity: "error", message: "Video codec is missing", source: "probe" });
  }
  if (summary.audioTracks.length === 0) {
    compatibilityReasons.push({ code: "missing-audio-tracks", severity: "error", message: "No audio tracks were detected", source: "probe" });
  }
  if (trackRoles.instrumental === null) {
    compatibilityReasons.push({ code: "instrumental-track-unmapped", severity: "warning", message: "Instrumental track needs review", source: "review" });
  }
  if (currentWebCanPlayType === "") {
    compatibilityReasons.push({ code: "browser-cannot-play-type", severity: "error", message: "Current TV browser reports the media type unsupported", source: "runtime_spike" });
  }
  if (compatibilityReasons.some((reason) => reason.severity === "error")) {
    return { compatibilityStatus: "unsupported", compatibilityReasons };
  }
  if (compatibilityReasons.length > 0 || currentWebCanPlayType !== "probably") {
    return { compatibilityStatus: "review_required", compatibilityReasons };
  }
  return { compatibilityStatus: "playable", compatibilityReasons };
}

function defaultSummary(container) {
  return {
    container,
    durationMs: 1000,
    videoCodec: "h264",
    resolution: { width: 320, height: 180 },
    fileSizeBytes: 0,
    audioTracks: [
      { index: 0, id: "stream-0", label: "Original vocal", language: null, codec: "aac", channels: 2 },
      { index: 1, id: "stream-1", label: "Instrumental", language: null, codec: "aac", channels: 2 }
    ]
  };
}

function parseDurationMs(value) {
  const seconds = Number.parseFloat(value ?? "");
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

function normalizeCanPlayType(value) {
  return value === "maybe" || value === "probably" ? value : "";
}

function spawnCapture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const code = await main();
  process.exitCode = code;
}
