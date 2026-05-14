---
phase: 15-search-queue-playback-and-switching
plan: 04
subsystem: tv-player
tags: [real-mv, audio-track, tv-runtime, telemetry, chinese-copy]

requires:
  - phase: 15-search-queue-playback-and-switching
    provides: same-asset SwitchTarget audio_track contract and switch_committed persistence
provides:
  - Browser-local audio-track selection helper with unsupported and missing-track results
  - TV initial playback selectedTrackRef application before playing telemetry
  - Same-file real-MV switch branch without standby video reload
  - Chinese TV notices for switch failure and preprocessing-required playback failure
affects: [tv-playback, mobile-switch-feedback, player-telemetry]

tech-stack:
  added: []
  patterns:
    - TV runtime gates real-MV playback and switching on actual active-video audioTracks support
    - Browser capability failures send failed telemetry instead of masquerading as autoplay blocks

key-files:
  created:
    - .planning/phases/15-search-queue-playback-and-switching/15-04-SUMMARY.md
  modified:
    - apps/tv-player/src/runtime/video-pool.ts
    - apps/tv-player/src/runtime/active-playback-controller.ts
    - apps/tv-player/src/runtime/switch-controller.ts
    - apps/tv-player/src/runtime/use-tv-playback-runtime.ts
    - apps/tv-player/src/screens/tv-display-model.ts
    - apps/tv-player/src/test/active-playback-controller.test.tsx
    - apps/tv-player/src/test/switch-runtime.test.tsx
    - apps/tv-player/src/test/app-runtime.test.tsx
    - apps/tv-player/src/test/tv-screen-states.test.tsx
    - apps/tv-player/src/test/playback-status-banner.test.tsx
    - apps/tv-player/src/test/tv-display-model.test.ts

key-decisions:
  - "TV runtime derives the local TrackRef type from PlaybackTarget instead of importing @home-ktv/domain directly, preserving tv-player package boundaries."
  - "Initial playback capability failures send failed telemetry with stage=playback_capability_blocked and show Chinese preprocessing copy."
  - "Same-file audio-track switches update the active target locally and never use standby video preparation."

patterns-established:
  - "selectAudioTrack returns typed selected/unsupported/missing_track results and restores prior enabled tracks on mutation failure."
  - "noticeCopyFor maps real-MV unsupported/preprocess failures to stable Chinese primary display copy."

requirements-completed: [PLAY-03, PLAY-04, PLAY-05]

duration: 32 min
completed: 2026-05-13
---

# Phase 15 Plan 04: TV Runtime Audio-Track Selection Summary

**Browser TV playback now applies backend-selected real-MV audio tracks and commits switches only after local audio-track selection succeeds.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-05-13T09:01:06Z
- **Completed:** 2026-05-13T09:33:45Z
- **Tasks:** 4
- **Files modified:** 11

## Accomplishments

- Added typed, local audio-track selection and restoration helpers for TV video elements without depending on global DOM audio-track types.
- Applied `PlaybackTarget.selectedTrackRef` before active playback can report `playing`.
- Added a `switchKind: "audio_track"` runtime path that switches the active video track in place, reports `switch_committed` only on success, and reports `switch_failed` with `stage: "audio_track"` on failure.
- Mapped real-MV playback and switch failures to Chinese TV-facing copy while keeping raw messages in telemetry.

## Task Commits

1. **Task 1-4 RED coverage** - `5d46fb8`
2. **Task 1-4 GREEN implementation** - `010fc8e`

## Files Created/Modified

