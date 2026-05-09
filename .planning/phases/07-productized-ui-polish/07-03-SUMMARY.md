---
phase: 07-productized-ui-polish
plan: 03
subsystem: ui
tags: [react, vitest, scripts, admin, mobile-controller, tv]

requires:
  - phase: 07-productized-ui-polish
    provides: "Chinese-first copy, responsive layout polish, and no-reload task feedback from 07-01/07-02"
provides:
  - "Regression coverage for Phase 7 UI contracts"
  - "Dependency-light Chrome visual check script for Admin/Mobile"
  - "Chinese manual UAT for the full productized UI polish phase"
affects: [admin, mobile-controller, tv, phase-07-visual-check]

tech-stack:
  added: []
  patterns:
    - "Chrome headless screenshot validation with temp profile cleanup"
    - "Chinese UAT instructions that mirror the local dev launcher output"

key-files:
  created:
    - ".planning/phases/07-productized-ui-polish/07-03-SUMMARY.md"
    - ".planning/phases/07-productized-ui-polish/07-UAT.md"
    - "scripts/ui-visual-check.mjs"
  modified:
    - "package.json"
    - "apps/mobile-controller/src/test/controller.test.tsx"

key-decisions:
  - "Keep the visual check script dependency-light and model it after the TV capture helper."
  - "Document UAT in Chinese with exact restart command, URLs, and screenshot checks."
  - "Add a dedicated Mobile regression for the switch-to-instrumental control so both vocal modes are covered."

patterns-established:
  - "Productized UI phases close with both automated regression coverage and explicit manual verification steps."
  - "Visual check scripts should verify output files and clean their temp browser profiles."

requirements-completed: [PROD-01, PROD-02, PROD-03, PROD-04, PROD-05]

duration: 4min
completed: 2026-05-09
---

# Phase 07-03: UI Regression And Visual Check Summary

**Phase 7 is now closed with a lightweight Admin/Mobile screenshot helper, a Chinese UAT guide, and one final Mobile vocal-mode regression.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-09T12:23:00Z
- **Completed:** 2026-05-09T12:27:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added a Mobile regression that covers the original-to-instrumental switch control and keeps the current playback label in Chinese.
- Created `scripts/ui-visual-check.mjs` to capture Admin and Mobile screenshots with temporary Chrome profiles and file verification.
- Added `ui:visual-check` to the root scripts and documented the manual Phase 7 UAT flow in Chinese.

## Task Commits

This plan was committed as one verified implementation commit.

1. **Task 1: Fill remaining UI regression gaps** - covered in implementation commit.
2. **Task 2: Add Admin and Mobile visual screenshot helper** - covered in implementation commit.
3. **Task 3: Add Chinese Phase 7 UAT and run final gates** - covered in implementation commit.

## Files Created/Modified

- `apps/mobile-controller/src/test/controller.test.tsx` - Added the original-to-instrumental vocal switch regression.
- `scripts/ui-visual-check.mjs` - New Chrome-based Admin/Mobile visual capture helper.
- `package.json` - Added `ui:visual-check`.
- `.planning/phases/07-productized-ui-polish/07-UAT.md` - Chinese UAT instructions with restart command and URLs.
- `.planning/STATE.md` / `.planning/ROADMAP.md` - Phase 7 completion bookkeeping.

## Decisions Made

- Keep the visual checker aligned with the existing TV screenshot style so there is one simple browser-capture pattern in the repo.
- Make the manual UAT file concrete enough that a tester can run through the full flow without guessing URLs or commands.

## Deviations from Plan

None. The plan was executed without broadening scope.

## Issues Encountered

- A TypeScript check caught the first draft of the new Mobile regression test, so the snapshot fixture was tightened to include the required `roomId` fields explicitly.

## User Setup Required

None beyond the existing local database, media root, and dev-local restart command already documented in UAT.

## Verification

- `node scripts/ui-visual-check.mjs --help`
- `node scripts/tv-visual-check.mjs --help`
- `pnpm -F @home-ktv/mobile-controller test`
- `pnpm -F @home-ktv/admin test`
- `pnpm -F @home-ktv/tv-player test`
- `pnpm typecheck`

## Next Phase Readiness

Phase 7 is ready for closeout and archival. The next open work is Phase 8, which owns broader code-structure and logic hardening.

---
*Phase: 07-productized-ui-polish*
*Completed: 2026-05-09*
