---
phase: 16-policy-seam-android-reservation-and-hardening
plan: "02"
subsystem: testing
tags: [api, admin, vitest, regression, real-mv-compatibility]

requires:
  - phase: 15-search-queue-playback-and-switching
    provides: real-MV search, queue, playback, and switching behavior to preserve alongside legacy flows
provides:
  - HARD-03 compatibility regression coverage for demo songs, online supplement tasks, queue commands, and Admin catalog maintenance
  - Legacy queue command regression with real-MV assets present in the harness
  - Admin catalog regression with legacy song maintenance controls rendered beside a real-MV catalog entry
affects: [phase-16, HARD-03, api-tests, admin-tests]

tech-stack:
  added: []
  patterns:
    - Existing regression suites cover legacy behavior with real-MV fixtures present instead of adding new runtime branches.

key-files:
  created:
    - .planning/phases/16-policy-seam-android-reservation-and-hardening/16-02-SUMMARY.md
  modified:
    - apps/api/src/test/seed-demo-song.test.ts
    - apps/api/src/test/online-candidate-task.test.ts
    - apps/api/src/test/admin-online-task-actions.test.ts
    - apps/api/src/test/room-queue-commands.test.ts
    - apps/admin/src/test/song-catalog.test.tsx

key-decisions:
  - "HARD-03 hardening stays test-only and does not change queue, online task, demo import, or Admin runtime semantics."
  - "Admin compatibility is proven by rendering a real-MV catalog entry beside the legacy 七里香 song while asserting existing maintenance controls remain visible."

patterns-established:
  - "Compatibility regressions should add real-MV data to existing harnesses while asserting legacy behavior remains unchanged."

requirements-completed: [HARD-03]

duration: 9min
completed: 2026-05-13
---

# Phase 16 Plan 02: Compatibility Regression Hardening Summary

**Legacy demo, online supplement, queue command, and Admin catalog regressions now run with real-MV schema/assets present.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-13T12:37:45Z
- **Completed:** 2026-05-13T12:46:14Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Strengthened demo song assertions for exact generated titles and distinctness.
- Added online supplement visibility and discovered-state assertions.
- Added an API queue regression covering legacy add/delete/undo/promote/skip and `switch-vocal-mode` paths with a real-MV asset in the harness.
- Added Admin catalog regression proving legacy `七里香` metadata, default-resource, and asset edit controls remain visible beside a real-MV catalog entry.

## Task Commits

1. **Task 1: Keep demo/local/online queue compatibility green after real-MV schema changes** - `a7bb4e5` (test)
2. **Task 2: Keep Admin song maintenance regression green alongside real-MV assets** - `726779f` (test)

## Files Created/Modified

- `apps/api/src/test/seed-demo-song.test.ts` - Asserts exact demo song titles and distinct generated songs.
- `apps/api/src/test/online-candidate-task.test.ts` - Asserts visible request-supplement entry and discovered candidate task state.
- `apps/api/src/test/admin-online-task-actions.test.ts` - Makes the no queue append mutation assertion explicit for promote.
- `apps/api/src/test/room-queue-commands.test.ts` - Adds legacy command regression with real-MV assets present.
- `apps/admin/src/test/song-catalog.test.tsx` - Adds Admin catalog regression with legacy maintenance controls beside a real-MV catalog entry.
- `.planning/phases/16-policy-seam-android-reservation-and-hardening/16-02-SUMMARY.md` - Execution summary.

## Decisions Made

- Kept the implementation test-only; no runtime semantics changed.
- Used existing test harnesses and mocked catalog data rather than adding new real-MV-specific Admin controls to the legacy catalog suite.

## Deviations from Plan

The plan marked both tasks as TDD, but the requested work was compatibility assertion hardening for behavior that already existed. No production GREEN step was needed, so the work was committed as test-only task commits after verification.

**Total deviations:** 0 auto-fixed code issues.
**Impact on plan:** No scope expansion; runtime behavior was intentionally unchanged.

## Issues Encountered

- The final API command `pnpm -F @home-ktv/api test -- src/test/seed-demo-song.test.ts src/test/online-candidate-task.test.ts src/test/admin-online-task-actions.test.ts src/test/room-queue-commands.test.ts` currently runs the full API suite because the extra `--` reaches Vitest. During final verification it failed on unrelated parallel Phase 16 policy work in `src/test/admin-imports-routes.test.ts`, outside this plan's owned files.
- This plan's owned API regression files passed directly with `pnpm -F @home-ktv/api exec vitest run src/test/seed-demo-song.test.ts src/test/online-candidate-task.test.ts src/test/admin-online-task-actions.test.ts src/test/room-queue-commands.test.ts`.
- The Admin plan command passed.

## Verification

- `pnpm -F @home-ktv/api exec vitest run src/test/seed-demo-song.test.ts src/test/online-candidate-task.test.ts src/test/admin-online-task-actions.test.ts src/test/room-queue-commands.test.ts` - 4 files, 33 tests passed.
- `pnpm -F @home-ktv/admin test -- src/test/song-catalog.test.tsx` - 7 files, 37 tests passed.
- `rg -n "Demo Song Sunrise|Demo Song Night Drive|请求补歌|switch-vocal-mode" apps/api/src/test/seed-demo-song.test.ts apps/api/src/test/online-candidate-task.test.ts apps/api/src/test/admin-online-task-actions.test.ts apps/api/src/test/room-queue-commands.test.ts` - passed.
- `rg -n "切换质量: verified|默认资源|歌曲目录" apps/admin/src/test/song-catalog.test.tsx` - passed.

## Known Stubs

None. Stub-pattern scan found only test helper defaults and nullable fixture fields, not product-facing UI stubs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

HARD-03 compatibility coverage is in place for legacy demo, online, queue, and Admin maintenance flows. Remaining Phase 16 plans can focus on local real-media hardening and Android boundary guards.

## Self-Check: PASSED

- Summary file exists.
- Task commit `a7bb4e5` exists.
- Task commit `726779f` exists.

---
*Phase: 16-policy-seam-android-reservation-and-hardening*
*Completed: 2026-05-13*
