---
phase: 08-code-structure-hardening
type: execute
wave: 1
depends_on: ["07-productized-ui-polish"]
files_modified:
  - apps/admin/src/rooms/use-room-status.ts
  - apps/admin/src/rooms/RoomStatusView.tsx
  - apps/admin/src/test/room-status.test.tsx
  - apps/mobile-controller/src/runtime/use-room-controller-runtime.ts
  - apps/mobile-controller/src/runtime/use-room-controller.ts
  - apps/mobile-controller/src/test/controller.test.tsx
  - apps/tv-player/src/runtime/use-tv-playback-runtime.ts
  - apps/tv-player/src/App.tsx
  - apps/tv-player/src/test/app-runtime.test.tsx
  - .planning/phases/08-code-structure-hardening/08-SUMMARY.md
autonomous: true
requirements:
  - QUAL-01
  - QUAL-02
  - QUAL-03
  - QUAL-04
---

<objective>
Refactor the highest-churn runtime boundaries in Admin, Mobile, and TV while preserving the complete Phase 6/7 product behavior.

Purpose: v1.1 is now product-usable; Phase 8 should make the code easier to extend without adding product scope.
Output: app-local runtime hooks, thinner page components, updated regression tests, and final quality gates.
</objective>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/08-code-structure-hardening/08-CONTEXT.md
@docs/plans/2026-05-09-phase-8-code-structure-hardening-design.md
@docs/plans/2026-05-09-phase-8-code-structure-hardening.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract Admin room status runtime</name>
  <files>apps/admin/src/rooms/use-room-status.ts, apps/admin/src/rooms/RoomStatusView.tsx, apps/admin/src/test/room-status.test.tsx</files>
  <read_first>
    - apps/admin/src/rooms/RoomStatusView.tsx
    - apps/admin/src/api/client.ts
    - apps/admin/src/test/room-status.test.tsx
  </read_first>
  <action>
    Add or tighten a regression that proves room refresh, pairing-token refresh, and online task retry/clean/promote still update state without browser reload.

    Create `apps/admin/src/rooms/use-room-status.ts` and move these concerns out of `RoomStatusView.tsx`:
    - initial load
    - websocket setup and teardown
    - fallback polling
    - manual room refresh
    - pairing-token refresh
    - online task retry/clean/promote state
    - `busyTaskAction`, `isRefreshingRoom`, `isRefreshingPairing`, and `errorMessage`

    Keep the visible DOM and button labels unchanged.
  </action>
  <verify>
    <automated>pnpm -F @home-ktv/admin test -- room-status</automated>
    <automated>pnpm -F @home-ktv/admin typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/admin/src/rooms/use-room-status.ts` exists.
    - `RoomStatusView.tsx` no longer owns websocket setup directly.
    - Room status tests still cover `刷新房间状态`, `刷新配对 token`, `入库`, `重试`, and `清理`.
  </acceptance_criteria>
  <done>Admin room runtime is behind a focused hook and the page component is render-focused.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extract Mobile controller runtime boundary</name>
  <files>apps/mobile-controller/src/runtime/use-room-controller-runtime.ts, apps/mobile-controller/src/runtime/use-room-controller.ts, apps/mobile-controller/src/test/controller.test.tsx</files>
  <read_first>
    - apps/mobile-controller/src/runtime/use-room-controller.ts
    - apps/mobile-controller/src/api/client.ts
    - apps/mobile-controller/src/test/controller.test.tsx
  </read_first>
  <action>
    Add or tighten regression coverage for session restore, reconnect polling, search, command result state, undo state, supplement pending state, and vocal switching.

    Create `apps/mobile-controller/src/runtime/use-room-controller-runtime.ts` and move runtime orchestration out of `use-room-controller.ts` while preserving the public `useRoomController()` return shape consumed by `App.tsx`.

    Keep existing command names, public state fields, visible copy, and API routes unchanged.
  </action>
  <verify>
    <automated>pnpm -F @home-ktv/mobile-controller test</automated>
    <automated>pnpm -F @home-ktv/mobile-controller typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/mobile-controller/src/runtime/use-room-controller-runtime.ts` exists.
    - `use-room-controller.ts` is a stable facade rather than a monolithic runtime implementation.
    - Existing tests for `电视在线`, `请求补歌`, `提交中`, `切到原唱`, `切到伴唱`, `撤销`, and reconnect polling still pass.
  </acceptance_criteria>
  <done>Mobile runtime orchestration has a clearer module boundary without UI behavior changes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extract TV playback runtime boundary and close quality gates</name>
  <files>apps/tv-player/src/runtime/use-tv-playback-runtime.ts, apps/tv-player/src/App.tsx, apps/tv-player/src/test/app-runtime.test.tsx, .planning/phases/08-code-structure-hardening/08-SUMMARY.md</files>
  <read_first>
    - apps/tv-player/src/App.tsx
    - apps/tv-player/src/runtime/active-playback-controller.ts
    - apps/tv-player/src/runtime/switch-controller.ts
    - apps/tv-player/src/runtime/recovery-controller.ts
    - apps/tv-player/src/runtime/heartbeat-controller.ts
    - apps/tv-player/src/test/app-runtime.test.tsx
  </read_first>
  <action>
    Add or tighten regression coverage for first-play blocking, backend-requested vocal switching, heartbeat, reconnect recovery, local notices, and ended telemetry.

    Create `apps/tv-player/src/runtime/use-tv-playback-runtime.ts` and move these concerns out of `App.tsx`:
    - player client creation
    - room snapshot subscription
    - video pool initialization
    - active playback synchronization
    - pointer retry for first-play blocking
    - heartbeat interval
    - reconnect recovery effect
    - keyboard vocal-switch handler
    - local notice merge
    - playback clock frame updates

    Keep TV screen routing, Phase 6 copy, first-play prompt, and `mm:ss / mm:ss` behavior unchanged.
  </action>
  <verify>
    <automated>pnpm -F @home-ktv/tv-player test</automated>
    <automated>pnpm -F @home-ktv/tv-player typecheck</automated>
    <automated>pnpm test</automated>
    <automated>pnpm typecheck</automated>
    <automated>node scripts/ui-visual-check.mjs --help</automated>
    <automated>node scripts/tv-visual-check.mjs --help</automated>
  </verify>
  <acceptance_criteria>
    - `apps/tv-player/src/runtime/use-tv-playback-runtime.ts` exists.
    - `App.tsx` no longer directly owns heartbeat/recovery/keyboard/pointer runtime effects.
    - TV runtime tests still pass for first-play, switching, recovery, conflict, and telemetry flows.
    - `pnpm test` and `pnpm typecheck` pass.
  </acceptance_criteria>
  <done>Phase 8 has app-local runtime boundaries and final quality gates.</done>
</task>

</tasks>
