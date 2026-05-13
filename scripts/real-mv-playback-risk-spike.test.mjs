import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./real-mv-playback-risk-spike.mjs", import.meta.url));

test("help documents controlled and local hardening sample options", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /--controlled-only/u);
  assert.match(result.stdout, /--media-root/u);
  assert.match(result.stdout, /--sample-mkv/u);
  assert.match(result.stdout, /--sample-mpg/u);
  assert.match(result.stdout, /--database-url/u);
  assert.match(result.stdout, /--output/u);
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

test("local sample mode writes representative filenames and skips index cross-check without database URL", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "real-mv-risk-spike-"));
  const sampleDir = path.join(tempDir, "songs-sample");
  const mkv = path.join(sampleDir, "关喆-想你的夜(MTV)-国语-流行.mkv");
  const mpg = path.join(sampleDir, "蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg");
  const output = path.join(tempDir, "risk.md");
  await mkdir(sampleDir);
  await writeFile(mkv, "");
  await writeFile(mpg, "");

  const result = spawnSync(process.execPath, [
    scriptPath,
    "--sample-mkv",
    mkv,
    "--sample-mpg",
    mpg,
    "--output",
    output
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const report = await readFile(output, "utf8");
  assert.match(report, /Local hardening samples/u);
  assert.match(report, /关喆-想你的夜\(MTV\)-国语-流行\.mkv/u);
  assert.match(report, /蔡依林-BECAUSE OF YOU\(演唱会\)-国语-流行\.mpg/u);
  assert.match(report, /index cross-check skipped/u);
});

test("MEDIA_ROOT defaults resolve the representative songs-sample files", async () => {
  const mediaRoot = await mkdtemp(path.join(tmpdir(), "real-mv-media-root-"));
  const sampleDir = path.join(mediaRoot, "songs-sample");
  const mkvRelativePath = "songs-sample/关喆-想你的夜(MTV)-国语-流行.mkv";
  const mpgRelativePath = "songs-sample/蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg";
  const mkv = path.join(mediaRoot, ...mkvRelativePath.split("/"));
  const mpg = path.join(mediaRoot, ...mpgRelativePath.split("/"));
  const output = path.join(mediaRoot, "risk.md");
  await mkdir(sampleDir);
  await writeFile(mkv, "");
  await writeFile(mpg, "");

  const result = spawnSync(process.execPath, [scriptPath, "--output", output], {
    encoding: "utf8",
    env: { ...process.env, MEDIA_ROOT: mediaRoot }
  });

  assert.equal(result.status, 0, result.stderr);
  const report = await readFile(output, "utf8");
  assert.match(report, /sampleResolution: MEDIA_ROOT default sample files/u);
  assert.match(report, new RegExp(mkvRelativePath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(report, new RegExp(mpgRelativePath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(report, /关喆-想你的夜\(MTV\)-国语-流行\.mkv/u);
  assert.match(report, /蔡依林-BECAUSE OF YOU\(演唱会\)-国语-流行\.mpg/u);
});
