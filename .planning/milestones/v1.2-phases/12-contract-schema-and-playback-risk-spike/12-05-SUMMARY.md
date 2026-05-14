---
phase: 12-contract-schema-and-playback-risk-spike
plan: 05
subsystem: tv-runtime
tags: [playback-risk, browser-capability, real-mv, spike, audio-tracks]

requires:
  - phase: 12-contract-schema-and-playback-risk-spike
    provides: PlaybackTarget profile and selectedTrackRef boundary from 12-04
provides:
  - Non-invasive TV playback capability inspection helper
  - Dependency-light real-MV playback risk spike script
  - Controlled playback-risk Markdown evidence
affects: [phase-12-real-samples, phase-15-playback, tv-player]

tech-stack:
  added: []
  patterns:
    - Browser capability inspection is detached from active playback elements
    - Risk evidence scripts use Node built-ins and optional system tools only

key-files:
  created:
    - apps/tv-player/src/runtime/playback-capability.ts
    - apps/tv-player/src/test/playback-capability.test.ts
    - scripts/real-mv-playback-risk-spike.mjs
    - scripts/real-mv-playback-risk-spike.test.mjs
    - .planning/phases/12-contract-schema-and-playback-risk-spike/12-PLAYBACK-RISK-CONTROLLED.md
  modified:
    - package.json

key-decisions:
  - "Playback capability checks do not call load, play, pause, SwitchController, or DualVideoPool."
  - "The spike script records unsupported switching with the exact user-facing message current device does not support audio-track switching."
  - "Controlled evidence can be generated without adding Playwright or Puppeteer."

patterns-established:
  - "Capability inspection reports canPlayType, optional MediaCapabilities support, audioTracks API availability, and switching message."
  - "Playback-risk reports include compatibilityStatus and compatibilityReasons using the same Phase 12 evaluator rules."

requirements-completed: [MEDIA-02, MEDIA-04]

duration: 5min
completed: 2026-05-11
---

# Phase 12-05: Controlled Playback-Risk Spike Harness Summary

**TV/browser playback risk can now be inspected and documented without mutating active playback or adding browser automation dependencies.**

## Performance

- **Duration:** 5 min elapsed
- **Started:** 2026-05-11T08:21:57Z
- **Completed:** 2026-05-11T08:27:04Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `inspectCurrentWebPlaybackProfile` for detached browser capability checks.
- Added tests proving capability inspection reports `canPlayType`, MediaCapabilities support, audioTracks API availability, and does not call `load`, `play`, or `pause`.
- Added `pnpm real-mv:risk-spike` script for controlled and real sample playback-risk reports.
- Added node:test coverage for help text, required real sample arguments, and controlled report output.
- Generated `.planning/phases/12-contract-schema-and-playback-risk-spike/12-PLAYBACK-RISK-CONTROLLED.md`.

## Task Commits

1. **Task 1: Add non-invasive TV playback capability helper** - included in `feat(12-05): add real MV playback risk spike`
2. **Task 2: Add dependency-light playback risk spike script** - included in `feat(12-05): add real MV playback risk spike`

## Files Created/Modified

- `apps/tv-player/src/runtime/playback-capability.ts` - Adds non-invasive browser playback capability inspection.
- `apps/tv-player/src/test/playback-capability.test.ts` - Verifies capability helper behavior.
- `scripts/real-mv-playback-risk-spike.mjs` - Adds controlled/real sample playback-risk report CLI.
- `scripts/real-mv-playback-risk-spike.test.mjs` - Verifies CLI help, validation, and report content.
- `package.json` - Adds `real-mv:risk-spike`.
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-PLAYBACK-RISK-CONTROLLED.md` - Captures controlled evidence.

## Decisions Made

- Kept the helper out of `SwitchController` and `DualVideoPool`; full runtime-gated switching remains Phase 15 scope.
- Used Node built-ins and optional local Chrome/ffmpeg/ffprobe checks, so the spike can still produce evidence when tools are missing or fail.
- Wrote reports in Markdown because the next plan needs user-readable evidence from real samples.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Local Chrome probing returned an error in controlled mode, so the generated report records empty `canPlayType`, `hasAudioTracksApi: false`, and `unsupported` compatibility with `browser-cannot-play-type`. This is useful spike evidence, not a test failure.

## Verification

- `pnpm --filter @home-ktv/tv-player exec vitest run src/test/playback-capability.test.ts`
- `node --test scripts/real-mv-playback-risk-spike.test.mjs`
- `pnpm -F @home-ktv/tv-player typecheck`
- `pnpm real-mv:risk-spike -- --controlled-only --output .planning/phases/12-contract-schema-and-playback-risk-spike/12-PLAYBACK-RISK-CONTROLLED.md`
- `rg -n 'Controlled fixture|canPlayType|hasAudioTracksApi|compatibilityStatus|compatibilityReasons' .planning/phases/12-contract-schema-and-playback-risk-spike/12-PLAYBACK-RISK-CONTROLLED.md`

## User Setup Required

None for controlled evidence. 12-06 still needs user-provided real MKV and MPG/MPEG samples to produce real-sample evidence.

## Next Phase Readiness

12-06 can run the same script against user-provided real MV samples and record whether current web playback is usable or requires preprocessing/future Android handling.

---
*Phase: 12-contract-schema-and-playback-risk-spike*
*Completed: 2026-05-11*
