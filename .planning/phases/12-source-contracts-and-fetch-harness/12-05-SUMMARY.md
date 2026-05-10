---
phase: 12-source-contracts-and-fetch-harness
plan: 05
subsystem: tooling
tags: [typescript, cheerio, fixtures, kugou, netease, source-health]

requires:
  - phase: 12-source-contracts-and-fetch-harness
    provides: 12-04 public fetch helper and QQ toplist adapter
provides:
  - Kugou ranking HTML adapter and fixture
  - NetEase toplist pre-data adapter and fixture
  - Example manifest with KTV-first and support sources
  - CLI fixture mode for offline full source collection
  - Full fixture report containing all configured Phase 12 sources
affects: [SRC-01, SRC-02, SRC-03, SRC-04, SRC-05, phase-12]

tech-stack:
  added: []
  patterns:
    - Public chart adapters expose pure parser functions and live collector functions
    - CLI fixture mode swaps public adapters to local fixture HTML while leaving manual JSON behavior unchanged
    - Full source report verifies KTV-first and support source health in one run

key-files:
  created:
    - packages/hot-songs/src/adapters/kugou-rank-html.ts
    - packages/hot-songs/src/adapters/netease-toplist-html.ts
    - packages/hot-songs/fixtures/html/kugou-rank-home.fixture.html
    - packages/hot-songs/fixtures/html/netease-toplist.fixture.html
    - .planning/reports/hot-songs/phase-12-fixture-all/source-report.json
    - .planning/reports/hot-songs/phase-12-fixture-all/source-rows.json
  modified:
    - packages/hot-songs/src/cli.ts
    - packages/hot-songs/src/test/adapters.test.ts
    - packages/hot-songs/config/sources.example.json

key-decisions:
  - "Fixture mode is a CLI adapter-registry concern, not a runner concern, so source health behavior stays identical for live and offline runs."
  - "QQ 热歌榜 reuses the QQ fixture parser for offline verification while retaining its own source id, weight, URL, and support classification."
  - "Kugou and NetEase support rows preserve raw metadata only; normalization, dedupe, and scoring remain deferred."

patterns-established:
  - "Support adapters parse provider-specific public HTML into the shared SourceRow contract."
  - "sources.example.json now demonstrates the intended mix of KTV-first and support evidence sources."
  - "Final fixture artifacts under .planning/reports/hot-songs prove the command can run without live network access."

requirements-completed: [SRC-01, SRC-02, SRC-03, SRC-04, SRC-05]

duration: 5m
completed: 2026-05-10
---

# Phase 12 Plan 05: Support Adapters and Full Fixture Run Summary

**Kugou and NetEase support adapters plus a full offline fixture run across QQ, CAVCA, Kugou, and NetEase source definitions**

## Performance

- **Duration:** 5m
- **Started:** 2026-05-10T06:19:25Z
- **Completed:** 2026-05-10T06:24:57Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added Kugou ranking and NetEase toplist HTML adapters with fixture-backed parser coverage.
- Expanded `sources.example.json` to five configured sources: QQ K歌金曲榜, CAVCA 金麦榜 manual snapshot, QQ 热歌榜, Kugou 排行榜, and NetEase 云音乐榜单.
- Added `--fixture` mode so the CLI can collect all configured public/manual sources offline and produce source health plus raw source rows in one run.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Kugou and NetEase support adapters** - `a06e622` (feat)
2. **Task 2: Wire support sources and full fixture mode** - `bf2680c` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `packages/hot-songs/src/adapters/kugou-rank-html.ts` - Kugou ranking parser and live collector.
- `packages/hot-songs/src/adapters/netease-toplist-html.ts` - NetEase `song-list-pre-data` parser and live collector.
- `packages/hot-songs/src/cli.ts` - Fixture mode and support adapter registry wiring.
- `packages/hot-songs/src/test/adapters.test.ts` - QQ, Kugou, NetEase, and full fixture-mode CLI coverage.
- `packages/hot-songs/fixtures/html/kugou-rank-home.fixture.html` - Kugou support source fixture.
- `packages/hot-songs/fixtures/html/netease-toplist.fixture.html` - NetEase support source fixture.
- `packages/hot-songs/config/sources.example.json` - Five-source example manifest.
- `.planning/reports/hot-songs/phase-12-fixture-all/source-report.json` - Full fixture source health output.
- `.planning/reports/hot-songs/phase-12-fixture-all/source-rows.json` - Full fixture raw source rows.

## Decisions Made

- Kept fixture mode explicit behind `--fixture`; normal CLI runs still use public network adapters.
- Left sourcePublishedAt as `null` for Kugou/NetEase fixtures because the fixture data does not contain reliable publication dates.
- Kept Phase 12 row output raw and source-scoped, with no candidate identity, scoring, OpenList matching, or catalog mutation.

## Verification

- `pnpm -F @home-ktv/hot-songs test` - passed, 5 files / 24 tests.
- `pnpm -F @home-ktv/hot-songs typecheck` - passed.
- `pnpm hot-songs:sources -- --fixture --manifest packages/hot-songs/config/sources.example.json --out .planning/reports/hot-songs/phase-12-fixture-all` - passed and printed `Source collection complete: 15 rows from 5 usable sources`.
- Source report ID check for `qq-kge-toplist`, `cavca-golden-mic-manual`, `qq-hot-toplist`, `kugou-rank-home`, and `netease-toplist` - passed.
- Scope guard `rg` for OpenList/download/scheduler/cron/database/postgres/Fastify/Admin UI/OCR terms in Phase 12 tooling paths - passed with no matches.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TDD RED runs failed as expected before Kugou/NetEase adapters and fixture-mode collection existed.
- Acceptance checking required the literal `--fixture` to appear in `cli.ts`; the help usage string was updated to include it.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 13 can consume `source-rows.json` and source statuses from a complete fixture run to implement normalization and conservative dedupe without touching source collection mechanics.

## Self-Check: PASSED

- Found Kugou adapter: `packages/hot-songs/src/adapters/kugou-rank-html.ts`
- Found NetEase adapter: `packages/hot-songs/src/adapters/netease-toplist-html.ts`
- Found five-source manifest: `packages/hot-songs/config/sources.example.json`
- Found full fixture report: `.planning/reports/hot-songs/phase-12-fixture-all/source-report.json`
- Found task commit: `a06e622`
- Found task commit: `bf2680c`

---
*Phase: 12-source-contracts-and-fetch-harness*
*Completed: 2026-05-10*
