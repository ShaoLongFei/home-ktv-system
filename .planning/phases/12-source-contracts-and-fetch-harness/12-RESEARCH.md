# Phase 12: Source Contracts and Fetch Harness - Research

**Researched:** 2026-05-10
**Domain:** TypeScript CLI source ingestion, public chart adapters, manual snapshot contracts
**Confidence:** HIGH

## User Constraints

No `.planning/phases/12-source-contracts-and-fetch-harness/12-CONTEXT.md` exists, so there are no locked decisions to copy verbatim from phase discussion.

Binding constraints from the roadmap, requirements, project state, and prompt:

- Phase 12 must create source contracts and a fetch harness for a single-run hot-song candidate list generator.
- Must address `SRC-01`, `SRC-02`, `SRC-03`, `SRC-04`, and `SRC-05`.
- Must load a configured source manifest containing public chart/list sources and manual snapshot files.
- Must classify KTV-first sources ahead of general streaming charts.
- Must support QQ Music `K歌金曲榜` and manual CAVCA `金麦榜` rows as KTV-first sources.
- Must support public QQ, Kugou, and NetEase charts when available as support sources.
- Must emit source rows/statuses and report source health with succeeded, failed, stale, and skipped sources, row counts, and warnings.
- Must continue on partial source failures when at least one usable source remains.
- Must fail only for no usable source or invalid required configuration.
- Must not implement normalization, dedupe scoring, ranking, candidate exports, OpenList matching, downloads, scheduler, weekly diff, Admin UI, OCR, DB/catalog mutation, or private/login scraping.

## Project Constraints (from CLAUDE.md)

- Core value remains: phone controls the home KTV experience and the system reliably gets songs singing on one TV.
- Product scope prefers stable singing over broad feature coverage; complex enhancements should be deferred.
- Mobile remains the only control surface; TV does not take search/control features.
- Playback state is server-authoritative, but Phase 12 must stay outside playback state entirely.
- Software must not handle realtime vocal DSP.
- Local media remains primary; online sources are supplemental metadata only.
- Existing online playback work uses cache-before-play, but Phase 12 must not touch online playback or caches.
- The data model keeps a `room` concept, but this phase should not mutate room/session/catalog data.
- Chinese search quality matters, but Phase 12 should preserve raw rows and leave normalization/dedupe to Phase 13.
- Deployment context is home-server oriented; avoid adding required services.
- Compliance boundary is explicit: no private APIs, copied cookies, login scraping, CAPTCHA bypass, or media download URLs.
- GSD workflow requires planning artifacts to stay in sync; direct repo edits are allowed here only because this research artifact was explicitly requested.
- Follow existing monorepo patterns: pnpm workspaces, TypeScript, Turborepo task names, Vitest for TypeScript package tests, strict TS settings.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRC-01 | User can run one command that loads a configured source manifest for public chart/list sources and manual snapshot files. | Use a root script that delegates to `@home-ktv/hot-songs`, a Zod-validated manifest, and adapters for `public_chart` and `manual_snapshot`. |
| SRC-02 | User can include KTV-first sources, including QQ Music `K歌金曲榜` and manual CAVCA `金麦榜` rows, before general streaming charts. | Add `sourceType: "ktv_first"` and higher default weights for `qq-kge-toplist` and `cavca-golden-mic-manual`; keep only source ordering/weights in Phase 12. |
| SRC-03 | User can include support sources such as QQ/Kugou/NetEase public charts when available, with each source classified by source type and weight. | Add `sourceType: "support"` plus provider-specific adapters for QQ embedded toplist JSON, Kugou HTML rank rows, and NetEase `song-list-pre-data`. |
| SRC-04 | User receives a source health report that shows which sources succeeded, failed, were stale, or were skipped, including row counts and warnings. | Define a `SourceStatus` contract with exact required statuses, `rowCount`, `usable`, `warnings`, `error`, `startedAt`, and `finishedAt`; print and write a source report artifact. |
| SRC-05 | The command handles partial source failures without hiding them; it fails only when no usable source remains or required configuration is invalid. | Use `Promise.allSettled`/per-adapter catch boundaries, per-source timeouts, visible failure statuses, and a final health gate based on usable row-bearing sources. |

</phase_requirements>

## Summary

