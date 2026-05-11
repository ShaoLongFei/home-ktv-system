# Full Chart Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand hot-song source collection from toy fixtures to per-chart artifacts for the requested Kugou, QQ Music, Tencent Music, and NetEase charts, with visible row-count health.

**Architecture:** Keep the existing `@home-ktv/hot-songs` package and extend source definitions with target/min row metadata, platform caps, optional cookie env names, and segmented URLs. Adapters collect one logical chart per source, the runner assigns `succeeded`, `platform_cap`, or `failed_below_min_rows`, and the CLI writes both aggregate and per-source JSON files.

**Tech Stack:** TypeScript, Zod, Cheerio, Node fetch, Vitest, pnpm.

---

### Task 1: Contracts And Health Statuses

**Files:**
- Modify: `packages/hot-songs/src/contracts.ts`
- Modify: `packages/hot-songs/src/runner.ts`
- Modify: `packages/hot-songs/src/report/source-health.ts`
- Modify: `packages/hot-songs/src/test/contracts.test.ts`
- Modify: `packages/hot-songs/src/test/runner.test.ts`

**Step 1: Write failing tests**

Add tests proving:
- `SourceStatusValueSchema.options` includes `platform_cap` and `failed_below_min_rows`.
- `authCookieEnv` is accepted but inline `cookie` headers are still rejected.
- a source with `minRows: 400` and 100 rows but `platformCapRows: 100` reports `platform_cap` and remains usable.
- a source with `minRows: 400` and 100 rows without a cap reports `failed_below_min_rows` and is not usable.
- `statusCounts` includes the new statuses.

Run:

```bash
pnpm -F @home-ktv/hot-songs test -- src/test/contracts.test.ts src/test/runner.test.ts
```

Expected: fail because the schema and runner do not yet know the new fields/statuses.

**Step 2: Implement minimal contracts and runner logic**

Add optional fields to `SourceDefinitionSchema`:
- `targetRows`
- `minRows`
- `platformCapRows`
- `urls`
- `authCookieEnv`
- `topId`

Add status values:
- `platform_cap`
- `failed_below_min_rows`

In `collectOneSource`, use `source.minRows ?? source.expectedMinRows` as the effective minimum, set threshold warnings explicitly, mark platform-capped sources usable, and mark uncapped below-minimum sources unusable.

**Step 3: Verify**

```bash
pnpm -F @home-ktv/hot-songs test -- src/test/contracts.test.ts src/test/runner.test.ts
pnpm -F @home-ktv/hot-songs typecheck
git add packages/hot-songs/src/contracts.ts packages/hot-songs/src/runner.ts packages/hot-songs/src/report/source-health.ts packages/hot-songs/src/test/contracts.test.ts packages/hot-songs/src/test/runner.test.ts
git commit -m "feat: report full chart source coverage health"
```

### Task 2: Adapter Coverage

**Files:**
- Modify: `packages/hot-songs/src/fetch/http.ts`
- Modify: `packages/hot-songs/src/adapters/kugou-rank-html.ts`
- Modify: `packages/hot-songs/src/adapters/qq-toplist.ts`
- Modify: `packages/hot-songs/src/adapters/netease-toplist-html.ts`
- Create: `packages/hot-songs/src/adapters/tencent-music-yobang.ts`
- Modify: `packages/hot-songs/src/test/adapters.test.ts`

**Step 1: Write failing tests**

Add tests proving:
- Kugou can merge two segmented rank pages into one logical source.
- QQ can parse the public `fcg_v8_toplist_cp.fcg` JSON shape and keep rank/title/artist/date.
- Tencent Music 由你榜 can parse `__NEXT_DATA__.props.pageProps.chartsList`.
- optional cookie env headers are not included in row warnings or reports.

Run:

```bash
pnpm -F @home-ktv/hot-songs test -- src/test/adapters.test.ts
```

Expected: fail because segmented Kugou, QQ JSON, and Tencent Music adapters are missing.

**Step 2: Implement adapters**

- Let `fetchText` accept optional headers.
- Add a safe header builder that includes manifest headers plus `cookie` only from `authCookieEnv` when the env var exists.
- Update Kugou to fetch `source.urls` sequentially when present.
- Update QQ to prefer public JSON API by `source.topId` or `/toplist/<id>` URL, while keeping the old HTML parser as fallback.
- Add Tencent Music 由你榜 parser for Next.js page data.
- Keep NetEase parser unchanged except header support.

**Step 3: Verify**

```bash
pnpm -F @home-ktv/hot-songs test -- src/test/adapters.test.ts
pnpm -F @home-ktv/hot-songs typecheck
git add packages/hot-songs/src/fetch/http.ts packages/hot-songs/src/adapters packages/hot-songs/src/test/adapters.test.ts
git commit -m "feat: collect expanded music chart adapters"
```

### Task 3: Manifest And Per-Source Artifacts

