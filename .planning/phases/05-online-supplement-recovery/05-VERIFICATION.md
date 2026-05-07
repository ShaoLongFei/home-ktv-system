---
phase: 05-online-supplement-recovery
verified: 2026-05-07T11:23:50Z
status: gaps_found
score: 7/13 must-haves verified
gaps:
  - truth: "When local search has no matches, the phone shows online candidates plus a request-supplement entry"
    status: failed
    reason: "The real API server creates an online task service but does not pass it into song search, and the runtime provider registry is empty, so search always falls back to an empty online candidate list."
    artifacts:
      - path: "apps/api/src/server.ts"
        issue: "registerSongSearchRoutes is called without online: onlineTasks; createOnlineTaskService uses providers: [] and enabledProviderIds: []."
      - path: "apps/api/src/routes/song-search.ts"
        issue: "Route only discovers candidates through optional dependencies.online?.discoverCandidates, so the real server returns [] when that dependency is omitted."
    missing:
      - "Wire CandidateTaskService into registerSongSearchRoutes from createServer."
      - "Provide at least a configured safe provider or explicit provider injection/config path so online discovery can produce candidates."
  - truth: "Submitting a supplement request creates a persisted task flow instead of auto-enqueueing playback"
    status: failed
    reason: "The request-supplement route is implemented, but createServer does not pass online: onlineTasks into registerControlCommandRoutes, so real supplement requests return ONLINE_CANDIDATE_NOT_FOUND."
    artifacts:
      - path: "apps/api/src/server.ts"
        issue: "registerControlCommandRoutes is called without the online dependency."
      - path: "apps/api/src/routes/control-commands.ts"
        issue: "handleRequestSupplement depends on optional dependencies.online?.requestSupplement and returns 404 when it is absent."
    missing:
      - "Wire CandidateTaskService into registerControlCommandRoutes from createServer."
      - "Add a runtime-level test through createServer proving request-supplement persists a task and does not enqueue playback."
  - truth: "Candidate tasks advance through selected, fetching, fetched, ready, failed, stale, promoted, and purged as cache flow progresses"
    status: failed
    reason: "Lifecycle methods and CandidateCacheWorker exist, but CandidateCacheWorker has no runtime caller outside tests; selected tasks cannot progress through fetching/fetched/ready in the running app."
    artifacts:
      - path: "apps/api/src/modules/online/candidate-cache-worker.ts"
        issue: "Substantive worker implementation exists but is orphaned from server/routes/jobs."
      - path: "apps/api/src/server.ts"
        issue: "No worker construction, trigger, provider configuration, or selected-task processing path is registered."
    missing:
      - "Register a cache processing trigger for selected/retried tasks."
      - "Wire provider prepareFetch/verify into the runtime registry and persist resulting ready assets."
---

# Phase 05: Online Supplement & Recovery Verification Report

**Phase Goal:** 在不破坏本地优先稳定性的前提下，补上安全补歌、失败回退和运维恢复能力  
**Verified:** 2026-05-07T11:23:50Z  
**Status:** gaps_found  
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | When local search has no matches, the phone shows online candidates plus a request-supplement entry | FAILED | UI can render injected candidates, but `createServer()` does not pass `onlineTasks` to `registerSongSearchRoutes` and runtime providers are empty. |
| 2 | When local results exist, online candidates remain visible below them | FAILED | Route supports the shape in tests, but real server search has no online dependency, so `online.candidates` is always `[]`. |
| 3 | Online candidate cards show title, artist, source, duration, candidate type, and risk/reliability labels | FAILED | `App.tsx` renders these fields when present, but runtime data flow never produces candidate cards. |
| 4 | Submitting a supplement request creates a persisted task flow instead of auto-enqueueing playback | FAILED | `control-commands.ts` calls optional `dependencies.online?.requestSupplement`; real server omits it and returns `ONLINE_CANDIDATE_NOT_FOUND`. |
| 5 | Task record preserves discovered, selected, review_required, fetching, fetched, ready, failed, stale, promoted, and purged | VERIFIED | Domain enum, SQL checks, schema row, repository timestamps, and lifecycle tests cover all states. |
| 6 | Candidate tasks advance through selected, fetching, fetched, ready, failed, stale, promoted, and purged as cache flow progresses | FAILED | Service and worker methods exist, but `CandidateCacheWorker` has no runtime caller and no configured providers. |
| 7 | Ready cached assets stay supplement-sourced and only enter queue when explicitly selected | VERIFIED | `session-command-service.ts` rejects non-ready/unverified/online_ephemeral assets; tests accept ready verified `online_cached`. |
| 8 | Playback failure skips directly to the next song and the controller sees both reason and fallback result | VERIFIED | `player.ts` routes failed telemetry to `handlePlayerFailed`; test verifies `MEDIA_DECODE`, `skipped_to_next`, notice, event, and broadcast. |
| 9 | Failed and stale tasks can be retried or cleaned without auto-enqueueing or auto-promoting | VERIFIED | Admin task routes call `retryTask`/`purgeTask`; tests assert task-scoped calls and no queue mutation. |
| 10 | Admin Rooms defaults to room state, current song, queue, TV online, controller count, recent events, and online task summary | VERIFIED | `buildRoomControlSnapshot`, `admin-rooms`, admin types, and tests cover these fields. |
| 11 | Operators can refresh room state, refresh pairing token, retry or clean failed tasks, and promote resources from task detail | VERIFIED | Admin API helpers and `RoomStatusView` task-row actions are wired to room-scoped endpoints. |
| 12 | The Rooms page does not show a prominent ready-resource promote button | VERIFIED | Promote action is only rendered inside ready task rows; tests cover the no-prominent-promote constraint. |
| 13 | The recovery view makes the task and event relationship visible enough to diagnose failures quickly | UNCERTAIN | Static code shows recent events and task rows together; final visual/operational diagnosis needs human UAT. |

