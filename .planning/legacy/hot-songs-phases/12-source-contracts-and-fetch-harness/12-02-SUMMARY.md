---
phase: 12-source-contracts-and-fetch-harness
plan: 02
subsystem: tooling
tags: [typescript, zod, manifest, fixtures, manual-snapshot]

requires:
  - phase: 12-source-contracts-and-fetch-harness
    provides: 12-01 package shell and source contracts
provides:
  - JSON source manifest loading and validation
  - Root-relative run path resolution for pnpm filter execution
  - Example KTV-first source manifest with QQ K歌金曲榜 and CAVCA 金麦榜
  - Manual JSON snapshot adapter preserving raw KTV source rows
affects: [SRC-01, SRC-02, phase-12]

tech-stack:
  added: []
  patterns:
    - Root invocation path resolution through resolveRunPath()
    - Manual snapshot adapter maps validated rows without normalization, dedupe, or scoring

key-files:
  created:
    - packages/hot-songs/src/manifest.ts
    - packages/hot-songs/src/adapters/manual-json.ts
    - packages/hot-songs/src/test/manifest.test.ts
    - packages/hot-songs/fixtures/manifests/default.fixture.json
    - packages/hot-songs/fixtures/manual-snapshots/cavca-golden-mic.fixture.json
    - packages/hot-songs/config/sources.example.json
  modified: []

key-decisions:
  - "Manifest paths can be root-relative even when pnpm executes inside packages/hot-songs."
  - "CAVCA 金麦榜 is represented as a manual JSON snapshot for Phase 12 instead of OCR or private scraping."
  - "Manual adapter preserves raw titles, artists, rank, source URL, published date, collected date, and warnings for later phases."

patterns-established:
  - "loadSourceManifest() reads JSON and validates SourceManifestSchema before use."
  - "collectManualJsonSource() resolves source.file through resolveRunPath() and validates ManualSnapshotSchema."
  - "Fixtures live under packages/hot-songs/fixtures for offline repeatable tests."

requirements-completed: [SRC-01, SRC-02]

duration: 3m
completed: 2026-05-10
---

# Phase 12 Plan 02: Manifest and Manual Snapshot Summary

**Manifest loading and CAVCA-style manual snapshot ingestion with root-relative paths and raw source row preservation**

## Performance

- **Duration:** 3m
- **Started:** 2026-05-10T06:06:41Z
- **Completed:** 2026-05-10T06:09:23Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added manifest loading helpers for JSON reads, manifest validation, required `--manifest` checks, and root-relative path resolution.
- Added default and example manifests containing QQ Music K歌金曲榜 and CAVCA 金麦榜 as KTV-first sources.
- Added a manual CAVCA fixture and adapter that emits raw `SourceRow` records while preserving variant descriptors such as `同手同脚 (Live)` and `Run Wild（向风而野）`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Load source manifests** - `ae19f5a` (feat)
2. **Task 2: Add manual JSON snapshot adapter** - `ce847ce` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `packages/hot-songs/src/manifest.ts` - JSON read, manifest validation, required manifest check, and run path resolution.
- `packages/hot-songs/src/adapters/manual-json.ts` - Manual snapshot adapter for raw `SourceRow` output.
- `packages/hot-songs/src/test/manifest.test.ts` - Manifest and manual adapter coverage.
- `packages/hot-songs/fixtures/manifests/default.fixture.json` - Offline source manifest fixture.
- `packages/hot-songs/fixtures/manual-snapshots/cavca-golden-mic.fixture.json` - CAVCA manual snapshot fixture.
- `packages/hot-songs/config/sources.example.json` - Example manifest for user-facing single-run configuration.

## Decisions Made

- Used `process.env.INIT_CWD` in `resolveRunPath()` because `pnpm -F @home-ktv/hot-songs` executes package scripts with root-relative arguments.
- Kept CAVCA as manual JSON input in Phase 12, matching the no-OCR scope.
- Mapped manual row `notes` into `warnings` so later phases can surface row-level caveats without changing raw title or artist fields.

## Verification

- `pnpm -F @home-ktv/hot-songs test -- src/test/manifest.test.ts` - passed.
- `pnpm -F @home-ktv/hot-songs typecheck` - passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TDD RED runs failed as expected before `manifest.ts` and `manual-json.ts` existed. The final verification commands passed after implementation.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-03 can wire the runner and CLI around the manifest loader and manual adapter, then write source rows and source health reports for a single run.

## Self-Check: PASSED

- Found manifest loader: `packages/hot-songs/src/manifest.ts`
- Found manual adapter: `packages/hot-songs/src/adapters/manual-json.ts`
- Found CAVCA fixture: `packages/hot-songs/fixtures/manual-snapshots/cavca-golden-mic.fixture.json`
- Found task commit: `ae19f5a`
- Found task commit: `ce847ce`

---
*Phase: 12-source-contracts-and-fetch-harness*
*Completed: 2026-05-10*
