# Phase 3: Room Sessions & Queue Control - Research

**Date:** 2026-05-01
**Status:** Complete

## Research Question

What does the planner need to know to implement Phase 3 well:扫码入场、控制会话恢复、服务端权威队列、多人手机同步、播放中原唱/伴唱切换触发，以及管理员轮换入场 token。

## Current Codebase State

### Existing Runtime Foundation

- `packages/domain/src/index.ts` already defines `Room`, `QueueEntry`, `PlaybackSession`, `DeviceSession`, `PlaybackEvent`, `DeviceType = "tv" | "mobile"`, queue statuses, player states, and `PlaybackOptions`.
- `packages/player-contracts/src/index.ts` already defines `RoomSnapshot`, `PairingInfo`, `PlaybackTarget`, `SwitchTarget`, `SwitchTransitionResult`, and `ReconnectRecoveryResult`.
- `packages/protocol/src/index.ts` currently has player command/telemetry names and `room.snapshot.updated`; it should be expanded for control commands and snapshot broadcasts rather than duplicating envelope types inside apps.
- `packages/session-engine/src/index.ts` is intentionally a stub. Phase 3 should turn this into the typed reducer/command surface for add/delete/promote/skip/ended/switch commands.
- `apps/api/src/routes/room-snapshots.ts` can already build a TV-facing snapshot and pairing info. It currently creates pairing info from a generated token on every snapshot request.
- `apps/api/src/routes/player.ts` already exposes TV bootstrap, heartbeat, telemetry, switch-transition, and reconnect-recovery routes.
- `apps/tv-player/src/runtime/use-room-snapshot.ts` currently polls snapshots every 1500ms and stabilizes pairing payload per room.
- `apps/admin/src/App.tsx` has Imports/Songs tabs and can be extended with a Rooms tab.

### Database Foundation

- `apps/api/src/db/migrations/0001_media_contract.sql` already has `rooms`, `queue_entries`, `device_sessions`, `playback_sessions`, and `playback_events`.
- `device_sessions` already has `device_type` and `pairing_token`, but it does not model mobile control sessions, token expiry, idle expiry, or token rotation state explicitly enough for Phase 3.
- `queue_entries` already has `queue_position`, `status`, `priority`, and `requested_by`, but repository support only includes `findById`.
- `playback_sessions` already has `current_queue_entry_id`, `next_queue_entry_id`, `active_asset_id`, `target_vocal_mode`, `player_state`, `player_position_ms`, and `version`.
- Existing PostgreSQL pattern is plain SQL migrations plus repository interfaces. Do not introduce an ORM.

### Dependency Snapshot

- API stack: Fastify `5.8.5`, `pg`, TypeScript, Vitest.
- `@fastify/websocket` is not installed. `pnpm view @fastify/websocket version` returned `11.2.0`; its dependencies include `ws`, `duplexify`, and `fastify-plugin`.
- Frontend stack: React `19.2.5`, Vite `8.0.10`; admin uses TanStack Query, TV player does not.

## User Decisions That Drive Planning

- `pairingToken` TTL is 15 minutes.
- Control session is server-side + httpOnly cookie + local device id.
- Existing control sessions survive token expiry and token rotation until their own idle timeout.
- Control sessions expire after 2 hours of inactivity.
- Multiple mobile controllers are equal in Phase 3.
- Skip current song requires confirmation; delete queued item uses short undo; vocal mode switch does not require confirmation.
- WebSocket is the primary sync path; failed reconnect falls back to low-frequency polling with visible offline/reconnect state.
- Mobile first screen must show current playback, vocal switch, queue, add-song entry, and TV online state.
- Phase 3 needs only a minimal ready-song list/selector; full Chinese search and multi-version selection remain Phase 4.
- Promote means move to the first queued position after the current song, not interrupt playback.
- Skip and TV `ended` immediately advance to the next song; empty queue returns to `idle`.
- Commands use `sessionVersion` / `commandId` for idempotency and conflict rejection.
- Admin Rooms view must show token expiry, online controller count, TV online state, queue summary, and a refresh token action.

## Recommended Technical Approach

### 1. Pairing and Control Sessions

