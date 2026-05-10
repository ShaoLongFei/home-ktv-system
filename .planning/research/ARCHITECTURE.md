# Architecture Research: v1.2 热门歌曲候选名单

**Researched:** 2026-05-10
**Scope:** Single-run metadata-only candidate-list generator.

## Recommendation

Implement v1.2 as a root-level TypeScript CLI plus pure modules under `scripts/hot-song-candidates/`. Keep it outside the API runtime and do not modify the KTV database, media library, OpenList storage, import candidates, or playback state.

## File Layout

```text
scripts/generate-hot-song-candidates.ts
scripts/hot-song-candidates/config.ts
scripts/hot-song-candidates/types.ts
scripts/hot-song-candidates/sources.ts
scripts/hot-song-candidates/source-adapters/*.ts
scripts/hot-song-candidates/normalize.ts
scripts/hot-song-candidates/dedupe.ts
scripts/hot-song-candidates/scoring.ts
scripts/hot-song-candidates/exporters.ts
scripts/hot-song-candidates/fixtures/
scripts/hot-song-candidates/*.test.ts
.planning/hot-song-sources.example.json
```

## Data Flow

1. CLI parses config path, output directory, top count, source filters, and fixture/offline mode.
2. Config loader validates the source manifest.
3. Source adapters emit `SourceRow[]` and `SourceStatus`.
4. Normalizer produces raw/display/canonical fields and version warnings.
5. Dedupe groups rows conservatively into candidate identities.
6. Scoring computes deterministic 0-100 scores and tiers.
7. Exporters atomically write Markdown, CSV, JSON, and source report artifacts.

## Core Contracts

```ts
export interface SourceRow {
  sourceId: string;
  sourceName: string;
  sourceClass: "ktv_order" | "karaoke_app" | "streaming_chart" | "short_video_proxy" | "manual_seed";
  sourceUrl: string;
  period: string | null;
  fetchedAt: string;
  rank: number | null;
  title: string;
  artistName: string | null;
  rawTitle: string;
  rawArtistName: string | null;
  confidence: "high" | "medium" | "low";
}
```

JSON output should include `schemaVersion`, `runId`, source statuses, candidate ids, canonical keys, score breakdown, warnings, and all contributing source rows.

## Build Order

1. Source contracts, config validation, CLI shell, manual snapshot adapter, and fixture harness.
2. Initial public adapters for QQ `K歌金曲榜` and selected support charts.
3. Normalization and conservative dedupe.
4. Deterministic scoring and tiering.
5. Markdown/CSV/JSON/source-report exporters and single-run documentation.

## Boundaries

No API routes, DB migrations, import scanner changes, online supplement task integration, Admin UI, OpenList matching, downloads, scheduler, weekly comparison, private/login scraping, or OCR in v1.2.
