---
phase: 12-contract-schema-and-playback-risk-spike
plan: 04
subsystem: player-contract
tags: [playback-target, real-mv, track-ref, playback-profile]

requires:
  - phase: 12-contract-schema-and-playback-risk-spike
    provides: Durable real-MV asset fields and compatibility/media contracts from 12-02 and 12-03
provides:
  - PlaybackTarget playbackProfile contract field
  - PlaybackTarget selectedTrackRef contract field
  - Backend construction of legacy and single-file real-MV playback targets
affects: [phase-15-playback, tv-player, mobile-controller, room-snapshot]

tech-stack:
  added: []
  patterns:
    - Backend-authored playback targets always emit playbackProfile and selectedTrackRef
    - Legacy separate-asset playback uses selectedTrackRef null

key-files:
  created: []
  modified:
    - packages/player-contracts/src/index.ts
    - apps/api/src/modules/playback/build-playback-target.ts
    - apps/api/src/test/build-playback-target.test.ts

key-decisions:
  - "PlaybackTarget fields are optional in the shared TypeScript contract for Phase 12 compatibility, but backend builders emit them."
  - "Single-file real-MV targets carry explicit selectedTrackRef based on asset.vocalMode and trackRoles."
  - "Legacy pair assets use a separate_asset_pair playback profile and selectedTrackRef null."

patterns-established:
  - "Playback target construction owns selected track intent instead of relying on TV-side inference."
  - "Playback profile fallback derives neutral codec/container fields from asset mediaInfoSummary when present."

requirements-completed: [MEDIA-04, MEDIA-02]

duration: 4min
completed: 2026-05-11
---

# Phase 12-04: PlaybackTarget Profile and Selected Track Ref Summary

**Backend playback targets now carry platform-neutral playback profile data and explicit selected audio-track intent for real-MV assets.**

## Performance

- **Duration:** 4 min elapsed
- **Started:** 2026-05-11T08:18:21Z
- **Completed:** 2026-05-11T08:21:57Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Extended `PlaybackTarget` with optional `playbackProfile` and `selectedTrackRef` fields.
- Added backend helper logic to build default `separate_asset_pair` profiles for legacy assets.
- Added backend helper logic to select original or instrumental `TrackRef` for single-file real-MV assets.
- Added tests for legacy playback targets and single-file real-MV instrumental track selection.

## Task Commits

1. **Task 1: Extend PlaybackTarget with platform-neutral fields** - included in `feat(12-04): add playback target track profile`
2. **Task 2: Build playbackProfile and selectedTrackRef from persisted asset fields** - included in `feat(12-04): add playback target track profile`

## Files Created/Modified

- `packages/player-contracts/src/index.ts` - Adds `PlaybackProfile` and `TrackRef` imports plus new PlaybackTarget fields.
- `apps/api/src/modules/playback/build-playback-target.ts` - Builds playback profile and selected track ref for target payloads.
- `apps/api/src/test/build-playback-target.test.ts` - Covers legacy and single-file real-MV target outputs.

## Decisions Made

- Kept contract fields optional to avoid breaking older snapshot fixtures while making current backend-authored targets emit both fields.
- Used asset `vocalMode` to select `trackRoles.original` or `trackRoles.instrumental`; dual/unknown modes produce null until later playback policy decides.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- API typecheck required refreshing the local `@home-ktv/player-contracts` build output after changing the package source, because API imports package exports through dist.

## Verification

- `pnpm --filter @home-ktv/api exec vitest run src/test/build-playback-target.test.ts`
- `pnpm -F @home-ktv/player-contracts typecheck`
- `pnpm -F @home-ktv/player-contracts build`
- `pnpm -F @home-ktv/api typecheck`
- Acceptance grep checks for player contract fields, backend helper usage, real-MV test coverage, and absence of platform-specific contract fields.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-05 can now focus on browser playback-risk probing without changing the target contract shape again.

---
*Phase: 12-contract-schema-and-playback-risk-spike*
*Completed: 2026-05-11*
