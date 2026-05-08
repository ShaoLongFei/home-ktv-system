---
phase: 06-tv-playback-experience-polish
plan: 02
subsystem: ui
tags: [react, tv-player, playback-state, copy, vitest]

requires:
  - phase: 06-tv-playback-experience-polish
    provides: Central TV display model and Chinese fallback copy from 06-01
provides:
  - First-play blocked runtime state wiring
  - Polished Chinese TV playback, idle, conflict, and system screens
  - Non-blocking Chinese playback notice banner
affects: [tv-player, phase-06-plan-03]

tech-stack:
  added: []
  patterns:
    - Snapshot-derived display model drives TV screen copy and first-play prompt visibility
    - First-play autoplay block is represented as explicit local UI state, not a fake playback success
    - Chinese product copy is surfaced directly in the TV shell while raw notice kinds stay hidden

key-files:
  created:
    - .planning/phases/06-tv-playback-experience-polish/06-02-SUMMARY.md
  modified:
    - apps/tv-player/src/App.tsx
    - apps/tv-player/src/screens/tv-display-model.ts
    - apps/tv-player/src/screens/IdleScreen.tsx
    - apps/tv-player/src/screens/PlayingScreen.tsx
    - apps/tv-player/src/screens/ConflictScreen.tsx
    - apps/tv-player/src/components/PlaybackStatusBanner.tsx
    - apps/tv-player/src/components/PairingQr.tsx
    - apps/tv-player/src/test/playing-screen.test.tsx

key-decisions:
  - "First-play autoplay blocking is tracked in local TV state so the prompt clears as soon as playback succeeds."
  - "The TV runtime continues to emit autoplay-blocked telemetry while the user-facing prompt stays Chinese and actionable."
  - "The loading notice for first-play blocking is suppressed from the banner to avoid duplicating the central prompt."
  - "The playing footer uses a stable four-column layout with a fixed `mm:ss / mm:ss` time chip instead of a progress bar."

patterns-established:
  - "Render paths derive a display model before choosing the TV screen component."
  - "Playback feedback is short, localized, and visually bounded so it does not overpower the video plane."
  - "Screen components expose explicit bounded layout anchors for large title, time, next-song, and QR regions."

requirements-completed:
  - TVUX-01
  - TVUX-02
  - TVUX-03
  - TVUX-04
  - TVUX-05

duration: 11 min
completed: 2026-05-08
---

# Phase 06 Plan 02: TV Playback Experience Polish Summary

**Chinese-first TV playback screens with first-play retry handling, bounded status copy, and a stable mm:ss footer for couch viewing**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-08T14:25:00Z
- **Completed:** 2026-05-08T14:35:47Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Wired the browser autoplay block into explicit TV UI state so the first-play prompt appears and clears with real playback.
- Reworked the TV render path to consume the shared display model and present Chinese idle, conflict, offline, and playing copy.
- Rebuilt the playing footer around stable mode/state/time/next-song columns with `mm:ss / mm:ss` clock text.
- Localized the transient notice banner and QR caption so the TV surface no longer leaks raw technical notice kinds or English copy.

## Task Commits

1. **Task 1: Add tests for TV playback UI polish expectations** - `ffcbde7` (test)
2. **Task 2: Wire first-play blocked state and display model** - `7bda3e2` (feat)
3. **Task 3: Polish TV playback screens and feedback** - `4671dfe` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `apps/tv-player/src/App.tsx` - Routes the derived display model, tracks first-play blocking, and clears it on successful playback.
- `apps/tv-player/src/screens/tv-display-model.ts` - Adds offline mapping for snapshot error state.
- `apps/tv-player/src/screens/IdleScreen.tsx` - Chinese idle screen using the shared display model.
- `apps/tv-player/src/screens/PlayingScreen.tsx` - Video-dominant playing layout with first-play prompt, bounded footer, and `mm:ss / mm:ss` clock.
- `apps/tv-player/src/screens/ConflictScreen.tsx` - Chinese conflict screen with active-device detail.
- `apps/tv-player/src/components/PlaybackStatusBanner.tsx` - Chinese notice banner using shared copy fallback.
- `apps/tv-player/src/components/PairingQr.tsx` - Chinese QR caption and tighter caption styling.
- `apps/tv-player/src/test/playing-screen.test.tsx` - Snapshot helper update to support the blocked-state test case.

## Decisions Made

- First-play blocking is represented as visible UI state, not as a silent retry or fake success path.
- The first-play loading notice is kept out of the banner to avoid duplicating the central prompt.
- Chinese copy is the default for all touched TV surfaces, including idle, conflict, notice, and QR captions.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

- `tsc` flagged the updated playing-screen snapshot helper signature; extending the helper to accept overrides fixed the type error without changing behavior.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/tv-player test -- playing-screen playback-status-banner app-runtime tv-display-model` passed.
- `pnpm -F @home-ktv/tv-player typecheck` passed.

## Next Phase Readiness

Ready for Plan 06-03 to add the TV regression/visual verification script and close the last gap in Phase 6.

---
*Phase: 06-tv-playback-experience-polish*
*Completed: 2026-05-08*
