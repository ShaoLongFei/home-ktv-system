---
phase: 15-search-queue-playback-and-switching
plan: 05
subsystem: mobile-api-tv-regression
tags: [react, fastify, playback-contracts, real-mv, vitest]
requires:
  - phase: 15-search-queue-playback-and-switching
    provides: Real-MV search, queue, playback target, switch target, and TV audio-track runtime contracts from Plans 01-04
provides:
  - Mobile disabled real-MV search result rendering with Chinese labels
  - Mobile server-authoritative switch failure handling and snapshot notice rendering
  - Cross-surface real-MV playback regression coverage from search through switch commit
  - Final Phase 15 regression and typecheck evidence
affects: [mobile-controller, api, tv-player, player-contracts, real-mv-playback]
tech-stack:
  added: []
  patterns:
    - Disabled search versions remain visible and use `canQueue`/`disabledLabel` for UI actions
    - Mobile switch attempts stay server-authoritative and render command errors plus snapshot notices
    - API regression tests compose repository fakes to prove multi-surface playback contracts without media files
key-files:
  created:
    - apps/api/src/test/real-mv-playback-flow.test.ts
  modified:
    - apps/mobile-controller/src/App.tsx
    - apps/mobile-controller/src/runtime/use-room-controller-runtime.ts
    - apps/mobile-controller/src/test/controller.test.tsx
key-decisions:
  - "Mobile treats `canQueue === false` as disabled UI state while still showing the search result."
  - "Mobile add-queue payload remains `{ songId, assetId }`; no queue-time vocal-mode picker or payload field was added."
  - "Mobile switch control stays available whenever a current target exists; server and TV runtime decide actual switch availability."
requirements-completed: [PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05]
duration: 89min
completed: 2026-05-13
---

# Phase 15 Plan 05: Mobile UI and Cross-Surface Regression Summary

**Mobile real-MV queue/switch UI backed by an API regression proving search, queue, playback target, switch target, and switch commit contracts**

## Performance

- **Duration:** 89 min
- **Started:** 2026-05-13T09:45:01Z
- **Completed:** 2026-05-13T11:14:14Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Mobile search now renders nonqueueable real-MV versions as visible disabled actions with short Chinese labels: `需预处理`, `暂不可播放`, or backend-provided labels.
- Mobile queueing still sends only `songId` and `assetId`; vocal mode remains inherited by backend playback intent.
- Mobile switch button no longer depends on a source `switchFamily`; real-MV same-asset playback can attempt switching, and `SWITCH_TARGET_NOT_AVAILABLE` renders a clear Chinese error without permanently disabling the button.
- Snapshot notices such as `switch_failed_reverted` now surface through the Mobile banner path.
- `real-mv-playback-flow.test.ts` proves ready and unsupported real-MV flows across search, queue, playback target, switch target, and `switch_committed` telemetry persistence.

## Task Commits

1. **Tasks 1-2: Mobile disabled search and switch failure behavior** - `15dc42b` (`feat`)
2. **Task 3: API cross-surface real-MV playback flow regression** - `8c7d91a` (`test`)
3. **Task 4: Final regression gate** - no code commit; verification commands passed after Tasks 1-3

**Plan metadata:** pending docs commit

## Files Created/Modified

- `apps/mobile-controller/src/App.tsx` - Reads `canQueue`/`disabledLabel`, disables nonqueueable version buttons, renders `version-option__status`, keeps switch action visible for current targets, and renders snapshot notices.
- `apps/mobile-controller/src/runtime/use-room-controller-runtime.ts` - Maps `SWITCH_TARGET_NOT_AVAILABLE` to `当前歌曲暂不支持切换原唱/伴唱` and keeps the UI interactive after failures.
- `apps/mobile-controller/src/test/controller.test.tsx` - Covers disabled result labels, no `vocalMode` add-queue payload, real-MV switch button visibility, command rejection copy, and snapshot notice rendering.
- `apps/api/src/test/real-mv-playback-flow.test.ts` - Covers ready real-MV search/queue/playback target, same-asset switch target plus switch commit persistence, unsupported disabled search state, queue rejection, and out-of-scope source guard.

## Decisions Made

- Mobile disabled-state behavior is driven by backend version fields instead of local codec or compatibility heuristics.
- Mobile continues to avoid queue-time original/accompaniment selection; backend remains responsible for resolving current-room vocal intent.
- Same-asset switch attempts are optimistic user actions but server-authoritative commands; unavailable attempts are user-visible errors, not permanent local feature disables.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- API regression fake repositories initially missed exact production repository signatures. The test harness was corrected to satisfy generic playback event, command repository, and device session contracts, then API typecheck passed.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/song-search-routes.test.ts src/test/room-queue-commands.test.ts src/test/build-playback-target.test.ts src/test/build-switch-target.test.ts src/test/player-runtime-contract.test.ts src/test/real-mv-playback-flow.test.ts` — passed, 36 files / 231 tests.
- `pnpm -F @home-ktv/mobile-controller test -- src/test/controller.test.tsx` — passed, 1 file / 35 tests.
- `pnpm -F @home-ktv/tv-player test -- src/test/active-playback-controller.test.tsx src/test/app-runtime.test.tsx src/test/tv-screen-states.test.tsx` — passed, 15 files / 55 tests.
- `pnpm -F @home-ktv/player-contracts typecheck` — passed.
- `pnpm -F @home-ktv/api typecheck` — passed.
- `pnpm -F @home-ktv/mobile-controller typecheck` — passed.
- `pnpm -F @home-ktv/tv-player typecheck` — passed.
- `rg -n "PLAY-01|PLAY-02|PLAY-03|PLAY-04|PLAY-05" .planning/phases/15-search-queue-playback-and-switching/15-*-PLAN.md` — passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 15 now has automated evidence across Mobile search UI, server queue/playback intent, switch contract, TV runtime behavior, and failure states. The milestone is ready for phase-level verification and completion routing.

---
*Phase: 15-search-queue-playback-and-switching*
*Completed: 2026-05-13*
