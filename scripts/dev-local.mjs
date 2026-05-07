#!/usr/bin/env node
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = process.env.KTV_LOG_DIR?.trim() || path.join(ROOT_DIR, "logs", "dev");
const PID_DIR = path.join(LOG_DIR, "pids");
const ROOM_SLUG = process.env.TV_ROOM_SLUG?.trim() || "living-room";
const MEDIA_ROOT = process.env.MEDIA_ROOT?.trim() || path.join(ROOT_DIR, "home-ktv-media");
const LAN_IP = detectLanIp(process.env.KTV_LAN_IP?.trim());
const API_BASE_URL = process.env.PUBLIC_BASE_URL?.trim() || `http://${LAN_IP}:4000`;
const CONTROLLER_BASE_URL = process.env.CONTROLLER_BASE_URL?.trim() || `http://${LAN_IP}:5176`;
const CORS_ALLOWED_ORIGINS =
  process.env.CORS_ALLOWED_ORIGINS?.trim() ||
  [
    `http://localhost:5173`,
    `http://127.0.0.1:5173`,
    `http://${LAN_IP}:5173`,
    `http://localhost:5174`,
    `http://127.0.0.1:5174`,
    `http://${LAN_IP}:5174`,
    `http://localhost:5176`,
    `http://127.0.0.1:5176`,
    `http://${LAN_IP}:5176`
  ].join(",");

const SERVICES = {
  api: {
    args: ["-F", "@home-ktv/api", "dev"],
    command: "pnpm",
    port: 4000
  },
  admin: {
    args: ["-F", "@home-ktv/admin", "dev"],
    command: "pnpm",
    port: 5174
  },
  "mobile-controller": {
    args: ["-F", "@home-ktv/mobile-controller", "dev"],
    command: "pnpm",
    port: 5176
  },
  "tv-player": {
    args: ["-F", "@home-ktv/tv-player", "dev"],
    command: "pnpm",
    port: 5173
  }
};

const command = process.argv[2] || "status";
const commandArg = process.argv[3];

await main(command, commandArg);

async function main(currentCommand, currentArg) {
  switch (currentCommand) {
    case "start":
      ensureDirs();
      for (const service of serviceNames()) {
        await startService(service);
      }
      printUrls();
      return;
    case "stop":
      ensureDirs();
      for (const service of serviceNames()) {
        await stopService(service);
      }
      return;
    case "restart":
      ensureDirs();
      for (const service of serviceNames()) {
        await stopService(service);
      }
      for (const service of serviceNames()) {
        await startService(service);
      }
      printUrls();
      return;
    case "status":
      ensureDirs();
      for (const service of serviceNames()) {
        reportStatus(service);
      }
      printUrls();
      return;
    case "tail":
      ensureDirs();
      await tailLogs(currentArg);
      return;
    case "help":
    case "-h":
    case "--help":
      printUsage();
      return;
    default:
      printUsage(true);
      process.exitCode = 2;
  }
}

function serviceNames() {
  return ["api", "admin", "tv-player", "mobile-controller"];
}

function serviceLogPath(service) {
  return path.join(LOG_DIR, `${service}.log`);
}

function servicePidPath(service) {
  return path.join(PID_DIR, `${service}.pid`);
}

function ensureDirs() {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(PID_DIR, { recursive: true });
  mkdirSync(MEDIA_ROOT, { recursive: true });
}

async function startService(service) {
  const pidPath = servicePidPath(service);
  const logPath = serviceLogPath(service);

  if (isRunningFromPidFile(pidPath)) {
    const pid = readPid(pidPath);
    console.log(`${pad(service)} already running (pid ${pid})`);
    return;
  }

  const logFd = openSync(logPath, "a");
  writeHeader(logPath, service);

  const env = {
    ...process.env,
    CORS_ALLOWED_ORIGINS,
    CONTROLLER_BASE_URL,
    HOST: "0.0.0.0",
    MEDIA_ROOT,
    PORT: String(SERVICES[service].port),
    PUBLIC_BASE_URL: API_BASE_URL,
    TV_ROOM_SLUG: ROOM_SLUG,
    VITE_API_BASE_URL: API_BASE_URL
  };

  if (service === "api") {
    env.CONTROLLER_BASE_URL = CONTROLLER_BASE_URL;
    env.PUBLIC_BASE_URL = API_BASE_URL;
  } else {
    delete env.DATABASE_URL;
    delete env.CONTROLLER_BASE_URL;
    delete env.CORS_ALLOWED_ORIGINS;
    delete env.HOST;
    delete env.MEDIA_ROOT;
    delete env.PORT;
    delete env.PUBLIC_BASE_URL;
    delete env.TV_ROOM_SLUG;
  }

  const child = spawn(SERVICES[service].command, SERVICES[service].args, {
    cwd: ROOT_DIR,
    detached: true,
    env,
    stdio: ["ignore", logFd, logFd]
  });

  closeSync(logFd);
  child.unref();
  writeFileSync(pidPath, String(child.pid));
  await sleep(500);

  if (isProcessRunning(child.pid)) {
    console.log(`${pad(service)} started (pid ${child.pid}, log ${logPath})`);
    return;
  }

  rmSync(pidPath, { force: true });
  console.error(`${pad(service)} failed to start; see ${logPath}`);
}