**Score:** 7/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/domain/src/index.ts` | Online candidate/task contracts | VERIFIED | Shared response, card, task, source type, and lifecycle enums exist. |
| `apps/api/src/db/migrations/0006_online_candidates.sql` | `candidate_tasks` persistence | VERIFIED | Table, lifecycle checks, room/provider unique key, indexes, timestamps. |
| `apps/api/src/modules/online/repositories/candidate-task-repository.ts` | Persistence API | VERIFIED | Upsert, list, lookup, transition, PG and in-memory implementations. |
| `apps/api/src/routes/song-search.ts` | Local-first search with online candidates | HOLLOW | Route implementation is real, but runtime server omits `online` dependency. |
| `apps/mobile-controller/src/App.tsx` | Mobile candidate rendering | HOLLOW | Renders candidate fields, but real API does not provide candidate data. |
| `apps/api/src/modules/online/candidate-task-service.ts` | Lifecycle and repair service | VERIFIED | Discovery, selection, transition, retry, promote, purge implemented. |
| `apps/api/src/modules/online/candidate-cache-worker.ts` | Cache orchestration | ORPHANED | Worker is substantive but unused outside tests. |
| `apps/api/src/modules/playback/session-command-service.ts` | Queue gate and failure recovery | VERIFIED | Ready gate, explicit queueing, failed playback advance implemented. |
| `apps/api/src/routes/player.ts` | Failed telemetry branch | VERIFIED | Calls `handlePlayerFailed`, returns reason/fallback, broadcasts snapshot. |
| `apps/api/src/routes/admin-rooms.ts` | Recovery endpoints and status response | VERIFIED | Pairing refresh, retry, clean, promote, online summaries. |
| `apps/api/src/modules/realtime/room-snapshot-broadcaster.ts` | Snapshot fanout | VERIFIED | Broadcasts `room.control.snapshot.updated`. |
| `apps/api/src/modules/playback/repositories/playback-event-repository.ts` | Recent event query | VERIFIED | `listRecentByRoom` implemented. |
| `apps/api/src/modules/rooms/build-control-snapshot.ts` | Recovery snapshot assembly | VERIFIED | Recent events and online task summaries assembled with safe fallbacks. |
| `apps/admin/src/rooms/types.ts` | Admin room contracts | VERIFIED | Room status, recent events, online task summary/action types. |
| `apps/admin/src/rooms/RoomStatusView.tsx` | Recovery UI | VERIFIED | Dense room, queue, TV/controller, event, and task action surface. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `song-search.ts` | `candidate-task-service.ts` | `discoverCandidates` | NOT WIRED IN RUNTIME | Route supports optional dependency, but `createServer()` omits it. |
| `use-room-controller.ts` | `api/client.ts` | `searchSongs` and `requestSupplement` | WIRED | Runtime hook calls client helpers. |
| `candidate-task-repository.ts` | `0006_online_candidates.sql` | `candidate_tasks` columns/indexes | WIRED | SQL and row mapper align on lifecycle/status columns. |
| `player.ts` | `session-command-service.ts` | `handlePlayerFailed` | WIRED | Failed telemetry resolves through server-side skip. |
| `session-command-service.ts` | Online asset semantics | `sourceType` ready gate | WIRED | `online_ephemeral` rejected; ready verified `online_cached` accepted. |
| `admin-rooms.ts` | `candidate-task-service.ts` | retry/clean/promote | WIRED | Server passes `onlineTasks` to admin routes. |
| `build-control-snapshot.ts` | `apps/admin/src/rooms/types.ts` | `recentEvents` and `onlineTasks` payload | WIRED | Backend/admin contracts align. |
| `admin-rooms.ts` | `apps/admin/src/api/client.ts` | refresh/retry/clean/promote routes | WIRED | Client helpers call implemented routes. |
| `RoomStatusView.tsx` | `App.css` | dense recovery layout | WIRED | CSS classes exist and tests cover UI labels/actions. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `song-search.ts` | `onlineCandidates` | `dependencies.online?.discoverCandidates` | No in real server | HOLLOW |
| `control-commands.ts` | `task` | `dependencies.online?.requestSupplement` | No in real server | HOLLOW |
| `candidate-cache-worker.ts` | selected task -> ready task | `processTask()` | No runtime caller | DISCONNECTED |
| `session-command-service.ts` | selected asset | Song/asset repositories | Yes | FLOWING |
| `player.ts` | failure reason/result notice | telemetry body -> `handlePlayerFailed` | Yes | FLOWING |
| `RoomStatusView.tsx` | `roomStatus` | admin client -> admin room route -> snapshot builder | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|---|---|---|---|
| Workspace tests after final TV notice fix | `pnpm test` run by orchestrator | 8 workspace test tasks successful: API 26 files / 126 tests, Admin 4 files / 17 tests, Mobile 1 file / 22 tests, TV 11 files / 28 tests | PASS |
| Workspace typecheck after final TV notice fix | `pnpm typecheck` run by orchestrator | 12 successful tasks | PASS |
| Runtime server online search wiring | `nl -ba apps/api/src/server.ts` lines 200-204 vs `song-search.ts` lines 41-46 | `onlineTasks` not passed; route falls back to `[]` | FAIL |
| Runtime server supplement wiring | `nl -ba apps/api/src/server.ts` lines 205-210 vs `control-commands.ts` lines 144-150 | `onlineTasks` not passed; route returns 404 | FAIL |
| Cache worker runtime usage | `rg "CandidateCacheWorker|processTask\\(" apps packages` | Only implementation and tests found | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| ONLN-01 | 05-01 | 本地歌库无法满足时，用户可以主动请求在线补歌候选 | BLOCKED | UI and route shapes exist, but real server has no online search service/provider data flow. |
| ONLN-02 | 05-01, 05-02 | 在线候选提交到先缓存后播放流程，而不是直接在线播放 | BLOCKED | Route/service support exists in tests, but runtime command is unwired and worker has no caller. |
| ONLN-03 | 05-02 | 只有受控且 ready 的资源才可以进入正式点歌队列 | PARTIAL | Queue gate is verified, but actual candidate-to-ready cache flow is not wired. |
| ONLN-04 | 05-03 | 管理员查看任务状态、重试失败、清理失败、资源转正 | SATISFIED | Admin room payload/actions and tests cover task summaries and task-scoped actions. |
| PLAY-05 | 05-02 | 播放失败自动切备用或跳下一首并提示原因 | SATISFIED | Phase decision uses skip-first; failed telemetry advances to next/idle and broadcasts reason/result. |
| ADMN-02 | 05-03 | 后台查看房间状态、队列、TV、控制端数量、最近事件 | SATISFIED | Admin status response and UI cover room, queue, TV presence, controllers, recent events. |

No additional Phase 5 requirement IDs were found in `REQUIREMENTS.md` beyond the six supplied and claimed in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/api/src/server.ts` | 200 | `registerSongSearchRoutes` without `online: onlineTasks` | Blocker | Online candidates cannot appear in the real app. |
| `apps/api/src/server.ts` | 205 | `registerControlCommandRoutes` without `online: onlineTasks` | Blocker | Supplement request command cannot persist tasks in the real app. |
| `apps/api/src/server.ts` | 217 | `providers: []` / `enabledProviderIds: []` | Blocker | Runtime online discovery/cache registry cannot produce candidates. |
| `apps/api/src/modules/online/candidate-cache-worker.ts` | 18 | Worker only referenced by tests | Blocker | Selected tasks do not progress into fetching/fetched/ready. |