Phase 12 should be implemented as a new isolated TypeScript workspace package, `@home-ktv/hot-songs`, with a root-level command that runs a source collection harness. Keep it outside `apps/api` so it cannot accidentally depend on Fastify, PostgreSQL, catalog repositories, playback state, OpenList, or Admin UI wiring. The package should expose source contracts, manifest loading, adapter execution, and source health reporting only.

The highest-risk parts are not algorithms; they are source volatility and boundary drift. Public pages can change shape, manual snapshots can go stale, and a failed KTV-first source can bias later ranking if the failure is hidden. The plan should prioritize strong contracts, manifest validation, per-source timeouts, adapter-level warnings, fixture-backed tests, and explicit source statuses before any normalization/scoring work exists.

**Primary recommendation:** create `packages/hot-songs` with Zod contracts, public/manual source adapters, a `collect-sources` CLI, fixture tests, and source health JSON output; do not add DB/API/OpenList dependencies.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins | Target Node >=24; local `v25.8.0` | `fetch`, `AbortSignal.timeout`, `fs/promises`, `node:util.parseArgs`, URL handling | Existing project baseline is modern Node; official Node docs mark `fetch` non-experimental and `parseArgs` stable, so no axios/commander dependency is needed. |
| TypeScript | `6.0.3` | Strict package types and contracts | Already root dependency; matches repo strict TS settings and generated declaration patterns. |
| `tsx` | `4.21.0`, published/modified `2025-11-30` | Run the TypeScript CLI without prebuild during local use | Existing API app already uses `tsx`; root command currently cannot find it, so install it in the new package dev deps. |
| `zod` | `4.4.3`, published/modified `2026-05-04` | Validate manifests, manual snapshots, adapter rows, source statuses | Source inputs are external/untrusted; Zod 4 is current and official docs cover parse-time validation plus inferred types. |
| `cheerio` | `1.2.0`, published/modified `2026-02-21` | Parse public HTML pages for Kugou/NetEase and fallback extraction | Avoids brittle regex-only HTML parsing while keeping the tool lightweight. |
| `vitest` | `4.1.5`, published/modified `2026-05-05` | Unit tests for contracts, adapters, partial failure behavior, stale/skipped states | Existing apps already use Vitest; use package-local Vitest config for TypeScript tests. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `csv-stringify` | `6.7.0`, published/modified `2026-03-17` | Safe CSV output | Defer to Phase 14; Phase 12 should not produce candidate CSV exports. |
| `opencc-js` | Existing API dependency `1.3.0` | Simplified/traditional text conversion | Defer to Phase 13 normalization; Phase 12 should preserve raw strings. |
| `pinyin-pro` | Existing API dependency `3.28.1` | Pinyin/initial search keys | Defer to Phase 13/14 auxiliary search/review; never use as duplicate proof. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `packages/hot-songs` package | Root `scripts/*.ts` only | Scripts are quick, but package-local tests/typecheck/deps are cleaner and fit existing workspace boundaries. Keep a root npm script as the user entry point. |
| Node `parseArgs` | `commander` or `yargs` | Not needed for a small internal CLI; adding a CLI framework increases dependency surface. |
| Native `fetch` | `axios`, `got`, `undici` direct dependency | Native fetch is stable in modern Node and sufficient with `AbortSignal.timeout`. |
| Cheerio DOM parsing | Regex-only HTML parsing | Regex alone is fragile for chart pages; use Cheerio, with targeted regex only for embedded JSON script/textarea extraction. |
| Zod contracts | Hand-written type guards | Zod gives explicit error paths for invalid manifests/manual rows and keeps runtime validation aligned with TypeScript types. |

**Installation:**

```bash
# After creating packages/hot-songs/package.json
pnpm add -F @home-ktv/hot-songs zod@4.4.3 cheerio@1.2.0
pnpm add -D -F @home-ktv/hot-songs tsx@4.21.0 vitest@4.1.5 @types/node@25.6.2

# Defer until Phase 14
pnpm add -F @home-ktv/hot-songs csv-stringify@6.7.0
```

**Version verification:** versions above were verified with `npm view <package> version time.modified` on 2026-05-10.

## Architecture Patterns

### Recommended Project Structure