async function stopService(service) {
  const pidPath = servicePidPath(service);
  if (!exists(pidPath)) {
    console.log(`${pad(service)} stopped`);
    return;
  }

  const pid = readPid(pidPath);
  if (!isProcessRunning(pid)) {
    rmSync(pidPath, { force: true });
    console.log(`${pad(service)} stopped (removed stale pid)`);
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!isProcessRunning(pid)) {
      rmSync(pidPath, { force: true });
      console.log(`${pad(service)} stopped`);
      return;
    }
    await sleep(200);
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  rmSync(pidPath, { force: true });
  console.log(`${pad(service)} killed after timeout`);
}

function reportStatus(service) {
  const pidPath = servicePidPath(service);
  if (!exists(pidPath)) {
    console.log(`${pad(service)} stopped`);
    return;
  }

  const pid = readPid(pidPath);
  if (isProcessRunning(pid)) {
    console.log(`${pad(service)} running (pid ${pid})`);
    return;
  }

  console.log(`${pad(service)} stopped (stale pid ${pid})`);
}

async function tailLogs(service) {
  const targets = service ? [service] : serviceNames();
  for (const name of targets) {
    if (!SERVICES[name]) {
      console.error(`Unknown service: ${name}`);
      process.exitCode = 2;
      return;
    }
  }

  const files = targets.map((name) => serviceLogPath(name));
  for (const file of files) {
    ensureFile(file);
  }

  const child = spawn("tail", ["-f", ...files], {
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 0;
  });
}

function printUrls() {
  const tvLocal = `http://localhost:5173/?apiBaseUrl=${API_BASE_URL}&roomSlug=${ROOM_SLUG}&deviceName=Living%20Room%20TV`;
  const tvLan = `http://${LAN_IP}:5173/?apiBaseUrl=${API_BASE_URL}&roomSlug=${ROOM_SLUG}&deviceName=Living%20Room%20TV`;

  console.log("");
  console.log("URLs:");
  console.log(`  API health:        ${API_BASE_URL}/health`);
  console.log(`  Admin:             http://${LAN_IP}:5174/`);
  console.log(`  Mobile controller: ${CONTROLLER_BASE_URL}/controller?room=${ROOM_SLUG}`);
  console.log(`  TV local:          ${tvLocal}`);
  console.log(`  TV LAN:            ${tvLan}`);
  console.log("");
  console.log("Logs:");
  console.log(`  ${LOG_DIR}`);
}

function printUsage(error = false) {
  const output = [
    "Usage: pnpm dev:local <command> [service]",
    "",
    "Commands:",
    "  start              Start api, admin, tv-player, and mobile-controller",
    "  stop               Stop services started by this script",
    "  restart            Stop then start all services",
    "  status             Show service status and local URLs",
    "  tail [service]     Tail all logs, or one service log",
    "",
    "Environment overrides:",
    `  KTV_LAN_IP         LAN IP used in URLs, default: auto-detected (${LAN_IP})`,
    `  MEDIA_ROOT         Media root, default: ${MEDIA_ROOT}`,
    `  TV_ROOM_SLUG       Room slug, default: ${ROOM_SLUG}`,
    `  KTV_LOG_DIR        Log directory, default: ${LOG_DIR}`
  ].join("\n");

  (error ? console.error : console.log)(output);
}

function writeHeader(logPath, service) {
  const timestamp = new Date().toISOString();
  const lines = [
    "",
    `[${timestamp}] starting ${service}`,
    `LAN_IP=${LAN_IP} API_BASE_URL=${API_BASE_URL} CONTROLLER_BASE_URL=${CONTROLLER_BASE_URL} ROOM_SLUG=${ROOM_SLUG} MEDIA_ROOT=${MEDIA_ROOT}`
  ].join("\n");
  writeFileSync(logPath, `${lines}\n`, { flag: "a" });
}

function detectLanIp(override) {
  if (override) {
    return override;
  }

  const interfaces = os.networkInterfaces();
  const preferredOrder = ["en0", "en1"];
  for (const name of preferredOrder) {
    const found = firstExternalIpv4(interfaces[name]);
    if (found) {
      return found;
    }
  }

  for (const [name, infos] of Object.entries(interfaces)) {
    if (/^(lo|utun|awdl|bridge|docker|vmnet|vboxnet)/u.test(name)) {
      continue;
    }
    const found = firstExternalIpv4(infos);
    if (found) {
      return found;
    }
  }

  return "127.0.0.1";
}

function firstExternalIpv4(entries) {
  if (!entries) {
    return null;
  }

  for (const entry of entries) {
    if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
      return entry.address;
    }
  }

  return null;
}

function isRunningFromPidFile(pidPath) {
  if (!exists(pidPath)) {
    return false;
  }
  return isProcessRunning(readPid(pidPath));
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(pidPath) {
  return Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
}

function exists(filePath) {
  try {
    return readFileSync(filePath, "utf8") !== undefined;
  } catch {
    return false;
  }
}

function ensureFile(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  if (!exists(filePath)) {
    writeFileSync(filePath, "");
  }
}

function pad(value) {
  return value.padEnd(18);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