Create a server-owned room pairing token state instead of generating a fresh token per snapshot request. The TV snapshot should expose the current token, expiry, and controller URL. Admin refresh should replace the token and expiry immediately.

Suggested database additions:

- `room_pairing_tokens(room_id primary key, token_hash, token_expires_at, rotated_at, created_at, updated_at)` or equivalent room columns. A separate table keeps token lifecycle isolated from TV `device_sessions`.
- `control_sessions(id primary key, room_id, device_id, device_name, last_seen_at, expires_at, revoked_at, created_at, updated_at)`.
- `control_commands(command_id primary key, room_id, control_session_id, session_version, command_type, command_payload, result_status, created_at)` for idempotency and audit-friendly replay prevention.

Token lookup should compare a token hash or opaque token value. The plan can choose hash storage, but it must keep the API contract opaque; clients should not parse business meaning out of tokens.

Suggested API surface:

- `POST /rooms/:roomSlug/control-sessions` with `{ pairingToken, deviceId, deviceName }`, sets httpOnly cookie and returns `{ controlSession, snapshot }`.
- `GET /rooms/:roomSlug/control-session` restores from cookie + device id and returns `{ controlSession, snapshot }`.
- `POST /rooms/:roomSlug/pairing-token/refresh` under admin route, invalidates old token for new scans and returns updated pairing info.

### 2. Authoritative Session Engine and Queue Commands

Keep command logic behind a service/module boundary and use the DB transaction as the runtime authority. Avoid letting HTTP routes mutate `queue_entries` and `playback_sessions` independently.

Suggested command types:

- `add-queue-entry`: validates song is `ready`, uses the song default asset, requires asset `ready`, appends with next position.
- `delete-queue-entry`: only queued/preparing entries that are not current; supports undo by either a soft `deleted` state if added, or by immediate remove plus command event for UI undo. Because current enum lacks `deleted`, simplest MVP is to mark as `skipped` with event payload `reason: "deleted_by_controller"` only if planner accepts that semantic; otherwise migration should add a `removed`/`deleted` status.
- `promote-queue-entry`: moves the selected queued item to first position after current; does not interrupt current playback.
- `skip-current`: requires matching `sessionVersion`, marks current as `skipped`, immediately advances next queued entry or sets session idle.
- `player-ended`: TV telemetry `ended` should call the same advance helper as `skip-current`, but mark current as `played`.
- `switch-vocal-mode`: control command should request/commit a server-authorized target. The existing TV route `/player/switch-transition` currently lets TV request the transition; Phase 3 should add a controller command that changes intended target or emits a command/snapshot that causes TV to perform the switch through the existing transition path.

Important implementation rule: update `playback_sessions.version` on every accepted command and every TV fact that changes target/current status. Reject stale `sessionVersion` with a structured conflict response that includes the latest snapshot.

### 3. Snapshot and Realtime Sync

Extend `RoomSnapshot` or add a mobile-specific room state shape. Current `RoomSnapshot` has current target and switch target but not the full queue, online controller count, or TV online state. Phase 3 success criteria require mobile controllers to see queue and TV status immediately.

Preferred shape:

- Keep `RoomSnapshot` compatible for TV.
- Add shared `RoomControlSnapshot` in `@home-ktv/player-contracts` or a new contract type that includes:
  - `roomId`, `roomSlug`, `sessionVersion`, `state`, `generatedAt`
  - `pairing`
  - `tvPresence: { online, deviceName, lastSeenAt, conflict }`
  - `controllers: { onlineCount }`
  - `currentTarget`
  - `switchTarget`
  - `queue: QueueEntryPreview[]`
  - `notice`

WebSocket should broadcast server-generated snapshots after every accepted command and relevant TV telemetry. HTTP routes should return the same latest snapshot as the mutation response.

The TV can continue polling initially, but the plan should either:

- migrate TV to the same WebSocket snapshot stream, or
- keep TV polling as fallback while mobile uses WebSocket, then explicitly document this as an interim Phase 3 decision.

Given Phase 3 requires TV and phones to remain consistent, the stronger plan is to make the API broadcaster source common and allow both WebSocket and HTTP polling to read the same snapshot builder.

