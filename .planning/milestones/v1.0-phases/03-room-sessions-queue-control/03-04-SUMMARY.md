---
phase: 03-room-sessions-queue-control
plan: 04
type: execute
completed: 2026-05-03
---

# Phase 3-04: Authoritative Queue Commands and TV Ended Advancement Summary

## Outcome

03-04 is complete. Controller queue mutations now go through one server-side command service, mobile control routes are wired, minimal available-song listing is exposed, and TV ended telemetry advances through the shared helper.

## What Changed

- Added `apps/api/src/modules/playback/session-command-service.ts` with authoritative command execution, undo handling, conflict detection, and shared advancement helpers.
- Extended `apps/api/src/modules/rooms/build-control-snapshot.ts` to include effective queue entries plus undoable removed entries.
- Added `apps/api/src/routes/control-commands.ts` for the six mobile controller command endpoints.
- Added `apps/api/src/routes/available-songs.ts` for the minimal ready-song picker.
- Routed `player.telemetry.ended` through shared advancement in `apps/api/src/routes/player.ts`.
- Added playback-session version bump support so accepted controller commands advance `sessionVersion`.
- Updated server wiring for the new routes and in-memory command repository support.
- Added regression coverage for queue commands and TV ended advancement in `apps/api/src/test/room-queue-commands.test.ts`.

## Verification

- `pnpm -F @home-ktv/api test -- room-queue-commands player-runtime-contract`
- `pnpm -F @home-ktv/api build`
- `pnpm typecheck`

## Notes

- Skip current still requires explicit confirmation.
- Removed queue entries are only visible in the control snapshot while their undo window is open.
- Phase 4 search and multi-version picker scope was not introduced here.