```text
packages/hot-songs/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── config/
│   └── sources.example.json        # Sample manifest, not private config
├── fixtures/
│   ├── manifests/
│   ├── manual-snapshots/
│   └── html/
└── src/
    ├── cli.ts                      # collect-sources entry point
    ├── contracts.ts                # Zod schemas + inferred types
    ├── manifest.ts                 # load/validate manifest and manual files
    ├── runner.ts                   # execute adapters and health gate
    ├── fetch/
    │   └── http.ts                 # fetch wrapper with timeout/user-agent
    ├── adapters/
    │   ├── manual-json.ts
    │   ├── qq-toplist.ts
    │   ├── kugou-rank-html.ts
    │   └── netease-toplist-html.ts
    ├── report/
    │   └── source-health.ts
    └── test/
        ├── contracts.test.ts
        ├── runner.test.ts
        └── adapters.test.ts
```

Add root scripts:

```json
{
  "scripts": {
    "hot-songs:sources": "pnpm -F @home-ktv/hot-songs collect-sources",
    "hot-songs:sources:test": "pnpm -F @home-ktv/hot-songs test"
  }
}
```

### Pattern 1: Source Manifest Is the Boundary

**What:** The CLI accepts a manifest path and validates every source before fetching.
**When to use:** Always. This is the contract for public URLs, manual snapshot file paths, classification, weights, freshness policy, and required/optional behavior.

```typescript
// Source: Zod docs for object schemas and .parse()
import * as z from "zod";

export const SourceTypeSchema = z.enum(["ktv_first", "support"]);
export const SourceKindSchema = z.enum(["public_chart", "manual_snapshot"]);
export const SourceStatusSchema = z.enum(["succeeded", "failed", "stale", "skipped"]);

export const SourceDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  provider: z.enum(["qq_music", "cavca", "kugou", "netease", "manual"]),
  sourceType: SourceTypeSchema,
  sourceKind: SourceKindSchema,
  adapter: z.enum(["qq_toplist", "kugou_rank_html", "netease_toplist_html", "manual_json"]),
  weight: z.number().int().min(1).max(200),
  enabled: z.boolean().default(true),
  required: z.boolean().default(false),
  url: z.string().url().optional(),
  file: z.string().min(1).optional(),
  expectedMinRows: z.number().int().min(1).default(1),
  staleAfterDays: z.number().int().min(1).default(14)
});
```

### Pattern 2: Adapter Results, Not Thrown Control Flow

**What:** Adapters return rows and warnings; the runner converts expected failures into visible source statuses.
**When to use:** For every source adapter. Throw only for programmer errors; network/parse/source-shape problems should become `failed` statuses.

```typescript
export type SourceRow = {
  sourceId: string;
  sourceType: "ktv_first" | "support";
  provider: string;
  rank: number | null;
  rawTitle: string;
  rawArtists: string[];
  sourceUrl: string | null;
  sourcePublishedAt: string | null;
  collectedAt: string;
  warnings: string[];
};

export type SourceFetchResult = {
  rows: SourceRow[];
  warnings: string[];
  sourcePublishedAt: string | null;
};
```

### Pattern 3: Public Access Guard

**What:** Reject source definitions that try to provide cookies, authorization headers, private tokens, or login-only modes.
**When to use:** During manifest validation before adapter execution.

```typescript
const ForbiddenAuthConfigSchema = z
  .object({
    headers: z.record(z.string(), z.string()).optional(),
    cookie: z.never().optional(),
    authToken: z.never().optional()
  })
  .superRefine((value, ctx) => {
    const headers = Object.keys(value.headers ?? {}).map((header) => header.toLowerCase());
    for (const forbidden of ["cookie", "authorization", "x-token", "x-auth-token"]) {
      if (headers.includes(forbidden)) {
        ctx.addIssue({
          code: "custom",
          path: ["headers", forbidden],
          message: "Phase 12 only supports public metadata sources; auth headers are not allowed"
        });
      }
    }
  });
```

### Pattern 4: Source Health Gate

**What:** Run all enabled sources, persist every status, then fail only if no usable source remains or required config is invalid.
**When to use:** At the end of `collectSources`.

```typescript
const usableStatuses = statuses.filter((status) => status.usable && status.rowCount > 0);

if (usableStatuses.length === 0) {
  throw new Error("No usable hot-song sources remain. Check source-report.json for failed, stale, and skipped sources.");
}

return {
  rows,
  statuses,
  warnings: statuses.flatMap((status) => status.warnings)
};
```

### Pattern 5: Keep Phase 12 Row-Level Only

**What:** Preserve source rows exactly enough for later phases, but do not normalize, dedupe, score, tier, or export candidates.
**When to use:** Any time adapter output appears to need "cleaning". Only trim obvious whitespace and validate required raw fields.

