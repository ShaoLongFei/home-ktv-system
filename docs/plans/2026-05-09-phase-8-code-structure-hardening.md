# Phase 8 Code Structure Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor Admin, Mobile, and TV runtime logic into clearer app-local boundaries while preserving all user-visible behavior.

**Architecture:** Extract one focused runtime hook per high-churn surface: Admin room status, Mobile controller runtime, and TV playback runtime. Keep existing public component behavior stable and use existing Vitest suites as the regression safety net.

**Tech Stack:** TypeScript, React hooks, Vitest, existing Vite app packages.

---

### Task 1: Extract Admin Room Status Runtime

**Files:**
- Create: `apps/admin/src/rooms/use-room-status.ts`
- Modify: `apps/admin/src/rooms/RoomStatusView.tsx`
- Modify: `apps/admin/src/test/room-status.test.tsx`

**Steps:**
1. Add a failing room-status regression that proves refresh, pairing-token refresh, and online task actions still update without browser reload.
2. Move initial load, websocket lifecycle, fallback polling, refresh state, pairing refresh, and task action execution into `useRoomStatus()`.
3. Keep `RoomStatusView` focused on rendering the returned state and callbacks.
4. Run `pnpm -F @home-ktv/admin test -- room-status`.
5. Run `pnpm -F @home-ktv/admin typecheck`.

### Task 2: Extract Mobile Controller Runtime Boundary

**Files:**
- Create: `apps/mobile-controller/src/runtime/use-room-controller-runtime.ts`
- Modify: `apps/mobile-controller/src/runtime/use-room-controller.ts`
- Modify: `apps/mobile-controller/src/test/controller.test.tsx`

**Steps:**
1. Add or tighten a runtime regression covering session restore, realtime recovery, search, and command result state.
2. Move session bootstrap, websocket/fallback polling, search debounce, pending supplement state, undo state, and command result application into `useRoomControllerRuntime()`.
3. Keep `useRoomController()` as the stable public facade consumed by `App.tsx`.
4. Run `pnpm -F @home-ktv/mobile-controller test`.
5. Run `pnpm -F @home-ktv/mobile-controller typecheck`.

### Task 3: Extract TV Playback Runtime Boundary

**Files:**
- Create: `apps/tv-player/src/runtime/use-tv-playback-runtime.ts`
- Modify: `apps/tv-player/src/App.tsx`
- Modify: `apps/tv-player/src/test/app-runtime.test.tsx`

**Steps:**
1. Add or tighten a TV runtime regression that still covers first-play blocking, backend-requested vocal switching, recovery, heartbeat, and ended telemetry.
2. Move video-pool setup, active playback synchronization, pointer retry, heartbeat, recovery, keyboard switch handling, local notice merge, and playback clock state into `useTvPlaybackRuntime()`.
3. Keep `App.tsx` responsible for rendering videos and choosing the screen.
4. Run `pnpm -F @home-ktv/tv-player test`.
5. Run `pnpm -F @home-ktv/tv-player typecheck`.

### Task 4: Final Quality Gate

**Files:**
- Modify: `.planning/STATE.md`
- Modify: `.planning/ROADMAP.md`
- Add: `.planning/phases/08-code-structure-hardening/08-SUMMARY.md`

**Steps:**
1. Run `pnpm test`.
2. Run `pnpm typecheck`.
3. Run `node scripts/ui-visual-check.mjs --help`.
4. Run `node scripts/tv-visual-check.mjs --help`.
5. Record Phase 8 summary and update planning state.
