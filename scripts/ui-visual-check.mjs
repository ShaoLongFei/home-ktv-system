#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT_DIR, "logs", "visual");
const DEFAULT_ADMIN_URL = "http://127.0.0.1:5174/";
const DEFAULT_MOBILE_URL = "http://127.0.0.1:5176/controller?room=living-room";
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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

await main();

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const adminUrl = process.env.ADMIN_VISUAL_URL?.trim() || DEFAULT_ADMIN_URL;
  const mobileUrl = process.env.MOBILE_VISUAL_URL?.trim() || DEFAULT_MOBILE_URL;
  const chromeBin = process.env.CHROME_BIN?.trim() || DEFAULT_CHROME;

  mkdirSync(LOG_DIR, { recursive: true });

  for (const screenshot of screenshots) {
    await captureScreenshot({
      chromeBin,
      outputFile: screenshot.file,
      url: screenshot.url === "admin" ? adminUrl : mobileUrl,
      windowSize: screenshot.size
    });
    verifyScreenshot(screenshot.file);
  }

  for (const screenshot of screenshots) {
    console.log(screenshot.file);
  }
}

function printHelp() {
  console.log(`UI visual check

Environment:
  ADMIN_VISUAL_URL  Admin page to capture
  MOBILE_VISUAL_URL Mobile controller page to capture
  CHROME_BIN        Chrome executable path

Defaults:
  ADMIN_VISUAL_URL=${DEFAULT_ADMIN_URL}
  MOBILE_VISUAL_URL=${DEFAULT_MOBILE_URL}
  CHROME_BIN=${DEFAULT_CHROME}

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