### Anti-Patterns to Avoid

- **Putting the tool in `apps/api`:** creates accidental DB/Fastify/runtime coupling and makes OUT-05 harder later.
- **Returning only combined rows:** hides which source failed and why; always return rows plus statuses.
- **Treating stale manual rows as clean success:** mark `stale` with `usable` explicitly decided by manifest policy.
- **Parsing private/mobile APIs:** violates scope and makes the tool brittle.
- **Normalizing/deduping in adapters:** adapters should emit raw source evidence; Phase 13 owns identity logic.
- **Making live network tests the only tests:** use fixture HTML/manual files for repeatable adapter tests.

## Source Adapter Findings

| Source | Recommended Phase 12 Support | Current Probe Result on 2026-05-10 | Confidence |
|--------|------------------------------|------------------------------------|------------|
| QQ Music `K歌金曲榜` (`topId: 36`) | `qq_toplist` adapter, `sourceType: ktv_first`, weight `100` | `https://y.qq.com/n/ryqq/toplist/36` returned HTTP 200; HTML contains `window.__INITIAL_DATA__`, `topId:36`, weekly period/update date, and song rows with rank/title/singer. | HIGH |
| CAVCA `金麦榜` | `manual_json` adapter for user-entered rows, `sourceType: ktv_first`, weight `110` | `https://www.cavca.org/news/49` returned HTTP 200 and links current issues. Detail page `newsDetail/2329` is image-heavy with no HTML table; manual rows are the correct v1.2 path. | HIGH |
| QQ general charts | Same `qq_toplist` adapter with other top IDs, `sourceType: support`, weight `45` | QQ embedded data includes general charts such as hot/rising/new/popularity with rank/title/singer. | HIGH |
| Kugou rankings | `kugou_rank_html` adapter, `sourceType: support`, weight `40` | `https://www.kugou.com/yy/rank/home` returned HTTP 200; HTML contains `pc_temp_songlist` rows with rank/title/artist. | HIGH |
| NetEase toplist | `netease_toplist_html` adapter, `sourceType: support`, weight `35` | `https://music.163.com/discover/toplist` returned HTTP 200; HTML contains `song-list-pre-data` JSON with artists and song names. | MEDIUM-HIGH |
| Changba/51VV/KTVSky | Defer or manual snapshots unless planner has spare capacity | Pages returned HTTP 200, but source priority is lower and metadata/freshness quality is less central to SRC-01..SRC-05. | MEDIUM |

Recommended default source set for Phase 12:

