# Hot Songs Fusion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fair weighted fusion step that turns normalized hot-song candidates into a human-readable CSV ranked list.

**Architecture:** Add a separate fusion module and CLI so source collection and candidate normalization stay unchanged. The fusion step reads the source manifest for weights, reads `candidate-snapshot.json` for grouped evidence, optionally applies alias-based regrouping, computes additive weighted point scores, and writes a compact CSV plus audit artifacts.

**Tech Stack:** TypeScript, zod contracts, Vitest, Node fs/promises, existing `@home-ktv/hot-songs` package scripts.

---

### Task 1: Fusion Core

**Files:**
- Create: `packages/hot-songs/src/fuse/contracts.ts`
- Create: `packages/hot-songs/src/fuse/ranking.ts`
- Test: `packages/hot-songs/src/test/fuse.test.ts`

**Step 1: Write failing tests**

Add tests for:
- score contribution is `source.weight * 60 / (60 + rank)`;
- one source contributes only its best row per song;
- higher multi-source consensus beats a single high-rank source when weights justify it;
- output rank is deterministic by score, title, artist.

**Step 2: Run red test**

Run: `pnpm -F @home-ktv/hot-songs test -- fuse.test.ts`
Expected: fail because fusion module does not exist.

**Step 3: Implement minimal core**

Implement:
- `buildRankedSongs(snapshot, manifest)`;
- `scoreEvidence(row, source)`;
- zod schemas for ranked song and fusion report.

**Step 4: Run green test**

Run: `pnpm -F @home-ktv/hot-songs test -- fuse.test.ts`
Expected: pass.

### Task 2: Alias And Near-Duplicate Handling

**Files:**
- Create: `packages/hot-songs/src/fuse/aliases.ts`
- Modify: `packages/hot-songs/src/fuse/ranking.ts`
- Test: `packages/hot-songs/src/test/fuse.test.ts`

**Step 1: Write failing tests**

Add tests for:
- title alias merges two otherwise separate candidates with the same artist;
- artist alias merges `G.E.M.邓紫棋` and `邓紫棋`;
- live/remix/DJ variants remain separate unless explicitly aliased;
- suspicious same-artist similar titles are emitted as near-duplicates instead of auto-merged.

**Step 2: Run red test**

Run: `pnpm -F @home-ktv/hot-songs test -- fuse.test.ts`
Expected: fail due to missing alias support.

**Step 3: Implement minimal alias support**

Implement an optional JSON file:

```json
{
  "titleAliases": {
    "run wild 向风而野": ["run wild", "向风而野"]
  },
  "artistAliases": {
    "邓紫棋": ["g e m 邓紫棋", "gem 邓紫棋"]
  }
}
```

**Step 4: Run green test**

Run: `pnpm -F @home-ktv/hot-songs test -- fuse.test.ts`
Expected: pass.

### Task 3: CLI And CSV Output

**Files:**
- Create: `packages/hot-songs/src/fuse-cli.ts`
- Modify: `packages/hot-songs/package.json`
- Modify: root `package.json`
- Test: `packages/hot-songs/src/test/fuse-cli.test.ts`

**Step 1: Write failing tests**

Add tests for:
- CLI parses `--manifest`, `--candidate-snapshot`, `--out`, optional `--aliases`;
- CLI writes `ranked-songs.csv`, `ranked-songs.audit.json`, and `near-duplicates.csv`;
- CSV has exactly `rank,title,artist,score` columns.

**Step 2: Run red test**

Run: `pnpm -F @home-ktv/hot-songs test -- fuse-cli.test.ts`
Expected: fail because CLI does not exist.

**Step 3: Implement CLI**

Implement root-relative path handling via existing `resolveRunPath`, reuse `loadSourceManifest`, and write CSV with proper quote escaping.

**Step 4: Run green test**

Run: `pnpm -F @home-ktv/hot-songs test -- fuse-cli.test.ts`
Expected: pass.

### Task 4: End-To-End Verification

**Files:**
- Generate: `.planning/reports/hot-songs/fused-2026-05-11/**`

**Step 1: Normalize latest source rows**

Run:

```bash
pnpm hot-songs:normalize -- \
  --source-rows .planning/reports/hot-songs/collector-review-proxy-fixed-2026-05-11/source-rows.json \
  --source-report .planning/reports/hot-songs/collector-review-proxy-fixed-2026-05-11/source-report.json \
  --out .planning/reports/hot-songs/candidates-proxy-fixed-2026-05-11
```

**Step 2: Fuse latest candidate snapshot**

Run:

```bash
pnpm hot-songs:fuse -- \
  --manifest packages/hot-songs/config/sources.example.json \
  --candidate-snapshot .planning/reports/hot-songs/candidates-proxy-fixed-2026-05-11/candidate-snapshot.json \
  --out .planning/reports/hot-songs/fused-2026-05-11
```

**Step 3: Full verification**

Run:

```bash
pnpm -F @home-ktv/hot-songs test
pnpm -F @home-ktv/hot-songs typecheck
```

Expected: all tests pass and typecheck exits 0.