Other `return null` matches were normal guard paths or UI empty-state helpers, not placeholders.

### Human Verification Required

These should be run after the blocking wiring gaps are fixed:

1. **Mobile online supplement UAT**  
   **Test:** Search for a missing song on the phone with a safe provider enabled, request one candidate, and confirm no queue entry is created.  
   **Expected:** Candidate cards appear below local results or in the empty-local view; request creates/updates a task and shows task state.  
   **Why human:** End-to-end provider behavior, mobile ergonomics, and text clarity need browser/device verification.

2. **Admin recovery console UAT**  
   **Test:** Open Rooms with seeded ready/failed/stale online tasks and recent playback failures; run retry, clean, and promote from task rows.  
   **Expected:** Operators can diagnose task/event cause quickly, actions refresh state, and no top-level promote shortcut appears.  
   **Why human:** Visual density and operational legibility cannot be fully verified with grep/tests.

3. **Provider/compliance UAT**  
   **Test:** Confirm configured providers obey kill-switch, cache-before-play, and compliance boundaries.  
   **Expected:** Disabled providers remain invisible/unfetchable; enabled providers only produce controlled cached resources.  
   **Why human:** External provider scope and legal/ops policy are outside static code verification.

### Gaps Summary

Phase 05 is not goal-complete. The backend contains real domain contracts, persistence, route handlers, task services, ready-gate logic, playback failure recovery, and an admin recovery console. However, the core online supplement path is disconnected in the actual server assembly:

- Search does not receive `CandidateTaskService`.
- Supplement command handling does not receive `CandidateTaskService`.
- Runtime provider registry is empty and unconfigurable.
- Cache worker exists but is not invoked by any route, job, or retry path.

As a result, users cannot actually see online candidates, request a supplement into a persisted cache flow, or watch selected tasks progress to ready resources in the running system.

---

_Verified: 2026-05-07T11:23:50Z_  
_Verifier: Claude (gsd-verifier)_