```json
{
  "schemaVersion": "hot-songs.source-manifest.v1",
  "sources": [
    {
      "id": "qq-kge-toplist",
      "name": "QQ Music K歌金曲榜",
      "provider": "qq_music",
      "sourceType": "ktv_first",
      "sourceKind": "public_chart",
      "adapter": "qq_toplist",
      "weight": 100,
      "url": "https://y.qq.com/n/ryqq/toplist/36",
      "expectedMinRows": 20,
      "staleAfterDays": 14
    },
    {
      "id": "cavca-golden-mic-manual",
      "name": "CAVCA 金麦榜 manual snapshot",
      "provider": "cavca",
      "sourceType": "ktv_first",
      "sourceKind": "manual_snapshot",
      "adapter": "manual_json",
      "weight": 110,
      "file": ".planning/source-snapshots/hot-songs/cavca-golden-mic.json",
      "required": false,
      "expectedMinRows": 10,
      "staleAfterDays": 45
    },
    {
      "id": "qq-hot-toplist",
      "name": "QQ Music 热歌榜",
      "provider": "qq_music",
      "sourceType": "support",
      "sourceKind": "public_chart",
      "adapter": "qq_toplist",
      "weight": 45,
      "url": "https://y.qq.com/n/ryqq/toplist/26",
      "expectedMinRows": 50,
      "staleAfterDays": 7
    },
    {
      "id": "kugou-rank-home",
      "name": "Kugou 排行榜",
      "provider": "kugou",
      "sourceType": "support",
      "sourceKind": "public_chart",
      "adapter": "kugou_rank_html",
      "weight": 40,
      "url": "https://www.kugou.com/yy/rank/home",
      "expectedMinRows": 20,
      "staleAfterDays": 7
    },
    {
      "id": "netease-toplist",
      "name": "NetEase 云音乐榜单",
      "provider": "netease",
      "sourceType": "support",
      "sourceKind": "public_chart",
      "adapter": "netease_toplist_html",
      "weight": 35,
      "url": "https://music.163.com/discover/toplist",
      "expectedMinRows": 20,
      "staleAfterDays": 7
    }
  ]
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Manifest/manual row validation | Ad hoc `typeof` checks | Zod schemas | Need precise invalid-config errors and inferred TS types. |
| CLI argument parsing | Custom `process.argv` switch parser | `node:util.parseArgs` | Stable built-in supports typed options/defaults without dependency. |
| HTTP client | Axios/got wrapper | Native Node `fetch` plus `AbortSignal.timeout` | Modern Node provides stable fetch; fewer dependencies. |
| HTML traversal | Regex-only parser | Cheerio `load` for DOM plus targeted embedded JSON extraction | Public pages change markup; selectors are easier to test and maintain. |
| Partial failure aggregation | First-error-throws run model | Per-source result capture plus `Promise.allSettled` | Requirements demand visible partial failures. |
| Candidate identity logic | Early normalization/dedupe in adapters | Raw row preservation for Phase 13 | Prevents false merges and keeps phase boundaries clean. |
| CSV escaping | String concatenation | `csv-stringify` in Phase 14 | CSV edge cases are easy to get wrong, but not needed in Phase 12. |

**Key insight:** Source ingestion is a boundary-hardening problem. The planner should spend tasks on contracts, validation, adapter seams, fixture tests, and health reporting before any candidate-quality logic exists.

## Common Pitfalls

### Pitfall 1: Silent Source Bias

**What goes wrong:** A KTV-first source fails, but the run still produces rows from generic charts and looks healthy.
**Why it happens:** Runner returns only combined rows, or logs failures without structured statuses.
**How to avoid:** Require `SourceStatus` for every configured source and include failed/stale/skipped sources in terminal and JSON report.
**Warning signs:** Source report lacks zero-row sources, error reasons, or `usable` flags.

### Pitfall 2: Source Health Vocabulary Drift

**What goes wrong:** Code uses `ok/degraded/error`, but requirements ask for succeeded/failed/stale/skipped.
**Why it happens:** Generic health patterns are copied without matching SRC-04.
**How to avoid:** Make `SourceStatusSchema = z.enum(["succeeded", "failed", "stale", "skipped"])` and test all four statuses.

### Pitfall 3: Auth Boundary Creep

**What goes wrong:** A source works locally only with cookies or copied app headers.
**Why it happens:** Public chart pages are unstable, tempting private fallbacks.
**How to avoid:** Reject cookie/auth/token manifest config and keep auth-only sources deferred.
**Warning signs:** Manifest supports `headers.authorization`, `cookie`, copied mobile API params, or CAPTCHA workarounds.

### Pitfall 4: Parsing Current Pages as Stable APIs

**What goes wrong:** Adapter assumes one HTML/script shape and fails after source markup changes.
**Why it happens:** QQ/Kugou/NetEase are public pages, not formal public APIs.
**How to avoid:** Use source-specific parse functions, expected row counts, fixture tests, warnings when row count is low, and health status when shape changes.

### Pitfall 5: Manual Snapshot Ambiguity

**What goes wrong:** CAVCA manual rows are hard to audit later because capture date, issue name, or source article URL is missing.
**Why it happens:** Manual rows are treated like loose CSV.
**How to avoid:** Use JSON manual snapshots with `sourceName`, `sourceUrl`, `publishedAt`, `capturedAt`, and row-level rank/title/artists.

### Pitfall 6: Phase Boundary Leak Into Normalization

**What goes wrong:** Adapter trims descriptors, merges artists, or canonicalizes title keys.
**Why it happens:** It feels useful while parsing.
**How to avoid:** Only trim surrounding whitespace and split obvious artist arrays when the source provides separable artist fields; leave canonical keys to Phase 13.

### Pitfall 7: Live Network Tests Only

**What goes wrong:** CI/local tests fail because public chart sites are slow, blocked, or changed.
**Why it happens:** Adapter tests fetch live URLs.
**How to avoid:** Store small fixture HTML/JSON/manual files and inject `fetchImpl` into adapters; keep live probes as manual smoke checks.

## Code Examples

Verified patterns from official/current sources:

### CLI Parsing

```typescript
// Source: Node util.parseArgs official docs
import { parseArgs } from "node:util";

