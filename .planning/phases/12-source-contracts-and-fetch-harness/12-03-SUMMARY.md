---
phase: 12-source-contracts-and-fetch-harness
plan: 03
subsystem: tooling
tags: [typescript, cli, runner, source-health, fixtures]

requires:
  - phase: 12-source-contracts-and-fetch-harness
    provides: 12-02 manifest loader and manual JSON snapshot adapter
provides:
  - Source runner that records succeeded, failed, stale, and skipped statuses
  - Source health report writer for `source-report.json`
  - CLI execution path for manual sources and visible partial failures
  - Fixture run artifacts for the CAVCA manual source
affects: [SRC-01, SRC-04, SRC-05, phase-12]

tech-stack:
  added: []
  patterns:
    - Runner returns complete rows and statuses, and throws typed errors with partial results when no usable sources remain
    - CLI resolves root-relative arguments through INIT_CWD before loading manifests or writing artifacts
    - Source reports use explicit statusCounts for all Phase 12 health statuses

key-files:
  created:
    - packages/hot-songs/src/runner.ts
    - packages/hot-songs/src/report/source-health.ts
    - packages/hot-songs/src/test/runner.test.ts
    - .planning/reports/hot-songs/phase-12-fixture/source-report.json
    - .planning/reports/hot-songs/phase-12-fixture/source-rows.json
  modified:
    - packages/hot-songs/src/cli.ts
    - packages/hot-songs/src/test/cli.test.ts

key-decisions:
  - "Runner skips disabled and filtered sources instead of silently omitting them."
  - "No-usable-source failures keep collected status data available so the CLI can still write source-report.json."
  - "Public adapters are wired to explicit temporary failure functions until 12-04 and 12-05 replace them."

patterns-established:
  - "collectSources() is the central health gate for all source adapters."
  - "buildSourceHealthReport() converts runner output into schema-versioned source-report.json payloads."
  - "runCollectSourcesCli() returns an exit code for tests and sets process.exitCode only when executed as the package script."

requirements-completed: [SRC-01, SRC-04, SRC-05]

duration: 6m
completed: 2026-05-10
---

# Phase 12 Plan 03: Runner and Manual CLI Summary

**Runnable source collection harness with visible source health, no-usable-source failure handling, and manual CAVCA CLI artifacts**

## Performance

- **Duration:** 6m
- **Started:** 2026-05-10T06:09:23Z
- **Completed:** 2026-05-10T06:15:43Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `collectSources()` and `collectOneSource()` to execute configured adapters while recording every configured source as `succeeded`, `failed`, `stale`, or `skipped`.
- Added `source-report.json` generation with row counts, usable flags, warnings, errors, status counts, and schema version `hot-songs.source-report.v1`.
- Wired `runCollectSourcesCli()` so the root command can load the example manifest, collect the CAVCA manual source, and write `source-report.json` plus `source-rows.json`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement runner and source health report** - `e7ec0b6` (feat)
2. **Task 2: Execute CLI with manual adapter** - `8679bf4` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `packages/hot-songs/src/runner.ts` - Source execution, status classification, partial failure handling, and no-usable-source gate.
- `packages/hot-songs/src/report/source-health.ts` - Source health report builder and writer.
- `packages/hot-songs/src/cli.ts` - Executable collect-sources CLI and artifact writing.
- `packages/hot-songs/src/test/runner.test.ts` - Runner, report, and CLI artifact tests.
- `packages/hot-songs/src/test/cli.test.ts` - Regression coverage for pnpm script argument separator handling.
- `.planning/reports/hot-songs/phase-12-fixture/source-report.json` - Manual CAVCA source health output.
- `.planning/reports/hot-songs/phase-12-fixture/source-rows.json` - Manual CAVCA raw source rows.

## Decisions Made

- Used a typed `CollectSourcesError` so failed runs can still expose rows/statuses gathered before the terminal gate.
- Kept not-yet-implemented public adapters visible as failed sources when selected, rather than pretending they do not exist.
- Wrote `source-rows.json` with a schema version and generated timestamp so later phases can consume it deterministically.

## Verification

- `pnpm -F @home-ktv/hot-songs test -- src/test/runner.test.ts` - passed.
- `pnpm -F @home-ktv/hot-songs typecheck` - passed.
- `pnpm hot-songs:sources -- --manifest packages/hot-songs/config/sources.example.json --out .planning/reports/hot-songs/phase-12-fixture --source cavca-golden-mic-manual` - passed and printed `Source collection complete: 3 rows from 1 usable sources`.
- Source report schema and CAVCA success check via `node -e ...` - passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Accepted pnpm script argument separator**

- **Found during:** Task 2 root command verification.
- **Issue:** `pnpm hot-songs:sources -- ...` invoked the package script as `tsx src/cli.ts -- --manifest ...`; `parseArgs` treated the leading `--` as a positional separator and rejected `--manifest`.
- **Fix:** `parseCollectSourcesArgs()` strips one leading `--`, and `cli.test.ts` covers the root-script argument shape.
- **Files modified:** `packages/hot-songs/src/cli.ts`, `packages/hot-songs/src/test/cli.test.ts`
- **Verification:** `pnpm -F @home-ktv/hot-songs test -- src/test/cli.test.ts`, `pnpm -F @home-ktv/hot-songs test -- src/test/runner.test.ts`, and the root command all passed.
- **Committed in:** `8679bf4` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for the user-facing root command; no scope change.

## Issues Encountered

- TDD RED runs failed as expected before `runner.ts`, `source-health.ts`, and CLI execution existed.
- The first actual root command failed on the pnpm argument separator issue documented above; the final verification command passed after the regression fix.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-04 can replace the temporary QQ adapter failure with a real QQ Music K歌金曲榜 public adapter while preserving the existing runner/report behavior.

## Self-Check: PASSED

- Found runner: `packages/hot-songs/src/runner.ts`
- Found source health writer: `packages/hot-songs/src/report/source-health.ts`
- Found CLI execution: `packages/hot-songs/src/cli.ts`
- Found source report artifact: `.planning/reports/hot-songs/phase-12-fixture/source-report.json`
- Found task commit: `e7ec0b6`
- Found task commit: `8679bf4`

---
*Phase: 12-source-contracts-and-fetch-harness*
*Completed: 2026-05-10*