**Files:**
- Modify: `packages/hot-songs/config/sources.example.json`
- Modify: `packages/hot-songs/src/cli.ts`
- Modify: `packages/hot-songs/src/test/adapters.test.ts`
- Modify: `packages/hot-songs/src/test/runner.test.ts`

**Step 1: Write failing tests**

Add tests proving:
- the manifest contains 8 Kugou, 11 QQ/Tencent, and 3 NetEase logical sources.
- fixture mode writes `sources/<sourceId>.json` for each source.
- fixture mode does not silently succeed for below-minimum sources without caps.

Run:

```bash
pnpm -F @home-ktv/hot-songs test -- src/test/adapters.test.ts src/test/runner.test.ts
```

Expected: fail because the manifest is still five toy sources and the CLI writes only aggregate files.

**Step 2: Implement manifest and artifacts**

Replace `sources.example.json` with the requested chart list:
- Kugou: TOP500, 飙升榜, 蜂鸟流行音乐榜, 抖音热歌榜, 快手热歌榜, 内地榜, 90后热歌榜, 00后热歌榜.
- QQ/Tencent: 腾讯音乐榜, 巅峰潮流榜, 飙升榜, 热歌榜, 流行指数榜, 收藏人气榜, 音乐指数榜, 全民K歌, 内地榜, 网络歌曲榜, 抖音热歌榜.
- NetEase: 热歌榜, 飙升榜, VIP 热歌榜.

Set `targetRows: 500` and `minRows: 400` for each. Set `platformCapRows` only where public probes establish the platform exposes fewer rows. Update fixture mode to expand deterministic fixture rows to the source cap or target so tests do not depend on live networks.

Write per-source files as:

```json
{
  "schemaVersion": "hot-songs.source-file.v1",
  "generatedAt": "...",
  "sourceId": "...",
  "rowCount": 500,
  "rows": []
}
```

**Step 3: Verify**

```bash
pnpm -F @home-ktv/hot-songs test
pnpm -F @home-ktv/hot-songs typecheck
git add packages/hot-songs/config/sources.example.json packages/hot-songs/src/cli.ts packages/hot-songs/src/test/adapters.test.ts packages/hot-songs/src/test/runner.test.ts
git commit -m "feat: configure requested full chart sources"
```

### Task 4: GSD Phase Artifacts And Live Run

**Files:**
- Modify: `.planning/ROADMAP.md`
- Modify: `.planning/STATE.md`
- Modify: `.planning/REQUIREMENTS.md`
- Create: `.planning/phases/13.1-full-chart-coverage/13.1-01-PLAN.md`
- Create: `.planning/phases/13.1-full-chart-coverage/13.1-01-SUMMARY.md`
- Create: `.planning/phases/13.1-full-chart-coverage/13.1-VERIFICATION.md`
- Generate: `.planning/reports/hot-songs/phase-13.1-full-chart-coverage/**`

**Step 1: Add GSD phase metadata**

Insert Phase 13.1 between Phase 13 and Phase 14, mapped to a new `SRC-06` requirement: requested chart sources must be collected independently with visible target/min/cap status.

**Step 2: Run fixture and live collection**

```bash
pnpm hot-songs:sources -- --fixture --manifest packages/hot-songs/config/sources.example.json --out .planning/reports/hot-songs/phase-13.1-fixture-full-chart-coverage
pnpm hot-songs:sources -- --manifest packages/hot-songs/config/sources.example.json --out .planning/reports/hot-songs/phase-13.1-live-full-chart-coverage --timeout-ms 20000
```

**Step 3: Verify**

```bash
pnpm -F @home-ktv/hot-songs test
pnpm -F @home-ktv/hot-songs typecheck
node -e "const fs=require('fs'); const report=JSON.parse(fs.readFileSync('.planning/reports/hot-songs/phase-13.1-live-full-chart-coverage/source-report.json','utf8')); if (report.sources.length !== 22) throw new Error('expected 22 sources'); if (!fs.existsSync('.planning/reports/hot-songs/phase-13.1-live-full-chart-coverage/sources/kugou-top500.json')) throw new Error('missing per-source file'); console.log(report.statusCounts)"
git add .planning packages/hot-songs docs/plans/2026-05-11-full-chart-coverage-implementation.md
git commit -m "docs: add phase 13.1 full chart coverage records"
```

---

## Final Verification

Before reporting completion, run:

```bash
pnpm -F @home-ktv/hot-songs test
pnpm -F @home-ktv/hot-songs typecheck
pnpm hot-songs:sources -- --fixture --manifest packages/hot-songs/config/sources.example.json --out .planning/reports/hot-songs/phase-13.1-fixture-full-chart-coverage
pnpm hot-songs:sources -- --manifest packages/hot-songs/config/sources.example.json --out .planning/reports/hot-songs/phase-13.1-live-full-chart-coverage --timeout-ms 20000
```
