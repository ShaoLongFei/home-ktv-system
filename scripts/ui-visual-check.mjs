#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT_DIR, "logs", "visual");
const DEFAULT_ADMIN_URL = "http://127.0.0.1:5174/";
const DEFAULT_API_URL = "http://127.0.0.1:4000";
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_ROOM_SLUG = "living-room";

const screenshots = [
  {
    file: path.join(LOG_DIR, "mobile-controller-390x844.png"),
    size: "390,844",
    url: "mobile"
  },
  {
    file: path.join(LOG_DIR, "mobile-controller-375x667.png"),
    size: "375,667",
    url: "mobile"
  },
  {
    file: path.join(LOG_DIR, "admin-1440x900.png"),
    size: "1440,900",
    url: "admin"
  },
  {
    file: path.join(LOG_DIR, "admin-768x900.png"),
    size: "768,900",
    url: "admin"
  }
];

if (isEntrypoint()) {
  await main();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const config = buildVisualConfig();
  const mobileUrl = await resolveMobileVisualUrl({ config });

  mkdirSync(LOG_DIR, { recursive: true });

  for (const screenshot of screenshots) {
    await captureScreenshot({
      chromeBin: config.chromeBin,
      outputFile: screenshot.file,
      url: screenshot.url === "admin" ? config.adminUrl : mobileUrl,
      windowSize: screenshot.size
    });
    verifyScreenshot(screenshot.file);
  }

  for (const screenshot of screenshots) {
    console.log(screenshot.file);
  }
}

export function buildVisualConfig(env = process.env) {
  return {
    adminUrl: env.ADMIN_VISUAL_URL?.trim() || DEFAULT_ADMIN_URL,
    apiBaseUrl: env.API_VISUAL_URL?.trim() || env.PUBLIC_BASE_URL?.trim() || DEFAULT_API_URL,
    chromeBin: env.CHROME_BIN?.trim() || DEFAULT_CHROME,
    mobileOverrideUrl: env.MOBILE_VISUAL_URL?.trim() || null,
    roomSlug: env.TV_ROOM_SLUG?.trim() || DEFAULT_ROOM_SLUG
  };
}

export async function resolveMobileVisualUrl({ config, fetchImpl = fetch }) {
  if (config.mobileOverrideUrl) {
    return config.mobileOverrideUrl;
  }

  try {
    return await refreshPairingControllerUrl({
      apiBaseUrl: config.apiBaseUrl,
      roomSlug: config.roomSlug,
      fetchImpl
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("POST /admin/rooms/")) {
      throw error;
    }

    throw new Error(
      `Unable to resolve paired Mobile visual URL. Check API_VISUAL_URL and ensure pnpm dev:local restart is running.${
        error instanceof Error ? ` Cause: ${error.message}` : ""
      }`
    );
  }
}

export async function refreshPairingControllerUrl({ apiBaseUrl, roomSlug, fetchImpl }) {
  const requestPath = `/admin/rooms/${encodeURIComponent(roomSlug)}/pairing-token/refresh`;
  const displayPath = `/admin/rooms/${roomSlug}/pairing-token/refresh`;
  const requestUrl = `${apiBaseUrl.replace(/\/$/u, "")}${requestPath}`;
  let response;

  try {
    response = await fetchImpl(requestUrl, { method: "POST" });
  } catch (error) {
    throw new Error(
      `Unable to resolve paired Mobile visual URL from POST ${displayPath}. Check API_VISUAL_URL and ensure pnpm dev:local restart is running.${
        error instanceof Error ? ` Cause: ${error.message}` : ""
      }`
    );
  }

  if (!response.ok) {
    const body = await readResponseText(response);
    throw new Error(
      `Unable to refresh paired Mobile visual URL from POST ${displayPath}. HTTP ${response.status}${
        body ? `: ${body}` : ""
      }. Check API_VISUAL_URL and ensure pnpm dev:local restart is running.`
    );
  }

  const payload = await response.json();
  const controllerUrl = payload?.pairing?.controllerUrl;
  if (
    typeof controllerUrl !== "string" ||
    controllerUrl.trim() === "" ||
    !controllerUrl.includes("/controller?") ||
    !controllerUrl.includes("token=")
  ) {
    throw new Error(
      `Malformed pairing refresh response from POST ${displayPath}: expected pairing.controllerUrl with /controller? and token=.`
    );
  }

  return controllerUrl;
}

function printHelp() {
  console.log(`UI visual check

Environment:
  ADMIN_VISUAL_URL  Admin page to capture
  MOBILE_VISUAL_URL Mobile controller page to capture; bypasses automatic pairing when set
  API_VISUAL_URL    API base URL used for automatic Mobile pairing refresh
  TV_ROOM_SLUG      Room slug used for automatic Mobile pairing refresh
  CHROME_BIN        Chrome executable path

Defaults:
  ADMIN_VISUAL_URL=${DEFAULT_ADMIN_URL}
  MOBILE_VISUAL_URL=(unset; default Mobile capture requests a fresh paired controller URL)
  API_VISUAL_URL=${DEFAULT_API_URL}
  TV_ROOM_SLUG=${DEFAULT_ROOM_SLUG}
  CHROME_BIN=${DEFAULT_CHROME}

Default Mobile capture obtains a fresh paired controller URL from POST /admin/rooms/<room>/pairing-token/refresh.
MOBILE_VISUAL_URL bypasses automatic pairing and is used as the full Mobile URL override.

Output:
  logs/visual/mobile-controller-390x844.png
  logs/visual/mobile-controller-375x667.png
  logs/visual/admin-1440x900.png
  logs/visual/admin-768x900.png
`);
}

async function captureScreenshot({ chromeBin, outputFile, url, windowSize }) {
  const profileDir = mkdtempSync(path.join(LOG_DIR, ".chrome-ui-check-"));
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        chromeBin,
        [
          "--headless=new",
          "--disable-gpu",
          "--disable-extensions",
          "--hide-scrollbars",
          "--force-device-scale-factor=1",
          "--no-first-run",
          "--no-default-browser-check",
          `--user-data-dir=${profileDir}`,
          `--window-size=${windowSize}`,
          `--screenshot=${outputFile}`,
          "--virtual-time-budget=3000",
          url
        ],
        {
          stdio: ["ignore", "ignore", "pipe"],
          windowsHide: true
        }
      );

      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        reject(new Error(`Unable to launch Chrome at ${chromeBin}: ${error.message}`));
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(`Chrome exited with code ${code} for ${outputFile}${stderr ? `:\n${stderr.trim()}` : ""}`)
        );
      });
    });
  } finally {
    try {
      rmSync(profileDir, { force: true, recursive: true });
    } catch {}
  }
}

function verifyScreenshot(file) {
  const stats = statSync(file);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Screenshot missing or empty: ${file}`);
  }
}

async function readResponseText(response) {
  if (typeof response.text !== "function") {
    return "";
  }

  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}

function isEntrypoint() {
  return path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
}
