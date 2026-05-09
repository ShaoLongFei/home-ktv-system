---
phase: 08
slug: code-structure-hardening
status: ready-for-execution
created: 2026-05-09
---

# Phase 08 - Code Structure & Logic Hardening Context

## Phase Boundary

Phase 8 hardens the code structure behind the already working v1.1 product flow. It should not add new user-facing features, redesign UI, introduce multi-room behavior, change playback semantics, or add a new shared workspace package unless implementation exposes a concrete need.

The main product goal is maintainability: Admin, Mobile, and TV should keep the same behavior while page components become thinner and runtime logic lives in focused hooks/helpers.

## Locked Decisions

- **D-01:** Preserve existing visible behavior. This phase is structural; UI copy and interaction behavior from Phases 6 and 7 remain the product baseline.
- **D-02:** Prefer app-local extraction over a new cross-app package. A shared package for HTTP/error/device helpers is deferred until duplication becomes more costly than package wiring.
- **D-03:** Page components should render state and wire callbacks; they should not own websocket lifecycles, polling, command orchestration, or playback runtime effects.
- **D-04:** Admin focus is `RoomStatusView`: initial load, realtime sync, fallback polling, pairing-token refresh, and online-task actions should move to `useRoomStatus()`.
- **D-05:** Mobile focus is the controller runtime: session restore, token exchange, realtime/fallback recovery, search debounce, command result application, undo state, and supplement pending state should be behind a runtime hook while `useRoomController()` remains the public facade.
- **D-06:** TV focus is `App.tsx`: playback synchronization, first-play retry, heartbeat, recovery, keyboard switching, local notices, and playback-clock updates should move to `useTvPlaybackRuntime()`.
- **D-07:** Add or tighten runtime-level tests where logic moves. Existing UI/runtime tests must continue to pass.
- **D-08:** Keep existing local dev and visual-check scripts as the documented verification entry points.

## Canonical References

- `.planning/ROADMAP.md` - Phase 8 goal and success criteria.
- `.planning/REQUIREMENTS.md` - `QUAL-01` through `QUAL-04`.
- `.planning/phases/07-productized-ui-polish/07-03-SUMMARY.md` - Current UI baseline and verification gates.
- `docs/plans/2026-05-09-phase-8-code-structure-hardening-design.md` - Approved Phase 8 design direction.
- `docs/plans/2026-05-09-phase-8-code-structure-hardening.md` - Implementation plan.

## Code References

- `apps/admin/src/rooms/RoomStatusView.tsx` - Admin room status render, realtime lifecycle, refresh actions, online task actions.
- `apps/admin/src/api/client.ts` - Admin API boundary and realtime URL helper.
- `apps/admin/src/test/room-status.test.tsx` - Admin room status regression suite.
- `apps/mobile-controller/src/runtime/use-room-controller.ts` - Mobile controller session/search/command runtime.
- `apps/mobile-controller/src/App.tsx` - Mobile controller display consumer.
- `apps/mobile-controller/src/test/controller.test.tsx` - Mobile controller runtime and UI regression suite.
- `apps/tv-player/src/App.tsx` - TV app render shell plus current playback orchestration.
- `apps/tv-player/src/runtime/*controller.ts` - TV playback, switch, recovery, and heartbeat controllers.
- `apps/tv-player/src/test/app-runtime.test.tsx` - TV app-level runtime regression suite.

## Product Constraints

- Do not change the family KTV product flow.
- Do not change Phase 6 TV playback behavior.
- Do not change Phase 7 Chinese-first UI behavior.
- Do not introduce a state-management framework or UI library.
- Do not start a broad import/catalog rewrite unless a required test proves the boundary is blocking.

## Success Shape

- Admin `RoomStatusView` is mostly presentation with a dedicated room-status hook.
- Mobile `useRoomController()` remains stable for the UI but delegates runtime orchestration.
- TV `App.tsx` is a thin shell around videos and screen selection.
- All current tests and type checks pass.
- Phase 8 summary can point to concrete boundary improvements, not just renames.
