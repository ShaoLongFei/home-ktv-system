#!/usr/bin/env node
import { mkdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT_DIR, "logs", "visual");
const DEFAULT_URL =
  "http://127.0.0.1:5173/?apiBaseUrl=http://127.0.0.1:4000&roomSlug=living-room&deviceName=Living%20Room%20TV";
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const screenshots = [
  {
    file: path.join(LOG_DIR, "tv-player-1920x1080.png"),
    size: "1920,1080"
  },
  {
    file: path.join(LOG_DIR, "tv-player-1366x768.png"),
    size: "1366,768"
  }
];

await main();

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const url = process.env.TV_VISUAL_URL?.trim() || DEFAULT_URL;
  const chromeBin = process.env.CHROME_BIN?.trim() || DEFAULT_CHROME;

  mkdirSync(LOG_DIR, { recursive: true });

  for (const screenshot of screenshots) {
    await captureScreenshot({
      chromeBin,
      outputFile: screenshot.file,
      url,
      windowSize: screenshot.size
    });
    verifyScreenshot(screenshot.file);
  }

  for (const screenshot of screenshots) {
    console.log(screenshot.file);
  }
}

function printHelp() {
  console.log(`TV visual check

Environment:
  TV_VISUAL_URL  TV page to capture
  CHROME_BIN     Chrome executable path

Defaults:
  TV_VISUAL_URL=${DEFAULT_URL}
  CHROME_BIN=${DEFAULT_CHROME}

Output:
  logs/visual/tv-player-1920x1080.png
  logs/visual/tv-player-1366x768.png
`);
}

function captureScreenshot({ chromeBin, outputFile, url, windowSize }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chromeBin,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
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

      reject(new Error(`Chrome exited with code ${code} for ${outputFile}${stderr ? `:\n${stderr.trim()}` : ""}`));
    });
  });
}

function verifyScreenshot(file) {
  const stats = statSync(file);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Screenshot missing or empty: ${file}`);
  }
}
