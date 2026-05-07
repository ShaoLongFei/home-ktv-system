#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MEDIA_ROOT = process.env.MEDIA_ROOT?.trim() || path.join(ROOT_DIR, "home-ktv-media");
const DEFAULT_API_BASE_URL = process.env.PUBLIC_BASE_URL?.trim() || process.env.API_BASE_URL?.trim() || "http://127.0.0.1:4000";
const DEFAULT_ROOM_SLUG = process.env.TV_ROOM_SLUG?.trim() || "living-room";
const DEFAULT_ARTIST_NAME = process.env.DEMO_SONG_ARTIST?.trim() || "Demo Artist";
const DEFAULT_TITLE = process.env.DEMO_SONG_TITLE?.trim() || "Demo Song";
const DEFAULT_DURATION_MS = parseInteger(process.env.DEMO_SONG_DURATION_MS, 60_000);
const DEFAULT_TIMEOUT_MS = parseInteger(process.env.DEMO_SONG_TIMEOUT_MS, 120000);
const DEFAULT_FFMPEG_BIN = process.env.FFMPEG_BIN?.trim() || process.env.FFMPEG?.trim() || "ffmpeg";
const DEFAULT_VERSION_SUFFIX = process.env.DEMO_SONG_VERSION_SUFFIX?.trim() || `demo-${timestampSuffix(new Date())}`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export async function seedDemoSong(options = {}) {
  const input = normalizeOptions(options);
  const [result] = await seedDemoTracks(input, [
    {
      artistName: input.artistName,
      title: input.title,
      visualSource: "testsrc2=size=1280x720:rate=30,format=yuv420p",
      originalToneHz: 440,
      instrumentalToneHz: 554.37
    }
  ]);

  if (!result) {
    throw new Error("Demo song seeding did not return a result");
  }

  return result;
}

export async function seedDemoSongs(options = {}) {
  const input = normalizeOptions(options);
  const songs = await seedDemoTracks(input, buildDefaultDemoTracks(input));
  return { songs };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const result = await seedDemoSongs({
    apiBaseUrl: args.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    mediaRoot: args.mediaRoot ?? DEFAULT_MEDIA_ROOT,
    roomSlug: args.roomSlug ?? DEFAULT_ROOM_SLUG,
    durationMs: args.durationMs ?? DEFAULT_DURATION_MS,
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ffmpegBin: args.ffmpegBin ?? DEFAULT_FFMPEG_BIN,
    versionSuffix: args.versionSuffix ?? DEFAULT_VERSION_SUFFIX,
    artistName: args.artistName ?? DEFAULT_ARTIST_NAME,
    title: args.title ?? DEFAULT_TITLE
  });

  for (const song of result.songs) {
    console.log(`Seeded demo song: ${song.song.title} - ${song.song.artistName} (${song.status})`);
  }
}

async function seedDemoTracks(input, tracks) {
  const libraryRoot = path.resolve(input.mediaRoot);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is unavailable in this environment");
  }

  await ensureIngestApiAvailable(fetchImpl, input.apiBaseUrl);

  const imports = tracks.map((track) => ({
    ...track,
    importDirectory: path.join(libraryRoot, "imports", "pending", track.artistName, track.title)
  }));

  for (const track of imports) {
    await mkdir(track.importDirectory, { recursive: true });
    await createDemoMediaFile({
      filePath: path.join(track.importDirectory, "original.mp4"),
      label: "original",
      ffmpegBin: input.ffmpegBin,
      durationMs: input.durationMs,
      visualSource: track.visualSource,
      toneHz: track.originalToneHz,
      runCommand: input.runCommand
    });
    await createDemoMediaFile({
      filePath: path.join(track.importDirectory, "instrumental.mp4"),
      label: "instrumental",
      ffmpegBin: input.ffmpegBin,
      durationMs: input.durationMs,
      visualSource: track.visualSource,
      toneHz: track.instrumentalToneHz,
      runCommand: input.runCommand
    });
  }

  await requestJson(fetchImpl, input.apiBaseUrl, "/admin/imports/scan", "POST", { scope: "imports" });

  const results = [];
  for (const track of imports) {
    const candidate = await waitForCandidate(fetchImpl, input.apiBaseUrl, {
      artistName: track.artistName,
      title: track.title,
      groupKey: `${track.artistName}/${track.title}`,
      timeoutMs: input.timeoutMs
    });

    await requestJson(fetchImpl, input.apiBaseUrl, `/admin/import-candidates/${candidate.id}`, "PATCH", {
      sameVersionConfirmed: true
    });

    let approval = await requestJson(fetchImpl, input.apiBaseUrl, `/admin/import-candidates/${candidate.id}/approve`, "POST", {});
    if (approval.statusCode === 409 && approval.body?.error === "FORMAL_DIRECTORY_CONFLICT") {
      approval = await requestJson(
        fetchImpl,
        input.apiBaseUrl,
        `/admin/import-candidates/${candidate.id}/resolve-conflict`,
        "POST",
        {
          resolution: "create_version",
          versionSuffix: `${input.versionSuffix}-${sanitizePathSegment(track.title)}`
        }
      );
    }

    if (approval.body?.status !== "approved") {
      throw new Error(
        `Demo song approval did not complete: ${approval.body?.reason ?? approval.body?.error ?? approval.statusCode}`
      );
    }

    const availableSong = await waitForAvailableSong(fetchImpl, input.apiBaseUrl, input.roomSlug, {
      artistName: track.artistName,
      title: track.title,
      timeoutMs: input.timeoutMs
    });

    results.push({
      candidateId: candidate.id,
      status: approval.body.status,
      song: availableSong
    });
  }

  return results;
}

