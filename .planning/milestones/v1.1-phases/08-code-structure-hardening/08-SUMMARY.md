---
phase: 08-code-structure-hardening
plan: 00
subsystem: quality
tags: [runtime-boundaries, verification, traceability, audit]
requires:
  - phase: 07-productized-ui-polish
    provides: Chinese-first UI and behavior baseline
provides:
  - Admin room status runtime hook
  - Mobile controller runtime hook
  - TV playback runtime hook
affects: [admin, mobile-controller, tv-player, phase-09, phase-11]
tech-stack:
  added: []
  patterns:
    - App-local runtime hooks instead of cross-app shared package
    - Page components remain render-focused while runtime hooks own orchestration
key-files:
  created:
    - apps/admin/src/rooms/use-room-status.ts
    - apps/mobile-controller/src/runtime/use-room-controller-runtime.ts
    - apps/tv-player/src/runtime/use-tv-playback-runtime.ts
  modified:
    - apps/admin/src/rooms/RoomStatusView.tsx
    - apps/mobile-controller/src/runtime/use-room-controller.ts
    - apps/tv-player/src/App.tsx
key-decisions:
  - "Keep runtime extraction app-local until duplication or cross-app coupling justifies a shared package."
  - "Do not broaden product behavior while moving runtime orchestration behind hooks."
patterns-established:
  - "Admin room refresh, realtime, fallback polling, pairing-token refresh, and online-task actions live behind useRoomStatus()."
  - "Mobile controller runtime orchestration lives behind useRoomControllerRuntime() while useRoomController() remains the stable facade."
  - "TV playback synchronization, first-play retry, heartbeat, recovery, keyboard switching, notices, and clock updates live behind useTvPlaybackRuntime()."
requirements-completed:
  - QUAL-02
  - QUAL-03
  - QUAL-04
duration: 0min
completed: 2026-05-09
---

# Phase 08 Summary: Code Structure & Logic Hardening

**Status**: Complete  
**Completed at**: 2026-05-09T14:46:53+08:00  
**Branch**: `phase-8-code-structure-hardening`

## Completed Scope

- Extracted Admin room runtime into `apps/admin/src/rooms/use-room-status.ts`.
  - `RoomStatusView.tsx` is now render-focused.
  - Room refresh, pairing-token refresh, realtime updates, fallback polling, and online-task actions live behind the hook.
- Extracted Mobile controller runtime into `apps/mobile-controller/src/runtime/use-room-controller-runtime.ts`.
  - `apps/mobile-controller/src/runtime/use-room-controller.ts` remains the stable facade for `App.tsx` and tests.
  - Public exports and command behavior were preserved.
- Extracted TV playback runtime into `apps/tv-player/src/runtime/use-tv-playback-runtime.ts`.
  - `App.tsx` now owns video refs and screen routing only.
  - Client creation, snapshot subscription, video pool setup, playback synchronization, first-play retry, heartbeat, recovery, keyboard vocal switching, local notices, playback clock, and ended telemetry moved into the runtime hook.

## Behavior Preserved

- No new product scope was added.
- Phase 6 TV behavior remains intact, including first-play prompt, vocal switching, recovery/conflict states, and `mm:ss / mm:ss` display.
- Phase 7 Chinese-first UI behavior remains intact.
- Existing app import paths remain stable for Admin/Mobile/TV UI surfaces.

## Verification

- `pnpm -F @home-ktv/mobile-controller test` — 1 file, 28 tests passed.
- `pnpm -F @home-ktv/mobile-controller typecheck` — passed.
- `pnpm -F @home-ktv/tv-player test` — 13 files, 41 tests passed.
- `pnpm -F @home-ktv/tv-player typecheck` — passed.
- `pnpm test` — 8/8 Turbo tasks successful.
- `pnpm typecheck` — 12/12 Turbo tasks successful.
- `node scripts/ui-visual-check.mjs --help` — passed.
- `node scripts/tv-visual-check.mjs --help` — passed.

## Commits

- `d7d73aa` — `refactor(08): extract admin room status runtime`
- `ff31abf` — `refactor(08): extract mobile controller runtime`
- `0ca9625` — `refactor(08): extract tv playback runtime`

## Next Step

Phase 8 is ready to merge back to `main`, then v1.1 can move into milestone audit/completion.
