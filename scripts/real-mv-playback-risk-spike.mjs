#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const UNSUPPORTED_SWITCH_MESSAGE = "current device does not support audio-track switching";
const SAMPLE_REQUIRED_MESSAGE = "Phase 12 real sample spike requires both --mkv and --mpeg sample files";
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function main(argv = process.argv.slice(2), io = process) {
  const args = parseArgs(argv);
  if (args.help) {
    io.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (!args.controlledOnly && (!(await isFile(args.mkv)) || !(await isFile(args.mpeg)))) {
    io.stderr.write(`${SAMPLE_REQUIRED_MESSAGE}\n`);
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

  if (!args.controlledOnly) {
    sections.push(
      buildSampleSection({
        heading: "Real sample - MKV sample",
        contentType: "video/x-matroska",
        browser,
        summary: await probeSampleSummary(args.mkv, "matroska,webm")
      }),
      buildSampleSection({
        heading: "Real sample - MPEG sample",
        contentType: "video/mpeg",
        browser,
        summary: await probeSampleSummary(args.mpeg, "mpeg")
      })
    );
  }

  const report = [
    "# Phase 12 Real MV Playback Risk Spike",
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
  pnpm real-mv:risk-spike -- --mkv <sample.mkv> --mpeg <sample.mpg|sample.mpeg> --output <report.md>

Options:
  --help             Show this help
  --controlled-only  Run controlled fixture checks without real samples
  --mkv <path>       Real MKV sample path
  --mpeg <path>      Real MPG/MPEG sample path
  --output <path>    Markdown report path`;
}

function parseArgs(argv) {
  const args = { controlledOnly: false, help: false, mkv: null, mpeg: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--controlled-only") args.controlledOnly = true;
    else if (arg === "--mkv") args.mkv = argv[++index] ?? null;
    else if (arg === "--mpeg") args.mpeg = argv[++index] ?? null;
    else if (arg === "--output") args.output = argv[++index] ?? null;
  }
  return args;
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