export function parseCollectSourceArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      manifest: { type: "string" },
      out: { type: "string" },
      "timeout-ms": { type: "string", default: "10000" },
      help: { type: "boolean", short: "h" }
    }
  });

  return {
    manifestPath: values.manifest,
    outDir: values.out,
    timeoutMs: Number.parseInt(values["timeout-ms"] ?? "10000", 10),
    help: values.help === true
  };
}
```

### Fetch With Timeout

```typescript
// Source: Node global fetch and AbortSignal.timeout official docs
export async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "home-ktv-hot-songs/0.1 (+public metadata only)"
    }
  });

  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status}`);
  }

  return response.text();
}
```

### Cheerio HTML Parsing

```typescript
// Source: Cheerio loading docs
import * as cheerio from "cheerio";

export function parseKugouRows(html: string, sourceId: string) {
  const $ = cheerio.load(html);

  return $(".pc_temp_songlist li")
    .toArray()
    .map((element, index) => {
      const titleAttr = $(element).attr("title") ?? "";
      const [artistPart, titlePart] = titleAttr.split(" - ");
      return {
        sourceId,
        rank: index + 1,
        rawTitle: titlePart?.trim() ?? $(element).find(".pc_temp_songname").text().trim(),
        rawArtists: artistPart ? artistPart.split(/[、/]/u).map((artist) => artist.trim()).filter(Boolean) : [],
        warnings: titleAttr ? [] : ["missing-title-attribute"]
      };
    });
}
```

### Manual Snapshot Schema

```typescript
export const ManualSnapshotSchema = z.object({
  schemaVersion: z.literal("hot-songs.manual-source.v1"),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  publishedAt: z.string().date(),
  capturedAt: z.string().datetime(),
  rows: z.array(
    z.object({
      rank: z.number().int().min(1).nullable(),
      title: z.string().min(1),
      artists: z.array(z.string().min(1)).min(1),
      notes: z.string().optional()
    })
  )
});
```

### Runner Aggregation

