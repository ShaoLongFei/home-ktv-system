---
phase: 12-source-contracts-and-fetch-harness
plan: 04
subsystem: tooling
tags: [typescript, cheerio, fetch, qq-music, adapters]

requires:
  - phase: 12-source-contracts-and-fetch-harness
    provides: 12-03 runner, source health report, and CLI adapter registry
provides:
  - Native fetch helper with timeout and public metadata user-agent
  - QQ Music K歌金曲榜 adapter for `qq_toplist`
  - Fixture-backed parser for embedded `window.__INITIAL_DATA__`
  - CLI registry mapping for QQ public toplist collection
affects: [SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, phase-12]

tech-stack:
  added: [cheerio]
  patterns:
    - Native fetch wrapper with AbortSignal.timeout and explicit public metadata user-agent
    - Cheerio-backed extraction of embedded public chart data
    - Adapter parser functions are fixture-testable without network access

key-files:
  created:
    - packages/hot-songs/src/fetch/http.ts
    - packages/hot-songs/src/adapters/qq-toplist.ts
    - packages/hot-songs/src/test/adapters.test.ts
    - packages/hot-songs/fixtures/html/qq-kge-toplist.fixture.html
  modified:
    - packages/hot-songs/package.json
    - pnpm-lock.yaml
    - packages/hot-songs/src/cli.ts
    - packages/hot-songs/src/runner.ts

key-decisions:
  - "Public chart fetching uses native fetch and AbortSignal.timeout instead of adding an HTTP client dependency."
  - "QQ K歌金曲榜 parsing reads embedded window.__INITIAL_DATA__ and preserves raw title/artist fields."
  - "Missing QQ source period/date becomes a row warning instead of synthetic freshness metadata."

patterns-established:
  - "collectQqToplistSource() owns live fetch, while parseQqToplistRows() is pure and fixture-testable."
  - "Adapter registry maps implemented adapters directly and leaves later providers to their own plan."
  - "CollectContext carries timeoutMs so CLI timeout settings can reach live public adapters."

requirements-completed: [SRC-01, SRC-02, SRC-03, SRC-04, SRC-05]

duration: 4m
completed: 2026-05-10
---

# Phase 12 Plan 04: QQ KGE Toplist Adapter Summary

**QQ Music K歌金曲榜 public adapter with timeout-bound fetch, embedded data parsing, and fixture-backed row extraction**

## Performance

- **Duration:** 4m
- **Started:** 2026-05-10T06:15:43Z
- **Completed:** 2026-05-10T06:19:25Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added `cheerio@1.2.0` and a native fetch helper that applies `AbortSignal.timeout()` plus `home-ktv-hot-songs/0.1 (+public metadata only)`.
- Added `collectQqToplistSource()` and `parseQqToplistRows()` for QQ Music embedded toplist data.
- Added a QQ K歌金曲榜 fixture with `后来`, `小幸运`, and `Run Wild（向风而野）`, and wired `qq_toplist` into the CLI adapter registry.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add public fetch helper** - `999eeb8` (feat)
2. **Task 2: Parse QQ K歌 toplist rows** - `fe8cc8d` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `packages/hot-songs/package.json` - Added `cheerio@1.2.0`.
- `pnpm-lock.yaml` - Recorded Cheerio dependency tree.
- `packages/hot-songs/src/fetch/http.ts` - Public metadata fetch helper.
- `packages/hot-songs/src/adapters/qq-toplist.ts` - QQ embedded toplist parser and live collector.
- `packages/hot-songs/src/cli.ts` - Maps `qq_toplist` to `collectQqToplistSource()`.
- `packages/hot-songs/src/runner.ts` - Adds `timeoutMs` to collect context.
- `packages/hot-songs/src/test/adapters.test.ts` - QQ parser fixture tests.
- `packages/hot-songs/fixtures/html/qq-kge-toplist.fixture.html` - Offline QQ K歌 fixture.

## Decisions Made

- Used Cheerio only for script extraction; the parser still validates data shape through explicit TypeScript guards.
- Kept `parseQqToplistRows()` separate from network fetch to make public page shape changes testable with fixtures.
- Propagated CLI `--timeout-ms` into adapter context for live public source collection.

## Verification

- `pnpm -F @home-ktv/hot-songs test -- src/test/adapters.test.ts` - passed.
- `pnpm -F @home-ktv/hot-songs typecheck` - passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TDD RED run failed as expected before `qq-toplist.ts` existed. Final adapter tests and typecheck passed after implementation.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-05 can add Kugou and NetEase fixture-backed support adapters and then run the full offline fixture manifest through the existing CLI and source health report.

## Self-Check: PASSED

- Found fetch helper: `packages/hot-songs/src/fetch/http.ts`
- Found QQ adapter: `packages/hot-songs/src/adapters/qq-toplist.ts`
- Found QQ fixture: `packages/hot-songs/fixtures/html/qq-kge-toplist.fixture.html`
- Found task commit: `999eeb8`
- Found task commit: `fe8cc8d`

---
*Phase: 12-source-contracts-and-fetch-harness*
*Completed: 2026-05-10*
