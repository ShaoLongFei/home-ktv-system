---
phase: 07-productized-ui-polish
plan: 01
subsystem: ui
tags: [react, i18n, admin, mobile-controller, chinese-copy]

requires:
  - phase: 06-tv-playback-experience-polish
    provides: "Chinese-first TV playback copy and verified control flows"
provides:
  - "Controlled Chinese-first status and enum labels for Admin room/catalog surfaces"
  - "Controlled Chinese-first playback and online supplement labels for Mobile"
  - "Regression coverage for Admin/Mobile raw enum removal"
affects: [admin, mobile-controller, phase-07-layout-polish]

tech-stack:
  added: []
  patterns:
    - "Localized enum helpers with fallback labels"
    - "Chinese default paths with English language switch preserved"

key-files:
  created:
    - ".planning/phases/07-productized-ui-polish/07-01-SUMMARY.md"
  modified:
    - "apps/admin/src/i18n.tsx"
    - "apps/admin/src/rooms/RoomStatusView.tsx"
    - "apps/admin/src/songs/AssetPairEditor.tsx"
    - "apps/admin/src/songs/SongCatalogView.tsx"
    - "apps/admin/src/test/room-status.test.tsx"
    - "apps/admin/src/test/song-catalog.test.tsx"
    - "apps/mobile-controller/src/App.tsx"
    - "apps/mobile-controller/src/i18n.tsx"
    - "apps/mobile-controller/src/test/controller.test.tsx"

key-decisions:
  - "Keep provider IDs, file paths, probe statuses, and raw event types as secondary diagnostics."
  - "Use distinct accessible names for search region and search input to avoid ambiguous controls."

patterns-established:
  - "Enum-like UI states render through helper functions instead of direct backend values."
  - "Tests assert Chinese default product copy while keeping language switching intact."

requirements-completed: [PROD-01, PROD-02, PROD-04]

duration: 12min
completed: 2026-05-08
---

# Phase 07-01: Copy And Status Foundation Summary

**Admin and Mobile now render Chinese-first product labels for key playback, room, catalog, and online supplement states without removing useful diagnostics.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-08T15:41:00Z
- **Completed:** 2026-05-08T15:52:45Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added Admin helpers for room states, playback states, recent event types, and online task states.
- Added Mobile helpers for playback states, online task states, candidate types, reliability, and risk labels.
- Replaced raw primary labels such as `active`, `instrumental`, `playing`, `discovered`, `high`, and `normal` on key Admin/Mobile surfaces.
- Added regression coverage for Chinese default copy and language switching.

## Task Commits

This plan was executed inline and will be committed as one verified implementation commit:

1. **Task 1: Add failing copy regression tests** - covered in implementation commit.
2. **Task 2: Add controlled i18n helpers and glossary entries** - covered in implementation commit.
3. **Task 3: Replace raw visible labels in Admin and Mobile** - covered in implementation commit.

## Files Created/Modified

- `apps/mobile-controller/src/i18n.tsx` - Added Mobile glossary keys and enum label helpers.
- `apps/mobile-controller/src/App.tsx` - Uses localized playback and online supplement metadata labels.
- `apps/mobile-controller/src/test/controller.test.tsx` - Covers Chinese default copy and localized online supplement states.
- `apps/admin/src/i18n.tsx` - Added Admin room/playback/event/task helpers.
- `apps/admin/src/rooms/RoomStatusView.tsx` - Uses localized room status, vocal mode, task counts, and event labels.
- `apps/admin/src/songs/SongCatalogView.tsx` - Uses localized song language/status and asset vocal summaries.
- `apps/admin/src/songs/AssetPairEditor.tsx` - Localizes asset status and vocal mode select labels.
- `apps/admin/src/test/room-status.test.tsx` - Covers localized room status, task counts, and recent events.
- `apps/admin/src/test/song-catalog.test.tsx` - Covers localized catalog song rows and asset vocal labels.

## Decisions Made

- Secondary diagnostics remain raw where useful for debugging, including provider IDs, event type codes, file paths, probe statuses, switch quality, and validation codes.
- The Mobile search region remains `搜索歌曲`, while the input control is now `搜索关键词` so assistive queries can distinguish section and field.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mobile search accessible-name collision**

- **Found during:** Task 3 verification
- **Issue:** `搜索歌曲` was used for both the search region and input, making the input ambiguous in accessibility queries.
- **Fix:** Changed the input accessible name to `搜索关键词` / `Search keyword` and updated focused tests.
- **Files modified:** `apps/mobile-controller/src/i18n.tsx`, `apps/mobile-controller/src/test/controller.test.tsx`
- **Verification:** `pnpm -F @home-ktv/mobile-controller test -- controller`

**2. [Rule 1 - Bug] Raw recent event diagnostic was not independently queryable**

- **Found during:** Task 3 verification
- **Issue:** `player.failed` was embedded in a longer text node, so the product label was present but the secondary diagnostic was hard to target.
- **Fix:** Rendered the raw event type in its own inline `code` element after the product label.
- **Files modified:** `apps/admin/src/rooms/RoomStatusView.tsx`
- **Verification:** `pnpm -F @home-ktv/admin test -- room-status song-catalog import-workbench`

---

**Total deviations:** 2 auto-fixed (Rule 1).
**Impact on plan:** Both fixes reinforce the Phase 7 copy/accessibility goals without adding new business scope.

## Issues Encountered

None remaining. Initial GREEN verification failures were resolved by tightening accessibility names and test matchers for repeated legitimate labels.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/mobile-controller test -- controller`
- `pnpm -F @home-ktv/admin test -- room-status song-catalog import-workbench`
- `pnpm -F @home-ktv/mobile-controller typecheck`
- `pnpm -F @home-ktv/admin typecheck`
- `pnpm typecheck`

## Next Phase Readiness

Ready for 07-02 layout and interaction polish. The main copy helpers are now in place, so the next plan can focus on responsive spacing, button states, and refresh feedback without chasing raw enum labels.

---
*Phase: 07-productized-ui-polish*
*Completed: 2026-05-08*
