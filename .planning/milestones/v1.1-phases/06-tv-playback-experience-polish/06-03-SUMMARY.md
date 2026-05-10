---
phase: 06-tv-playback-experience-polish
plan: 03
subsystem: testing
tags: [react, tv-player, vitest, chrome, screenshots, uat]

requires:
  - phase: 06-tv-playback-experience-polish
    provides: Polished TV screens and first-play prompt from 06-02
provides:
  - Automated TV screen-state regression coverage
  - Lightweight Chrome visual screenshot helper
  - Phase 6 Chinese manual UAT checklist
affects: [tv-player, phase-06-complete]

tech-stack:
  added: []
  patterns:
    - Regression tests cover visible TV copy and long-text handling at the component level
    - Chrome headless is used as a lightweight screenshot fallback without adding Playwright
    - Manual UAT is documented in Chinese with explicit service and visual validation steps

key-files:
  created:
    - apps/tv-player/src/test/tv-screen-states.test.tsx
    - scripts/tv-visual-check.mjs
    - .planning/phases/06-tv-playback-experience-polish/06-UAT.md
  modified:
    - apps/tv-player/src/test/playing-screen.test.tsx
    - package.json

key-decisions:
  - "Use component tests for idle/conflict/loading/recovering/notice copy so TV copy regressions are caught quickly."
  - "Keep the screenshot helper dependency-free and shell-free by spawning the local Chrome binary directly."
  - "Document manual verification in Chinese so the user can validate Phase 6 without needing the planning context."

patterns-established:
  - "Visual validation uses a small Node script and locally installed Chrome rather than introducing a larger browser test stack."
  - "TV regression coverage focuses on exact visible copy and long-text safety instead of pixel assertions in unit tests."

requirements-completed:
  - TVUX-01
  - TVUX-02
  - TVUX-03
  - TVUX-04
  - TVUX-05

duration: 9 min
completed: 2026-05-08
---

# Phase 06 Plan 03: TV Playback Experience Polish Summary

**TV regression coverage, Chrome screenshot helper, and Chinese UAT instructions to close Phase 6**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-08T14:44:00Z
- **Completed:** 2026-05-08T14:52:59Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added regression tests for idle, conflict, loading, recovering, notice, and long-text TV rendering.
- Added a lightweight Chrome headless screenshot helper that captures 1920x1080 and 1366x768 outputs.
- Added a Chinese UAT checklist so the user can validate first-play, playback, switching, recovery, offline, conflict, and screenshot behavior.
- Verified the full TV player test suite, TV player typecheck, root typecheck, and visual helper help output.

## Task Commits

1. **Task 1: Add screen-state and long-text regression tests** - `e4eab87` (test)
2. **Task 2: Add Chrome visual screenshot helper** - `e4ce090` (feat)
3. **Task 3: Add Phase 6 UAT checklist and run final gates** - `e599e17` (docs)

**Plan metadata:** pending docs/state commit

## Files Created/Modified

- `apps/tv-player/src/test/tv-screen-states.test.tsx` - Regression coverage for TV state copy and notices.
- `apps/tv-player/src/test/playing-screen.test.tsx` - Long-text and first-play prompt regression coverage.
- `scripts/tv-visual-check.mjs` - Chrome screenshot helper for TV baseline viewports.
- `package.json` - Adds the `tv:visual-check` root script.
- `.planning/phases/06-tv-playback-experience-polish/06-UAT.md` - Manual verification checklist in Chinese.

## Decisions Made

- The screenshot helper stays lightweight and uses the local Chrome binary directly.
- Manual UAT remains the final source of truth for visual overlap and browser-first-play behavior.
- TV copy regressions are tested as visible strings rather than a separate localization layer in Phase 6.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/tv-player test` passed.
- `pnpm -F @home-ktv/tv-player typecheck` passed.
- `pnpm typecheck` passed.
- `node scripts/tv-visual-check.mjs --help` passed.
- `pnpm tv:visual-check` produced `logs/visual/tv-player-1920x1080.png` and `logs/visual/tv-player-1366x768.png`.

## Next Phase Readiness

Phase 6 is ready to close; remaining work belongs to the milestone audit/completion flow.

---
*Phase: 06-tv-playback-experience-polish*
*Completed: 2026-05-08*