### 4. Mobile Controller App

There is no mobile controller app yet. Add a new Vite React workspace app, likely `apps/mobile-controller`, following TV/admin patterns.

Minimum UI:

- `/controller?room=living-room&token=...` entry from QR.
- On first load, create/restore control session.
- First screen shows:
  - TV online/offline status.
  - Current song and artist.
  - vocal mode switch button when `switchTarget` exists.
  - skip-current button with confirmation.
  - queue list with delete and promote controls.
  - minimal ready-song list/selector to add to queue.
  - reconnect/offline banner when WebSocket is down and polling fallback is active.

The mobile app should not implement full search. It can consume a minimal endpoint such as `GET /rooms/:roomSlug/available-songs` or reuse a catalog listing endpoint filtered to `status=ready`, showing title/artist only.

### 5. Admin Rooms View

Extend existing admin app with a Rooms tab rather than creating a new admin shell. The view should be operational and dense:

- `GET /admin/rooms/:roomSlug` returns token expiry, TV online state, online controller count, session version, and queue summary.
- `POST /admin/rooms/:roomSlug/pairing-token/refresh` rotates token and returns new pairing info.
- UI displays token expiry, TV status, online controller count, current song, next few queue items, and a refresh token button with confirmation or clear affordance.

ADMN-03 is in Phase 3, but ADMN-02 is Phase 5. Do not expand into full playback event history or full device management in Phase 3.

## Planning Risks and Constraints

- `createPairingInfo` currently hardcodes a 5-minute TTL and generates a new token on every call. Phase 3 must move this into persistent room pairing state with 15-minute TTL.
- Existing `PairingInfo` has no explicit token persistence model; downstream code stabilizes pairing in TV state because snapshots currently generate new tokens. The new model should remove the need for TV-only stabilization as the primary token behavior.
- `QueueEntryRepository` only supports `findById`; queue list, append, reorder, status updates, next selection, and transaction helpers are missing.
- `PlaybackSessionRepository` updates player facts but not queue advancement. Avoid duplicating advancement logic in telemetry route and control route.
- Current `RoomSnapshot` lacks full queue and presence fields; mobile cannot be built well from the current snapshot alone.
- Fastify WebSocket support requires adding a dependency and route/plugin registration. Tests should exercise the broadcaster/service without needing fragile browser WebSocket integration for every case.
- `device_sessions` maps `device_type` to `tv` in `mapDeviceSessionRow`; it must become generic before mobile sessions use the same table.
- Source-deployment preference means plans should use existing pnpm workspace/source build flow, not Docker.

## Suggested Plan Split

### 03-01: Pairing Token and Control Sessions

Owns schema, persistent pairing token lifecycle, mobile control session creation/restoration, admin token refresh API, and snapshot pairing persistence.

### 03-02: Session Engine and Queue Commands

Owns service/reducer command semantics, repository transaction methods, add/delete/promote/skip/ended/switch commands, idempotency, session version conflicts, and backend tests.

### 03-03: Realtime Sync, Mobile Controller, Admin Room View, TV Closure

Owns WebSocket broadcaster, mobile controller app, fallback polling, admin Rooms tab, queue/snapshot UI, and TV/mobile/admin integration tests/builds.

## Verification Strategy

Run at minimum:

- `pnpm typecheck`
- `pnpm -F @home-ktv/api test -- control-session room-queue session-engine realtime`
- `pnpm -F @home-ktv/api build`
- `pnpm -F @home-ktv/mobile-controller test -- controller`
- `pnpm -F @home-ktv/mobile-controller build`
- `pnpm -F @home-ktv/admin test -- room-status`
- `pnpm -F @home-ktv/admin build`
- `pnpm -F @home-ktv/tv-player test -- use-room-snapshot switch-runtime reconnect-recovery`
- `pnpm -F @home-ktv/tv-player build`

## Research Complete

Phase 3 should be planned as a three-plan sequence matching the roadmap. The core architectural decision is to make a backend command/session service the only writer of room state, then expose that state consistently over HTTP snapshot responses and WebSocket broadcasts.
