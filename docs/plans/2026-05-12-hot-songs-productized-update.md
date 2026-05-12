# Hot Songs Productized Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the hot-song ranking tool usable as a mature, low-friction server script while preserving the existing debuggable pipeline.

**Architecture:** Keep collection, normalization, and fusion as separate modules. Add a productized orchestration CLI that runs the whole pipeline into one dated run directory, reuses the same core functions as the debug commands, and optionally accepts externally collected source rows. Document the command, outputs, environment variables, and scoring model in a user-facing guide.

**Tech Stack:** TypeScript, Node fs/promises, zod contracts, Vitest, pnpm scripts.

---

### Task 1: Productized Pipeline Core

**Files:**
- Create: `packages/hot-songs/src/update-pipeline.ts`
- Test: `packages/hot-songs/src/test/update-pipeline.test.ts`

**Step 1: Write failing tests**

Cover:
- creates one run directory with source, candidate, and fused artifacts;
- can run from provided source rows and source report without live collection;
- returns artifact paths and counts for CLI reporting.

**Step 2: Run red test**

Run: `pnpm -F @home-ktv/hot-songs test -- update-pipeline.test.ts`
Expected: fail because the module does not exist.

**Step 3: Implement core**

Implement:
- `runHotSongsUpdate(options)`;
- default run directory naming;
- artifact writers for source rows, per-source rows, candidate snapshot, fused CSV, audit JSON, and near-duplicates CSV;
- clear comments around the pipeline stages.

**Step 4: Run green test**

Run: `pnpm -F @home-ktv/hot-songs test -- update-pipeline.test.ts`
Expected: pass.

### Task 2: One-Command CLI

**Files:**
- Create: `packages/hot-songs/src/update-cli.ts`
- Modify: `packages/hot-songs/package.json`
- Modify: `package.json`
- Test: `packages/hot-songs/src/test/update-cli.test.ts`

**Step 1: Write failing tests**

Cover:
- `--help` shows the product command;
- parser supports `--manifest`, `--out`, `--timeout-ms`, `--source`, `--fixture`, `--aliases`, `--source-rows`, and `--source-report`;
- CLI writes expected artifacts and logs final CSV path.

**Step 2: Run red test**

Run: `pnpm -F @home-ktv/hot-songs test -- update-cli.test.ts`
Expected: fail because the CLI does not exist.

**Step 3: Implement CLI**

Implement root-relative path handling, sensible defaults, and concise logging.

**Step 4: Run green test**

Run: `pnpm -F @home-ktv/hot-songs test -- update-cli.test.ts`
Expected: pass.

### Task 3: User Documentation

**Files:**
- Create: `docs/HOT-SONGS.md`

**Step 1: Write the guide**

Document:
- what the tool does;
- fastest command;
- server cron example;
- input/output files;
- environment variables for cookies/proxy;
- pipeline and scoring model;
- debug commands;
- common failure modes.

**Step 2: Verify commands against implementation**

Run `pnpm hot-songs:update -- --help` and confirm docs match the actual help text.

### Task 4: Full Verification

**Files:**
- Generated: `.planning/reports/hot-songs/productized-fixture-*/**`

**Step 1: Run fixture update**

Run:

```bash
pnpm hot-songs:update -- --fixture --out .planning/reports/hot-songs/productized-fixture-2026-05-12
```

Expected: writes `ranked-songs.csv` and audit artifacts.

**Step 2: Run package verification**

Run:

```bash
pnpm -F @home-ktv/hot-songs test
pnpm -F @home-ktv/hot-songs typecheck
```

Expected: all tests pass and typecheck exits 0.