```typescript
export async function collectSources(manifest: SourceManifest, context: CollectContext) {
  const enabledSources = manifest.sources.filter((source) => source.enabled);
  const settled = await Promise.allSettled(
    enabledSources.map((source) => collectOneSource(source, context))
  );

  const results = settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : failedSourceResult(enabledSources[index], result.reason)
  );

  const statuses = results.map((result) => result.status);
  const rows = results.flatMap((result) => result.rows);

  if (!statuses.some((status) => status.usable && status.rowCount > 0)) {
    throw new Error("No usable source rows were collected");
  }

  return { rows, statuses };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Add axios/got for every CLI fetcher | Use Node global `fetch` with timeouts | `fetch` became non-experimental in Node 21; project targets modern Node | Simpler dependency graph and enough features for public metadata pages. |
| Custom CLI arg parser | `node:util.parseArgs` | Stable in Node 20 | No need for `commander` for this small internal command. |
| Handwritten validation | Zod 4 schemas | Zod 4 is current as of 2026 | Better errors for invalid manifests/manual snapshots. |
| OCR CAVCA images | Manual snapshot rows | v1.2 scope decision | Avoids OCR noise and scope creep. |
| Private/mobile chart APIs | Public page/manual metadata adapters | Compliance boundary from project + milestone | Keeps source collection maintainable and defensible. |

**Deprecated/outdated for this phase:**

- `request`/legacy HTTP clients: unnecessary and obsolete for modern Node.
- `axios` by default: not needed unless a later phase proves native fetch insufficient.
- Private provider APIs, cookies, and CAPTCHA bypasses: out of scope and should be blocked by manifest validation.
- Candidate Markdown/CSV exports in Phase 12: defer to Phase 14.

## Open Questions

1. **Where should real manual CAVCA snapshots live?**
   - What we know: Phase 12 needs manual snapshot support and CAVCA details are image-heavy.
   - What's unclear: Whether the user wants committed example snapshots only or local uncommitted real snapshots under `.planning/source-snapshots/`.
   - Recommendation: Commit fixture/example snapshots under `packages/hot-songs/fixtures`; allow real local paths through the manifest.

2. **Should stale manual snapshots remain usable?**
   - What we know: SRC-04 requires stale status visibility and SRC-05 allows partial usable sources.
   - What's unclear: Whether stale CAVCA data should contribute to later ranking or only be reported.
   - Recommendation: Make `stale` visible; include `usableWhenStale` in manifest defaulting to `false` for public charts and `true` for manual KTV-first snapshots only when explicitly set.

3. **How many support sources are required in Phase 12?**
   - What we know: Requirements name QQ/Kugou/NetEase "when available"; probes show all three public pages returned HTTP 200.
   - What's unclear: Whether lower-priority KTV-adjacent sites should be included now.
   - Recommendation: Implement QQ, Kugou, and NetEase support adapters; defer Changba/51VV/KTVSky unless Phase 12 has spare capacity.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | CLI runtime, native fetch, parseArgs | Yes | Local `v25.8.0`; target >=24 | Use project Node baseline; no fallback needed. |
| pnpm | Workspace scripts and package installs | Yes | `10.33.2` | None needed. |
| npm registry access | Version verification/package install | Yes | npm `11.11.0`; `npm view` succeeded | If unavailable during execution, pin versions from this research and install later. |
| `tsx` in root command path | Running TS CLI | No | `pnpm exec tsx` failed at repo root; current package version is `4.21.0` | Add `tsx` to `@home-ktv/hot-songs` dev deps and run through `pnpm -F`. |
| Vitest for new package | TypeScript unit tests | Partial | Apps have Vitest; new package does not yet | Add package-local `vitest@4.1.5`. |
| Live public source HTTP access | Manual smoke probes | Yes | QQ/Kugou/NetEase/CAVCA/51VV/Changba/KTVSky returned HTTP 200 on 2026-05-10 | Fixture mode for tests; live failures become source statuses. |
| PostgreSQL/API/OpenList/media storage | Not required | Not needed | - | Do not use in Phase 12. |

**Missing dependencies with no fallback:**

- None.

**Missing dependencies with fallback:**

- Root-level `tsx` command is missing. Create `@home-ktv/hot-songs`, add `tsx`, and invoke through a root script.
- New package Vitest config/dependency is missing. Add it in Wave 0 before adapter implementation.

## Sources

### Primary (HIGH confidence)

- Local required files: `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/research/*.md`, root/API package files, `scripts/seed-demo-song.mjs`, and `apps/api/src/modules/catalog/search-normalization.ts`.
- Local project instructions: `CLAUDE.md`; `AGENTS.md` absent; no project-local `.claude/skills` or `.agents/skills` directories found.
- Node.js official docs: `fetch`, `AbortSignal.timeout`, and `util.parseArgs` - https://nodejs.org/api/globals.html and https://nodejs.org/api/util.html
- Zod official docs: schemas, parse, inferred types - https://zod.dev/basics
- Cheerio official docs: `load` for HTML strings - https://cheerio.js.org/docs/basics/loading/
- Vitest official docs: package-local install and `.test.` naming - https://vitest.dev/guide/
- tsx official docs: Node CLI usage with `node --import tsx` - https://tsx.is/dev-api/node-cli
- npm registry metadata verified with `npm view` for `tsx`, `zod`, `cheerio`, `vitest`, `csv-stringify`, `typescript`, `@types/node`, and `turbo`.
- Public source probes on 2026-05-10: QQ Music `https://y.qq.com/n/ryqq/toplist/36`, CAVCA `https://www.cavca.org/news/49`, CAVCA detail `https://www.cavca.org/newsDetail/2329`, Kugou `https://www.kugou.com/yy/rank/home`, NetEase `https://music.163.com/discover/toplist`.

### Secondary (MEDIUM confidence)

- Existing milestone research under `.planning/research/STACK.md`, `.planning/research/FEATURES.md`, `.planning/research/PITFALLS.md`, and `.planning/research/SUMMARY.md`; these were current on 2026-05-10 and rechecked against live probes where source volatility mattered.

### Tertiary (LOW confidence)

- None used for prescriptive recommendations.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - versions were verified from npm registry and official docs; repo already uses TypeScript, pnpm, and Vitest.
- Architecture: HIGH - package isolation follows current workspace patterns and directly protects Phase 12's non-mutation boundary.
- Source adapters: MEDIUM-HIGH - live probes confirm current public page data, but chart pages are not formal stable APIs and must be guarded by source health.
- Pitfalls: HIGH - drawn from milestone risk docs, current source probes, and explicit phase constraints.

**Research date:** 2026-05-10
**Valid until:** 2026-05-17 for public source adapter details; 2026-06-09 for package/API stack guidance.