- `apps/tv-player/src/runtime/video-pool.ts` - Adds `selectAudioTrack`, `restoreAudioTracks`, active track selection, and local active-target switch commit.
- `apps/tv-player/src/runtime/active-playback-controller.ts` - Selects requested audio track before playback and blocks unsupported real-MV targets before playing telemetry.
- `apps/tv-player/src/runtime/switch-controller.ts` - Adds same-file audio-track switch branch and Chinese reverted messages.
- `apps/tv-player/src/runtime/use-tv-playback-runtime.ts` - Converts playback capability blocks into failed telemetry and Chinese local notice flow.
- `apps/tv-player/src/screens/tv-display-model.ts` - Adds Chinese switch failure, preprocessing, and generic playback failure notice mapping.
- `apps/tv-player/src/test/active-playback-controller.test.tsx` - Covers selector behavior, restore behavior, selectedTrackRef playback, and unsupported blocking.
- `apps/tv-player/src/test/switch-runtime.test.tsx` - Covers same-file switch success/failure and telemetry.
- `apps/tv-player/src/test/app-runtime.test.tsx` - Covers failed telemetry and Chinese notice for unsupported required audio-track playback.
- `apps/tv-player/src/test/tv-screen-states.test.tsx` - Covers three Chinese TV notice strings.
- `apps/tv-player/src/test/playback-status-banner.test.tsx` - Updates banner fallback copy expectations.
- `apps/tv-player/src/test/tv-display-model.test.ts` - Updates display model fallback copy expectations.

## Decisions Made

- `tv-player` does not import `@home-ktv/domain`; it infers `TrackRef` from `PlaybackTarget["selectedTrackRef"]`.
- Capability-blocked real-MV playback sends `eventType: "failed"` with `errorCode: "TV_PLAYBACK_CAPABILITY_BLOCKED"` so the backend can reuse the existing failure recovery path.
- Runtime switch tests live in `switch-runtime.test.tsx`, the existing direct SwitchController suite, while `app-runtime.test.tsx` covers the React runtime notice/telemetry path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoid direct @home-ktv/domain dependency from tv-player**
- **Found during:** Task 1 typecheck
- **Issue:** `apps/tv-player` does not have a direct `@home-ktv/domain` package dependency, so importing `TrackRef` from it fails package typecheck.
- **Fix:** Derived `TrackRef` from `PlaybackTarget["selectedTrackRef"]` inside `video-pool.ts`.
- **Files modified:** `apps/tv-player/src/runtime/video-pool.ts`
- **Verification:** `pnpm -F @home-ktv/tv-player typecheck`
- **Committed in:** `010fc8e`

**2. [Rule 2 - Missing Critical] Route playback capability blocks through failed telemetry**
- **Found during:** Task 4 app runtime test
- **Issue:** Unsupported audio-track playback was initially indistinguishable from autoplay blocking and would show the wrong TV prompt.
- **Fix:** `use-tv-playback-runtime` now detects capability-block messages, sends failed telemetry, clears first-play prompting, and shows the Chinese preprocessing notice.
- **Files modified:** `apps/tv-player/src/runtime/use-tv-playback-runtime.ts`, `apps/tv-player/src/test/app-runtime.test.tsx`
- **Verification:** `pnpm -F @home-ktv/tv-player test -- src/test/app-runtime.test.tsx`
- **Committed in:** `010fc8e`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both deviations preserve package boundaries and ensure real-MV unsupported playback uses the intended recovery path. No Android TV or transcoding scope was added.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/tv-player test -- src/test/active-playback-controller.test.tsx` passed: 15 files, 55 tests.
- `pnpm -F @home-ktv/tv-player test -- src/test/app-runtime.test.tsx` passed: 15 files, 55 tests.
- `pnpm -F @home-ktv/tv-player test -- src/test/tv-screen-states.test.tsx` passed: 15 files, 55 tests.
- `pnpm -F @home-ktv/tv-player typecheck` passed.
- Plan grep acceptance checks passed for audio-track helper names, unsupported message constant, `selectActiveAudioTrack`, `commitAudioTrackSwitch`, Chinese failure copy, and preserved `prepareStandby`.

## Next Phase Readiness

15-05 can now finish Mobile disabled-state behavior and cross-surface real-MV playback regression coverage against a TV runtime that truthfully gates playback and switching by browser capability.

---
*Phase: 15-search-queue-playback-and-switching*
*Completed: 2026-05-13*
