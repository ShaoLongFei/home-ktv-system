---
phase: 15-search-queue-playback-and-switching
plan: 02
subsystem: api
tags: [queue, playback-target, real-mv, track-ref]

requires:
  - phase: 15-search-queue-playback-and-switching
    provides: real-MV search results with queueability metadata
provides:
  - Queue-time real-MV vocal-mode resolution
  - Persisted queue playbackOptions preferredVocalMode for real-MV songs
  - PlaybackTarget selectedTrackRef derived from queue committed vocal mode
affects: [queueing, tv-playback, switch-targets]

tech-stack:
  added: []
  patterns:
    - Real-MV playback intent is committed on QueueEntry.playbackOptions and then projected into PlaybackTarget

key-files:
  created:
    - .planning/phases/15-search-queue-playback-and-switching/15-02-SUMMARY.md
  modified:
    - apps/api/src/modules/playback/session-command-service.ts
    - apps/api/src/modules/playback/build-playback-target.ts
    - apps/api/src/test/room-queue-commands.test.ts
    - apps/api/src/test/build-playback-target.test.ts

key-decisions:
  - "Real-MV queueing resolves effective vocal mode on the backend using current room target mode, defaulting to accompaniment."
  - "PlaybackTarget uses QueueEntry.playbackOptions.preferredVocalMode for single-file real MV instead of asset.vocalMode=dual."

patterns-established:
  - "Legacy separate-asset switch pairs keep verified-counterpart validation; real-MV assets use readiness, source, compatibility, and trackRoles validation."
  - "Single-file real-MV assets keep one assetId while selectedTrackRef communicates original/accompaniment intent."

requirements-completed: [PLAY-01, PLAY-02, PLAY-03]

duration: 19 min
completed: 2026-05-13
---

# Phase 15 Plan 02: Queue-Time Vocal Mode and Playback Target Summary

**Real-MV queue entries now commit original/accompaniment intent and TV playback targets receive the selected track ref.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-05-13T08:18:33Z
- **Completed:** 2026-05-13T08:37:14Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added backend real-MV queue validation that accepts playable local/cached single-file assets with reviewed track roles.
- Persisted real-MV `playbackOptions.preferredVocalMode` at queue time, defaulting to accompaniment unless the room target mode is original.
- Updated PlaybackTarget construction so formal real-MV assets emit effective `vocalMode` and `selectedTrackRef`.

## Task Commits

1. **Task 1: Backend real-MV queueability and vocal-mode resolution** - `ad2133c`, `303bf4a`
2. **Task 2: Playback targets from committed vocal mode** - `ad2133c`, `303bf4a`

## Files Created/Modified

- `apps/api/src/modules/playback/session-command-service.ts` - Splits legacy and real-MV queue validation, stores preferred vocal mode, and starts real-MV queue entries with the resolved mode.
- `apps/api/src/modules/playback/build-playback-target.ts` - Resolves effective vocal mode and track ref from the queue entry for single-file real MV.
- `apps/api/src/test/room-queue-commands.test.ts` - Covers default accompaniment, inherited original mode, missing selected role rejection, and legacy validation preservation.
- `apps/api/src/test/build-playback-target.test.ts` - Covers original and accompaniment selectedTrackRef generation for formal real MV.

## Decisions Made

- Unknown or idle target mode resolves to accompaniment for real-MV queueing.
- Missing selected role rejects queueing instead of queuing a best-effort item.
- Legacy assets still require non-ephemeral source, verified switch quality, and a verified counterpart.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/room-queue-commands.test.ts src/test/build-playback-target.test.ts` passed: 35 files, 222 tests.
- `pnpm -F @home-ktv/api typecheck` passed.

## Next Phase Readiness

15-03 can now build same-asset switch targets using the committed real-MV playback mode and selected track roles.

---
*Phase: 15-search-queue-playback-and-switching*
*Completed: 2026-05-13*
