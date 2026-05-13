---
phase: 16-policy-seam-android-reservation-and-hardening
plan: 03
subsystem: tooling
tags: [real-mv, media-root, hardening, postgres, node-test]

requires:
  - phase: 12-contract-schema-and-playback-risk-spike
    provides: controlled real-MV playback risk report script
  - phase: 16-policy-seam-android-reservation-and-hardening
    provides: local real-media hardening context and representative sample paths
provides:
  - Phase 16 local real-MV hardening report CLI
  - Portable representative sample coverage without committed media fixtures
  - Optional best-effort catalog index cross-check report section
affects: [phase-16-hardening, real-mv-verification, local-media-validation]

tech-stack:
  added: []
  patterns:
    - Node CLI with explicit sample flags, MEDIA_ROOT defaults, and best-effort optional database reads
    - Portable node:test coverage using temp empty media files instead of binary fixtures

key-files:
  created:
    - .planning/phases/16-policy-seam-android-reservation-and-hardening/16-03-SUMMARY.md
  modified:
    - scripts/real-mv-playback-risk-spike.mjs
    - scripts/real-mv-playback-risk-spike.test.mjs

key-decisions:
  - "The Phase 16 report keeps the old controlled fixture path while adding explicit --sample-* flags and MEDIA_ROOT default sample resolution."
  - "The optional database/index cross-check is read-only and best-effort; missing pg support, unavailable tables, or connection errors are reported in Markdown instead of failing report generation."
  - "Legacy --mkv and --mpeg flags remain aliases for the new sample flags to avoid breaking existing local spike usage."

patterns-established:
  - "Local real-media validation can reference private MEDIA_ROOT samples while tests use temp files and assert only report behavior."
  - "Optional local environment integrations should degrade to report evidence, not block portable CLI execution."

requirements-completed: [HARD-02]

duration: 8 min
completed: 2026-05-13
---

# Phase 16 Plan 03: Local Real-Media Hardening Report Summary

**Phase 16 real-MV hardening report CLI with MEDIA_ROOT sample defaults and optional read-only catalog index evidence**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-13T13:06:13Z
- **Completed:** 2026-05-13T13:14:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `scripts/real-mv-playback-risk-spike.mjs` into a Phase 16 Markdown report CLI that supports `--media-root`, `--sample-mkv`, `--sample-mpg`, and `--database-url`.
- Added local hardening report output for resolved sample paths, filenames, MEDIA_ROOT default relative paths, and `index cross-check skipped` when no database URL is present.
- Added optional best-effort Postgres catalog/index summary using `songs`, `assets`, and `source_records` counts plus asset filename/path matches.
- Preserved controlled fixture reporting and prior `--mkv` / `--mpeg` aliases.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the real-MV spike script with local sample and index cross-check modes**
   - `aaa0359` test: add failing local hardening report tests
   - `f7687e1` feat: add local hardening report mode
2. **Task 2: Make the report point at the user's real sample library by default**
   - `254ae8d` test: add failing MEDIA_ROOT default sample test
   - `5447771` feat: report MEDIA_ROOT default sample resolution

**Plan metadata:** recorded in final docs commit.

## Files Created/Modified

- `scripts/real-mv-playback-risk-spike.mjs` - Adds Phase 16 local sample resolution, report fields, and optional index cross-check output.
- `scripts/real-mv-playback-risk-spike.test.mjs` - Covers help output, controlled fixture reporting, explicit temp sample reporting, and MEDIA_ROOT default sample resolution.
- `.planning/phases/16-policy-seam-android-reservation-and-hardening/16-03-SUMMARY.md` - Captures execution outcome and verification evidence.

## Verification

- `pnpm real-mv:risk-spike -- --help` - passed.
- `pnpm real-mv:risk-spike -- --controlled-only --output /tmp/real-mv-phase16-controlled.md` - passed.
- `node --test scripts/real-mv-playback-risk-spike.test.mjs` - passed, 4/4 tests.
- `rg -n -- "--media-root|--sample-mkv|--sample-mpg|--database-url|index cross-check skipped" scripts/real-mv-playback-risk-spike.mjs scripts/real-mv-playback-risk-spike.test.mjs` - passed.
- `rg -n "songs-sample/关喆-想你的夜\\(MTV\\)-国语-流行\\.mkv|songs-sample/蔡依林-BECAUSE OF YOU\\(演唱会\\)-国语-流行\\.mpg" scripts/real-mv-playback-risk-spike.mjs scripts/real-mv-playback-risk-spike.test.mjs` - passed.

## Decisions Made

- Kept the CLI portable by resolving real samples from explicit flags or `MEDIA_ROOT`, then falling back to controlled fixtures when no local sample context is available.
- Kept database cross-checking optional and informational so local report generation is not blocked by unavailable database access.
- Kept old sample flags as aliases for the new sample flags because existing local spike commands may still use them.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None. Stub scan only found internal null/empty initializers and output filtering in the CLI implementation; no placeholder report data or unwired UI data sources were introduced.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required. A `DATABASE_URL` can be passed when local catalog index evidence is desired.

## Next Phase Readiness

Phase 16 Plan 04 can use this report path as portable HARD-02 evidence while it adds Android boundary source guards and the final regression gate.

## Self-Check: PASSED

---
*Phase: 16-policy-seam-android-reservation-and-hardening*
*Completed: 2026-05-13*
