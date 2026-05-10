---
phase: 13-normalization-and-dedupe
plan: 03
subsystem: tooling
tags: [typescript, cli, normalization, fixture]

requires:
  - phase: 13-normalization-and-dedupe
    provides: Candidate grouping builder from 13-02
  - phase: 12-source-contracts-and-fetch-harness
    provides: Fixture source rows and source health report artifacts
provides:
  - `pnpm hot-songs:normalize` command
  - Candidate normalization CLI with source rows/source report inputs
  - Phase 13 fixture candidate snapshot JSON
  - CLI tests for argument parsing and snapshot generation
affects: [NORM-01, NORM-02, NORM-03, NORM-04, phase-14]

tech-stack:
  added: []
  patterns:
    - Root scripts delegate to package scripts with pnpm filters
    - CLI parses pnpm `--` separators with node:util parseArgs
    - Fixture candidate snapshots reuse source artifact generatedAt for repeatable output

key-files:
  created:
    - packages/hot-songs/src/normalize-cli.ts
    - packages/hot-songs/src/test/normalize-cli.test.ts
    - .planning/reports/hot-songs/phase-13-fixture-candidates/candidate-snapshot.json
  modified:
    - package.json
    - packages/hot-songs/package.json
    - packages/hot-songs/src/normalize-cli.ts
    - packages/hot-songs/src/test/normalize-cli.test.ts

key-decisions:
  - "The normalize command accepts source-row artifacts plus optional source-report artifacts and writes only candidate-snapshot.json."
  - "Source report generatedAt takes precedence over source rows generatedAt, keeping fixture output stable when the same inputs are regenerated."
  - "No scoring, ranking tiers, OpenList matching, downloads, scheduler, database/catalog mutation, Admin UI, or OCR work was added."

patterns-established:
  - "runNormalizeSourcesCli() is the CLI entrypoint for source-row to candidate-snapshot conversion."
  - "Candidate fixture snapshots are committed under .planning/reports/hot-songs/<phase-slug>/ for downstream phase planning."
  - "CLI tests exercise real fixture artifacts through temporary output directories."

requirements-completed: [NORM-01, NORM-02, NORM-03, NORM-04]

duration: 8m
completed: 2026-05-10
---

# Phase 13 Plan 03: Normalize CLI and Fixture Snapshot Summary

**CLI command for generating schema-versioned candidate snapshots from Phase 12 source-row artifacts**

## Performance

- **Duration:** 8m
- **Started:** 2026-05-10T06:44:50Z
- **Completed:** 2026-05-10T06:52:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added root `pnpm hot-songs:normalize` and package `pnpm -F @home-ktv/hot-songs normalize` scripts.
- Added `parseNormalizeSourcesArgs()` and `runNormalizeSourcesCli()` for source-row normalization.
- Generated `.planning/reports/hot-songs/phase-13-fixture-candidates/candidate-snapshot.json` with 6 candidates from 15 source rows.
- Verified the fixture contains source statuses, raw evidence, stable candidate IDs, and `variant-live` warnings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add normalization CLI** - `5559d82` (feat)
2. **Task 2: Generate and verify fixture candidate snapshot** - `35670e2` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `package.json` - Added `hot-songs:normalize` root script.
- `packages/hot-songs/package.json` - Added package-level `normalize` script.
- `packages/hot-songs/src/normalize-cli.ts` - Normalization CLI, argument parsing, input validation, source report loading, and snapshot writing.
- `packages/hot-songs/src/test/normalize-cli.test.ts` - CLI argument and fixture snapshot generation tests.
- `.planning/reports/hot-songs/phase-13-fixture-candidates/candidate-snapshot.json` - Fixture candidate snapshot for Phase 14.

## Decisions Made

- Supported both raw arrays and wrapped artifact objects for source rows/source statuses so tests and future tooling can reuse the same CLI path.
- Used source report `generatedAt` when present so committed fixture output is stable across reruns with identical source artifacts.
- Kept normalize output limited to `candidate-snapshot.json`; final Markdown/CSV exports stay in later ranking/export work.

## Verification

- `pnpm -F @home-ktv/hot-songs test -- src/test/normalize-cli.test.ts` - passed, 8 files / 38 tests.
- `pnpm -F @home-ktv/hot-songs test` - passed, 8 files / 38 tests.
- `pnpm -F @home-ktv/hot-songs typecheck` - passed.
- `pnpm hot-songs:normalize -- --source-rows .planning/reports/hot-songs/phase-12-fixture-all/source-rows.json --source-report .planning/reports/hot-songs/phase-12-fixture-all/source-report.json --out .planning/reports/hot-songs/phase-13-fixture-candidates` - passed.
- Snapshot assertion checked schema `hot-songs.candidate-snapshot.v1`, `generatedAt`, `sourceRowCount=15`, `candidateCount=6`, `后来` evidence count, `variant-live`, and `song_` IDs.
- Scope guard found no scoring/ranking/tier/OpenList/download/scheduler/cron/database/postgres/Fastify/Admin UI/OCR keywords in normalize scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stabilized fixture generatedAt**
- **Found during:** Task 2 (Generate and verify fixture candidate snapshot)
- **Issue:** The first generated snapshot used the current clock, so rerunning the same fixture command would rewrite the committed artifact.
- **Fix:** CLI now carries `generatedAt` from source report first, then source rows, before falling back to builder defaults.
- **Files modified:** `packages/hot-songs/src/normalize-cli.ts`, `packages/hot-songs/src/test/normalize-cli.test.ts`
- **Verification:** `normalize-cli.test.ts`, typecheck, and the fixture command all passed; generated snapshot now has `2026-05-10T06:26:28.264Z`.
- **Committed in:** `35670e2`

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** Improved repeatability without adding any out-of-scope ranking, export, matching, scheduling, UI, or runtime mutation behavior.

## Issues Encountered

- Initial CLI typecheck hit `exactOptionalPropertyTypes` when passing optional `sourceStatuses` as `undefined`; fixed before Task 1 commit by omitting the optional field unless a source report is provided.
- The first generated fixture showed nondeterministic `generatedAt`; fixed during Task 2 as documented above.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 14 can consume `.planning/reports/hot-songs/phase-13-fixture-candidates/candidate-snapshot.json` to design scoring, ranking tiers, and export formats against stable candidate identities and preserved evidence.

## Self-Check: PASSED

- Found normalize CLI: `packages/hot-songs/src/normalize-cli.ts`
- Found CLI tests: `packages/hot-songs/src/test/normalize-cli.test.ts`
- Found fixture snapshot: `.planning/reports/hot-songs/phase-13-fixture-candidates/candidate-snapshot.json`
- Found task commit: `5559d82`
- Found task commit: `35670e2`

---
*Phase: 13-normalization-and-dedupe*
*Completed: 2026-05-10*
