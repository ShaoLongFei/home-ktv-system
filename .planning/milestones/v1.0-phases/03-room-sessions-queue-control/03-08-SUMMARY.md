---
phase: 03-room-sessions-queue-control
plan: 08
type: execute
completed: 2026-05-04
---

# Phase 3-08: TV WebSocket Snapshot Sync Summary

## Outcome

03-08 is complete. The TV player now bootstraps as before, then consumes the shared room realtime stream over WebSocket. If the realtime connection closes or errors, it falls back to the existing 1500ms snapshot polling path.

## What Changed

- Added `PlayerClient.createSnapshotSocketUrl()` for `GET /rooms/:roomSlug/realtime?deviceId=...&client=tv`.
- Converted HTTP API bases to `ws://` and HTTPS API bases to `wss://`.
- Updated `useRoomSnapshot()` to open the TV realtime socket after non-conflict bootstrap.
- Added handling for `room.control.snapshot.updated` envelopes and mapped control snapshots into TV-compatible room snapshots.
- Removed the old pairing stabilization behavior so server-refreshed pairing tokens update the TV QR state.
- Preserved conflict bootstrap behavior so active TV conflicts do not get overwritten by polling.
- Added DOM hook coverage for realtime updates, fallback polling, and conflict bootstrap behavior.

## Verification

- `pnpm -F @home-ktv/tv-player test -- use-room-snapshot`
- `pnpm -F @home-ktv/tv-player build`
- `pnpm typecheck`

## Notes

- Polling remains available only as a fallback path after realtime failure.
- TV and mobile now consume the same server-authored snapshot stream.