async function createDemoMediaFile({ filePath, label, ffmpegBin, durationMs, visualSource, toneHz, runCommand }) {
  const commandRunner = runCommand ?? defaultRunCommand;
  const seconds = Math.max(durationMs, 250) / 1000;
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    visualSource,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${toneHz}:sample_rate=48000`,
    "-t",
    `${seconds}`,
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    filePath
  ];

  await commandRunner(ffmpegBin, args);
}

async function defaultRunCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed: ${command} ${args.join(" ")}${signal ? ` (signal ${signal})` : ""}`));
    });
  });
}

function sanitizePathSegment(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "demo";
}

function buildDefaultDemoTracks(input) {
  return [
    {
      artistName: `${input.artistName} Aurora`,
      title: `${input.title} Sunrise`,
      visualSource: "testsrc2=size=1280x720:rate=30,format=yuv420p",
      originalToneHz: 440,
      instrumentalToneHz: 554.37
    },
    {
      artistName: `${input.artistName} Midnight`,
      title: `${input.title} Night Drive`,
      visualSource: "smptebars=size=1280x720:rate=30",
      originalToneHz: 220,
      instrumentalToneHz: 329.63
    }
  ];
}

async function requestJson(fetchImpl, apiBaseUrl, pathname, method, body) {
  const response = await fetchImpl(new URL(pathname, ensureTrailingSlash(apiBaseUrl)), {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const parsed = text ? tryParseJson(text) : null;
  if (!response.ok && response.status !== 409) {
    throw new Error(`Request failed: ${method} ${pathname} -> ${response.status}`);
  }

  return {
    statusCode: response.status,
    body: parsed
  };
}

async function ensureIngestApiAvailable(fetchImpl, apiBaseUrl) {
  const response = await fetchImpl(new URL("/admin/import-candidates?status=pending", ensureTrailingSlash(apiBaseUrl)));
  if (response.status === 404) {
    throw new Error(
      [
        "当前 API 没有注册导入接口，通常是因为它以 in-memory 模式启动了，也就是没有传 DATABASE_URL。",
        "先准备一个可用的 PostgreSQL 数据库，运行 `pnpm db:migrate`，然后用包含 DATABASE_URL 的环境重启 `pnpm dev:local start`。",
        "只有 DB-backed API 才能处理 demo 歌曲的扫描、审批和可用列表。"
      ].join(" ")
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to reach ingest API: GET /admin/import-candidates -> ${response.status}`);
  }
}

async function waitForCandidate(fetchImpl, apiBaseUrl, { artistName, title, groupKey, timeoutMs }) {
  return waitFor(async () => {
    const response = await fetchImpl(new URL("/admin/import-candidates?status=pending,held,review_required,conflict", ensureTrailingSlash(apiBaseUrl)));
    if (!response.ok) {
      throw new Error(`Failed to list import candidates: ${response.status}`);
    }

    const payload = await response.json();
    const candidate = payload.candidates?.find((entry) => {
      const record = entry?.candidate ?? entry;
      const metaGroupKey = typeof record?.candidateMeta?.groupKey === "string" ? record.candidateMeta.groupKey : null;
      return metaGroupKey === groupKey || (record?.title === title && record?.artistName === artistName);
    });

    if (!candidate || !hasCompleteImportPair(candidate)) {
      return null;
    }

    return candidate.candidate ?? candidate;
  }, timeoutMs, 1000, "import candidate");
}

function hasCompleteImportPair(candidateEntry) {
  const files = Array.isArray(candidateEntry?.files) ? candidateEntry.files : [];
  const selectedFiles = files.filter((file) => file?.selected);
  const original = selectedFiles.filter((file) => file?.proposedVocalMode === "original");
  const instrumental = selectedFiles.filter((file) => file?.proposedVocalMode === "instrumental");

  return original.length === 1 && instrumental.length === 1 && hasDuration(original[0]) && hasDuration(instrumental[0]);
}

function hasDuration(file) {
  return typeof file?.durationMs === "number" && Number.isFinite(file.durationMs);
}

async function waitForAvailableSong(fetchImpl, apiBaseUrl, roomSlug, { artistName, title, timeoutMs }) {
  const result = await waitFor(async () => {
    const response = await fetchImpl(new URL(`/rooms/${encodeURIComponent(roomSlug)}/available-songs`, ensureTrailingSlash(apiBaseUrl)));
    if (!response.ok) {
      throw new Error(`Failed to list available songs: ${response.status}`);
    }

    const payload = await response.json();
    const song = payload.songs?.find((entry) => entry.title === title && entry.artistName === artistName) ?? null;
    return song;
  }, timeoutMs, 1000, "available song");

  if (!result) {
    throw new Error("Demo song was approved but not visible in available songs");
  }

  return result;
}

async function waitFor(probe, timeoutMs, intervalMs, label) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await probe();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  const suffix = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}${suffix}`);
}

function normalizeOptions(options) {
  return {
    apiBaseUrl: String(options.apiBaseUrl ?? DEFAULT_API_BASE_URL).trim(),
    mediaRoot: String(options.mediaRoot ?? DEFAULT_MEDIA_ROOT).trim(),
    roomSlug: String(options.roomSlug ?? DEFAULT_ROOM_SLUG).trim(),
    artistName: String(options.artistName ?? DEFAULT_ARTIST_NAME).trim(),
    title: String(options.title ?? DEFAULT_TITLE).trim(),
    durationMs: parseInteger(options.durationMs, DEFAULT_DURATION_MS),
    timeoutMs: parseInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
    ffmpegBin: String(options.ffmpegBin ?? DEFAULT_FFMPEG_BIN).trim(),
    versionSuffix: String(options.versionSuffix ?? DEFAULT_VERSION_SUFFIX).trim(),
    fetchImpl: options.fetchImpl,
    runCommand: options.runCommand
  };
}

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    const [flag, inlineValue] = token.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    const consumeNext = inlineValue === undefined && value !== undefined && !String(value).startsWith("-");
    switch (flag) {
      case "--api-base-url":
        args.apiBaseUrl = value;
        break;
      case "--media-root":
        args.mediaRoot = value;
        break;
      case "--room-slug":
        args.roomSlug = value;
        break;
      case "--artist":
        args.artistName = value;
        break;
      case "--title":
        args.title = value;
        break;
      case "--duration-ms":
        args.durationMs = value;
        break;
      case "--timeout-ms":
        args.timeoutMs = value;
        break;
      case "--ffmpeg-bin":
        args.ffmpegBin = value;
        break;
      case "--version-suffix":
        args.versionSuffix = value;
        break;
      default:
        break;
    }

    if (consumeNext) {
      index += 1;
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage: pnpm seed:demo-song -- [options]

Options:
  --api-base-url <url>
  --media-root <path>
  --room-slug <slug>
  --artist <name>
  --title <title>
  --duration-ms <ms>
  --timeout-ms <ms>
  --ffmpeg-bin <path>
  --version-suffix <value>
`);
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function parseInteger(value, fallback) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampSuffix(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}
