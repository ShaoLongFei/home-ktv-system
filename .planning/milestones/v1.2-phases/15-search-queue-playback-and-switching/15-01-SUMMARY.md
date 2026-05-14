---
phase: 15-search-queue-playback-and-switching
plan: 01
subsystem: api
tags: [search, catalog, real-mv, queueability, postgres]

requires:
  - phase: 14-admin-review-and-catalog-admission
    provides: reviewed single-asset real-MV catalog entries with trackRoles and compatibility state
provides:
  - Mobile-safe search version queueability metadata
  - Formal search visibility for ready and review-required real-MV assets
  - Chinese disabled labels for preprocess, temporary unavailable, and missing accompaniment states
affects: [mobile-search, queueing, real-mv-playback]

tech-stack:
  added: []
  patterns:
    - Search options derive queueability from persisted asset compatibility and reviewed trackRoles

key-files:
  created:
    - .planning/phases/15-search-queue-playback-and-switching/15-01-SUMMARY.md
  modified:
    - packages/domain/src/index.ts
    - apps/api/src/modules/catalog/repositories/song-repository.ts
    - apps/api/src/test/song-search-routes.test.ts

key-decisions:
  - "Search keeps unsupported or incomplete real-MV catalog entries visible, but marks their version options disabled with simple Chinese labels."
  - "Real-MV search options are grouped by asset identity instead of legacy switch family because one physical MV is one playable asset."

patterns-established:
  - "Search version options expose queueState, canQueue, and disabledLabel while keeping low-level compatibility diagnostics out of the Mobile contract."
  - "Legacy verified switch-pair search remains queueable by default; real-MV assets calculate queueability from compatibilityStatus and trackRoles."

requirements-completed: [PLAY-01, PLAY-05]

duration: 35 min
completed: 2026-05-13
---

# Phase 15 Plan 01: Search Visibility and Queueability Metadata Summary

**Formal search now returns real-MV assets with Mobile-safe queueability state and Chinese disabled labels.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-05-13T07:43:00Z
- **Completed:** 2026-05-13T08:18:33Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `queueState`, `canQueue`, and `disabledLabel` to search version options.
- Broadened formal search to include single-file real-MV assets alongside legacy verified switch pairs.
- Added route/repository regressions for queueable, preprocess-required, and missing-accompaniment real-MV search results.

## Task Commits

1. **Task 1: Add queueability metadata to search version options** - `b01a593`, `7853c19`
2. **Task 2: Include single-file real-MV assets in formal search results** - `bbe7d35`

## Files Created/Modified

- `packages/domain/src/index.ts` - Defines `SongSearchVersionQueueState` and queueability fields on `SongSearchVersionOption`.
- `apps/api/src/modules/catalog/repositories/song-repository.ts` - Includes real-MV assets in formal search and computes queueability labels.
- `apps/api/src/test/song-search-routes.test.ts` - Covers queueable and disabled real-MV search result contracts.

## Decisions Made

- Real-MV unavailable states remain visible in Mobile search instead of disappearing from search results.
- Mobile gets short Chinese labels only; detailed compatibility or probe reasons stay with Admin diagnostics.
- One real-MV asset is one search version group; legacy separate-asset switch pairs keep using switch-family grouping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt local domain declarations before API typecheck**
- **Found during:** Task 2 verification
- **Issue:** API typecheck resolves `@home-ktv/domain` through ignored local `dist` declarations, which were stale after Task 1 changed the domain source contract.
- **Fix:** Ran `pnpm -F @home-ktv/domain build`, then reran API tests and typecheck.
- **Files modified:** No committed source files; generated `dist/` remains ignored.
- **Verification:** `pnpm -F @home-ktv/api test -- src/test/song-search-routes.test.ts` and `pnpm -F @home-ktv/api typecheck` both passed.
- **Committed in:** N/A

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Verification needed a local generated declaration refresh; source scope and runtime behavior stayed within the plan.

## Issues Encountered

- The first API typecheck failed because local `packages/domain/dist` was stale. Rebuilding the domain package resolved it.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/song-search-routes.test.ts` passed: 35 files, 217 tests.
- `pnpm -F @home-ktv/api typecheck` passed.

## Next Phase Readiness

15-02 can now rely on search results exposing `canQueue` and `queueState`, while backend queue command validation still needs to implement real-MV queue-time vocal-mode resolution.

---
*Phase: 15-search-queue-playback-and-switching*
*Completed: 2026-05-13*
