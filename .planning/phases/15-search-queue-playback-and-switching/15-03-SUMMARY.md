---
phase: 15-search-queue-playback-and-switching
plan: 03
subsystem: api
tags: [switch-target, real-mv, audio-track, telemetry]

requires:
  - phase: 15-search-queue-playback-and-switching
    provides: queue-time real-MV preferred vocal mode and PlaybackTarget selectedTrackRef
provides:
  - SwitchTarget switchKind contract for asset and audio-track switches
  - Same-asset real-MV switch targets with selectedTrackRef and playbackProfile
  - TV switch success telemetry persistence back to queue playbackOptions
affects: [tv-playback, switch-runtime, queue-state]

tech-stack:
  added: []
  patterns:
    - Same-file real-MV switching reuses switch-vocal-mode and switch-transition with switchKind=audio_track
    - TV switch_committed telemetry is the server-side commit point for real-MV vocal mode

key-files:
  created:
    - .planning/phases/15-search-queue-playback-and-switching/15-03-SUMMARY.md
  modified:
    - packages/player-contracts/src/index.ts
    - apps/api/src/modules/playback/build-switch-target.ts
    - apps/api/src/modules/playback/repositories/queue-entry-repository.ts
    - apps/api/src/modules/player/telemetry-service.ts
    - apps/api/src/test/build-switch-target.test.ts
    - apps/api/src/test/player-runtime-contract.test.ts
    - apps/tv-player/src/test/app-runtime.test.tsx
    - apps/tv-player/src/test/switch-runtime.test.tsx

key-decisions:
  - "Real-MV switching remains on the existing switch-vocal-mode command path and is distinguished by SwitchTarget.switchKind=audio_track."
  - "Successful TV playing telemetry with stage=switch_committed is the only path that commits the new real-MV preferredVocalMode."
  - "Failed switch attempts leave QueueEntry.playbackOptions.preferredVocalMode unchanged."

patterns-established:
  - "Legacy counterpart switches omit selectedTrackRef unless the target asset actually has a matching reviewed role."
  - "Real-MV switch targets keep fromAssetId, toAssetId, and rollbackAssetId equal while changing selectedTrackRef."

requirements-completed: [PLAY-03, PLAY-04, PLAY-05]

duration: 20 min
completed: 2026-05-13
---

# Phase 15 Plan 03: Same-Asset Real-MV Switch Target Summary

**Same-file real-MV vocal switching now carries explicit audio-track intent and commits only after TV confirms the switch.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-13T08:38:48Z
- **Completed:** 2026-05-13T08:58:38Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Extended `SwitchTarget` with `switchKind`, optional `playbackProfile`, and optional `selectedTrackRef`.
- Added same-asset real-MV switch target construction that toggles from committed queue vocal mode to the opposite reviewed audio role.
- Persisted successful `switch_committed` telemetry back to `QueueEntry.playbackOptions.preferredVocalMode` while keeping `switch_failed` non-committing.

## Task Commits

1. **Task 1: SwitchTarget contract and RED coverage** - `df9a4e8`
2. **Task 2: Same-asset real-MV switch target builder** - `1ebdbb7`
3. **Task 3: Switch success telemetry commit persistence** - `1ebdbb7`

## Files Created/Modified

- `packages/player-contracts/src/index.ts` - Adds explicit switch kind and optional track/profile payload fields to `SwitchTarget`.
- `apps/api/src/modules/playback/build-switch-target.ts` - Builds legacy asset switches and real-MV same-asset audio-track switches.
- `apps/api/src/modules/playback/repositories/queue-entry-repository.ts` - Adds Postgres and in-memory `updatePreferredVocalMode`.
- `apps/api/src/modules/player/telemetry-service.ts` - Commits preferred vocal mode only on `playing` + `switch_committed`.
- `apps/api/src/test/build-switch-target.test.ts` - Covers real-MV audio-track switch targets, missing roles, and legacy switch preservation.
- `apps/api/src/test/player-runtime-contract.test.ts` - Covers switch commit persistence and failed-switch non-commit behavior.
- `apps/tv-player/src/test/app-runtime.test.tsx` - Updates SwitchTarget fixture contract.
- `apps/tv-player/src/test/switch-runtime.test.tsx` - Updates SwitchTarget fixture contract.

## Decisions Made

- Same-asset real-MV switching uses `switchKind: "audio_track"` instead of a new command.
- The committed queue preferred mode is authoritative for deciding the next real-MV switch target.
- Legacy switch targets include selected track information only when it exists, avoiding null payload churn for old asset pairs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Omit null selectedTrackRef from legacy asset switch targets**
- **Found during:** Task 2 (same-asset switch target builder)
- **Issue:** The legacy branch emitted `selectedTrackRef: null`, which changed the existing test contract and exceeded the "when available" plan wording.
- **Fix:** Legacy switch target construction now spreads `selectedTrackRef` only when a reviewed target role exists.
- **Files modified:** `apps/api/src/modules/playback/build-switch-target.ts`
- **Verification:** `pnpm -F @home-ktv/api test -- src/test/build-switch-target.test.ts src/test/player-runtime-contract.test.ts`
- **Committed in:** `1ebdbb7`

**2. [Rule 3 - Blocking] Adjust test helper for exact optional property typing**
- **Found during:** Task 3 (API typecheck)
- **Issue:** The test helper passed `activeAssetId: undefined` into an optional-only input under `exactOptionalPropertyTypes`.
- **Fix:** Added a local `createSession` helper that omits `activeAssetId` unless a real value is provided.
- **Files modified:** `apps/api/src/test/build-switch-target.test.ts`
- **Verification:** `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `1ebdbb7`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes keep the contract precise and make the planned tests typecheck cleanly. No scope expansion.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/player-contracts typecheck` passed.
- `pnpm -F @home-ktv/api test -- src/test/build-switch-target.test.ts src/test/player-runtime-contract.test.ts` passed: 35 files, 227 tests.
- `pnpm -F @home-ktv/api typecheck` passed.
- Plan grep acceptance checks passed for `switchKind`, `selectedTrackRef`, `playbackProfile`, `buildRealMvSwitchTarget`, `switch_committed`, and `jsonb_set`.

## Next Phase Readiness

15-04 can now teach the browser TV runtime to consume `selectedTrackRef`, report actual audio-track switching capability, and apply/rollback same-file real-MV track switches.

---
*Phase: 15-search-queue-playback-and-switching*
*Completed: 2026-05-13*
