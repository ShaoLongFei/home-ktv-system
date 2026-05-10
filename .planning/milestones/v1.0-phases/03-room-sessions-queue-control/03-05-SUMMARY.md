---
phase: 03-room-sessions-queue-control
plan: 05
type: execute
completed: 2026-05-03
---

# Phase 3-05: Realtime Room Snapshot Fanout Summary

## Outcome

03-05 is complete. Room state now fans out through a server-side WebSocket broadcaster, mobile realtime sessions are gated by control-session cookies plus device matching, and accepted command/player mutations broadcast authoritative snapshots to subscribers.

## What Changed

- Added `apps/api/src/modules/realtime/room-snapshot-broadcaster.ts` as the in-process room subscription and fanout layer.
- Added `apps/api/src/routes/realtime.ts` for `GET /rooms/:roomSlug/realtime` with mobile cookie validation, idle renewal, and periodic ping frames.
- Wired `@fastify/websocket` and the broadcaster through `apps/api/src/server.ts`.
- Broadcast accepted controller command snapshots from `apps/api/src/routes/control-commands.ts`.
- Broadcast persisted player snapshots from `apps/api/src/routes/player.ts` after heartbeat, telemetry, ended, and reconnect recovery flows.
- Added regression coverage in `apps/api/src/test/realtime-room-sync.test.ts`.

## Verification

- `pnpm -F @home-ktv/api test -- realtime-room-sync room-queue-commands player-runtime-contract`
- `pnpm -F @home-ktv/api build`
- `pnpm typecheck`

## Notes

- WebSocket subscribers receive server-generated snapshots only.
- Mobile realtime renewals refresh server-side `lastSeenAt` and `expiresAt`.
- Rejected, duplicate, and conflict command outcomes do not broadcast optimistic state.
