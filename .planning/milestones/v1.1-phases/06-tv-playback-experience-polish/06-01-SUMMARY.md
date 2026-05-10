---
phase: 06-tv-playback-experience-polish
plan: 01
subsystem: ui
tags: [react, tv-player, playback-state, copy, vitest]

requires:
  - phase: 06-tv-playback-experience-polish
    provides: Phase 6 context, research, and UI-SPEC
provides:
  - Central TV display state helper
  - Chinese TV state and notice copy fallback
  - First-play blocked prompt copy
  - Playback clock formatting with unknown-duration fallback
affects: [tv-player, phase-06-plan-02, phase-06-plan-03]

tech-stack:
  added: []
  patterns:
    - Snapshot-derived display model for TV states
    - Chinese fallback copy centralized outside React components

key-files:
  created:
    - apps/tv-player/src/screens/tv-display-model.ts
    - apps/tv-player/src/test/tv-display-model.test.ts
  modified: []

key-decisions:
  - "TV display copy and first-play prompt text are centralized in tv-display-model.ts."
  - "Unknown duration renders as --:-- rather than a misleading 00:00."
  - "English or raw runtime notice messages fall back to Chinese product copy."

patterns-established:
  - "Display helpers derive user-facing state from RoomSnapshot/useRoomSnapshot inputs."
  - "PlaybackNotice UI copy flows through noticeCopyFor before rendering."

requirements-completed:
  - TVUX-01
  - TVUX-02
  - TVUX-03
  - TVUX-04

duration: 8 min
completed: 2026-05-08
---

# Phase 06 Plan 01: TV Display Model Summary

**Snapshot-derived TV display model with Chinese playback-state copy, first-play prompt text, and stable `mm:ss / --:--` clock formatting**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-08T14:11:00Z
- **Completed:** 2026-05-08T14:19:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `deriveTvDisplayState()` as the typed display-state foundation for TV screens.
- Added `noticeCopyFor()` so Phase 6 touched notices use Chinese product copy instead of raw notice kinds or English runtime messages.
- Added `formatPlaybackClock()` so unknown duration renders as `--:--`.
- Added focused Vitest coverage for state derivation, first-play prompt copy, notice copy, and time formatting.

## Task Commits

1. **Task 1: Add tests for TV display derivation and copy** - `d4a1745` (test)
2. **Task 2: Implement TV display model helpers** - `03c55be` (feat)

## Files Created/Modified

- `apps/tv-player/src/test/tv-display-model.test.ts` - Tests TV display state derivation, Chinese copy, notice fallback, and clock formatting.
- `apps/tv-player/src/screens/tv-display-model.ts` - Central helper for TV state labels, first-play prompt model, notice copy, and playback clock formatting.

## Decisions Made

- `status === "error"` maps to a Chinese persistent offline state, with raw technical errors kept out of the heading.
- First-play prompt visibility is tied to `firstPlayBlocked === true` and the presence of a current playback target.
- Non-Chinese notice messages fall back to controlled Chinese copy to avoid leaking runtime/debug text into TV UI.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/tv-player test -- tv-display-model` passed.
- `pnpm -F @home-ktv/tv-player typecheck` passed.

## Next Phase Readiness

Plan 06-02 can now wire `deriveTvDisplayState`, `noticeCopyFor`, and `formatPlaybackClock` into the TV React components.

---
*Phase: 06-tv-playback-experience-polish*
*Completed: 2026-05-08*
