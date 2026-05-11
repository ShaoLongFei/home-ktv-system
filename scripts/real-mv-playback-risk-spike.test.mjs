import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./real-mv-playback-risk-spike.mjs", import.meta.url));

test("help documents controlled and real sample options", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--controlled-only/u);
  assert.match(result.stdout, /--mkv/u);
  assert.match(result.stdout, /--mpeg/u);
  assert.match(result.stdout, /--output/u);
});

test("real sample mode requires both sample paths", () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Phase 12 real sample spike requires both --mkv and --mpeg sample files/u);
});

test("controlled mode writes a Markdown report with playback-risk evidence fields", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "real-mv-risk-spike-"));
  const output = path.join(tempDir, "risk.md");
  const result = spawnSync(process.execPath, [scriptPath, "--controlled-only", "--output", output], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const report = await readFile(output, "utf8");
  assert.match(report, /Controlled fixture/u);
  assert.match(report, /MKV sample/u);
  assert.match(report, /MPEG sample/u);
  assert.match(report, /canPlayType/u);
  assert.match(report, /hasAudioTracksApi/u);
  assert.match(report, /compatibilityStatus/u);
  assert.match(report, /compatibilityReasons/u);
  assert.match(report, /current device does not support audio-track switching/u);
});
