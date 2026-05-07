---
phase: 05-online-supplement-recovery
verified: 2026-05-07T12:53:37Z
status: human_needed
score: 12/13 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 11/13
  gaps_closed:
    - "Mobile search now renders local results before the online supplement panel when both local and online candidates exist."
    - "Mobile controller regression coverage now asserts local result text appears before online candidate text inside the Song search panel."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Mobile online supplement UAT"
    expected: "With a safe provider enabled, mixed local-plus-online search shows local results first, online candidates below them, and request-supplement creates a task without queueing playback."
    why_human: "Browser/device ordering, touch ergonomics, and copy clarity need visual confirmation."
  - test: "Admin recovery console UAT"
    expected: "Operators can inspect room state, queue, player events, task state, and run retry, clean, and promote from task rows without a top-level promote shortcut."
    why_human: "Operational legibility and visual density cannot be fully verified by static checks."
  - test: "Provider/compliance UAT"
    expected: "Enabled providers obey kill-switch and cache-before-play boundaries; disabled providers remain invisible and unfetchable."
    why_human: "External provider scope and compliance policy are outside code-only verification."
---

# Phase 05: Online Supplement & Recovery Verification Report

**Phase Goal:** 在不破坏本地优先稳定性的前提下，补上安全补歌、失败回退和运维恢复能力  
**Verified:** 2026-05-07T12:53:37Z  
**Status:** human_needed  
**Re-verification:** Yes - after 05-05 gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | When local search has no matches, the phone shows online candidates plus a request-supplement entry | VERIFIED | `createServer()` injects `onlineRuntime.tasks`; `online-runtime-wiring.test.ts` proves real search returns `demo-local` candidates; mobile controller test still verifies empty-local online candidates and request buttons. |
| 2 | When local results exist, online candidates remain visible below them | VERIFIED | `App.tsx` renders `controller.songSearch?.local.map` at line 114 before `online-panel` at line 177; mobile test `renders online supplement candidates below local results when both exist` asserts `localIndex < onlineIndex`. |
| 3 | Online candidate cards show title, artist, source, duration, candidate type, and risk/reliability labels | VERIFIED | `App.tsx` renders candidate title, artist, sourceLabel, duration, candidateType, reliabilityLabel, riskLabel, taskState, and explicit request button. |
| 4 | Submitting a supplement request creates a persisted task flow instead of auto-enqueueing playback | VERIFIED | `server.ts` passes `onlineRuntime.tasks` to control commands; runtime tests prove accepted task, empty admin queue, and null current target. |
| 5 | Task record preserves discovered, selected, review_required, fetching, fetched, ready, failed, stale, promoted, and purged | VERIFIED | Domain enum, SQL check constraint, repository mapper, and lifecycle service cover all states. |
| 6 | Candidate tasks advance through selected, fetching, fetched, ready, failed, stale, promoted, and purged as cache flow progresses | VERIFIED | `runtime.ts` attaches `CandidateCacheWorker`; tests prove selected demo tasks and retried failed tasks reach `ready`. |
| 7 | Ready cached assets stay supplement-sourced and only enter queue when explicitly selected | VERIFIED | Queue gate rejects non-ready/unverified/`online_ephemeral`; runtime tests assert request-supplement and retry do not mutate queue/current target. |
| 8 | Playback failure skips directly to the next song and the controller sees both reason and fallback result | VERIFIED | `player.ts` routes failed telemetry to `handlePlayerFailed`; service records failure and returns/broadcasts reason plus `skipped_to_next` or idle fallback. |
| 9 | Failed and stale tasks can be retried or cleaned without auto-enqueueing or auto-promoting | VERIFIED | Admin task routes call `retryTask`/`purgeTask`; runtime retry test keeps queue empty and current target null. |
| 10 | Admin Rooms defaults to room state, current song, queue, TV online, controller count, recent events, and online task summary | VERIFIED | `buildRoomControlSnapshot` and `admin-rooms.ts` include all fields; admin tests pass. |
| 11 | Operators can refresh room state, refresh pairing token, retry or clean failed tasks, and promote resources from task detail | VERIFIED | Admin API helpers and `RoomStatusView` task-row actions are wired to room-scoped endpoints. |
| 12 | The Rooms page does not show a prominent ready-resource promote button | VERIFIED | Promote appears only inside ready task rows; no top-level promote action is present. |
| 13 | The recovery view makes the task and event relationship visible enough to diagnose failures quickly | NEEDS HUMAN | Static code shows online task rows and recent events together; final operational clarity needs browser/operator UAT. |

**Score:** 12/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/domain/src/index.ts` | Online candidate/task/search contracts | VERIFIED | `SongSearchResponse`, `OnlineCandidateCard`, task states, and task record exist. |
| `apps/api/src/db/migrations/0006_online_candidates.sql` | `candidate_tasks` persistence | VERIFIED | Table, lifecycle checks, room/provider unique key, indexes, timestamps. |
| `apps/api/src/modules/online/repositories/candidate-task-repository.ts` | Persistence API | VERIFIED | PG and in-memory repositories implement upsert, lookup, list, and transition. |
| `apps/api/src/config.ts` | Runtime provider config boundary | VERIFIED | Reads `ONLINE_PROVIDER_IDS`, `ONLINE_PROVIDER_KILL_SWITCH_IDS`, and `ONLINE_DEMO_READY_ASSET_ID`; defaults disabled. |
| `apps/api/src/modules/online/demo-provider.ts` | Safe deterministic provider | VERIFIED | `demo-local` has no playback URL and verifies ready only with explicit ready asset id. |
| `apps/api/src/modules/online/runtime.ts` | Runtime assembly | VERIFIED | Builds registry, task service, worker; attaches worker as selected-task processor. |
| `apps/api/src/server.ts` | Real route wiring | VERIFIED | Injects `onlineRuntime.tasks` into admin rooms, song search, and control command routes. |
| `apps/api/src/routes/song-search.ts` | Local-first search response with online candidates | VERIFIED | Calls `discoverCandidates` and returns local array plus online candidate payload. |
| `apps/api/src/routes/control-commands.ts` | Request-supplement command route | VERIFIED | Calls `requestSupplement` and returns task without queue command execution. |
| `apps/api/src/modules/online/candidate-task-service.ts` | Lifecycle and selected/retry trigger | VERIFIED | `requestSupplement` and `retryTask` call `processSelectedTask`; non-selected paths do not trigger worker. |
| `apps/api/src/modules/online/candidate-cache-worker.ts` | Cache orchestration | VERIFIED | Calls provider `prepareFetch` and `verify`, then persists fetched/ready/review/failed states. |
| `apps/mobile-controller/src/App.tsx` | Mobile candidate rendering and local-first order | VERIFIED | Candidate cards render, and local results render before the online panel. `gsd-tools verify artifacts 05-05-PLAN.md` passed this artifact. |
| `apps/mobile-controller/src/test/controller.test.tsx` | Mobile online supplement regression coverage | VERIFIED | Mixed local-plus-online test asserts `localIndex < onlineIndex`; targeted mobile tests pass 23/23. `gsd-tools verify artifacts 05-05-PLAN.md` passed this artifact. |
| `apps/admin/src/rooms/RoomStatusView.tsx` | Recovery UI | VERIFIED | Room, queue, TV/controllers, recent events, task summaries, and row-scoped actions are present. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `server.ts` | `song-search.ts` | `registerSongSearchRoutes(... online: onlineRuntime.tasks)` | WIRED | Server passes runtime tasks into real search routes. |
| `server.ts` | `control-commands.ts` | `registerControlCommandRoutes(... online: onlineRuntime.tasks)` | WIRED | Server passes runtime tasks into request-supplement command routes. |
| `runtime.ts` | `candidate-cache-worker.ts` | `tasks.attachSelectedTaskProcessor(worker)` | WIRED | Selected/retry transitions invoke `worker.processTask`. |
| `candidate-cache-worker.ts` | `provider-registry.ts` | `getCacheCapableProvider`, `prepareFetch`, `verify` | WIRED | Worker only processes cache-capable enabled providers. |
| `use-room-controller.ts` | `api/client.ts` | `searchSongs` and `requestSupplement` | WIRED | Runtime hook fetches search and submits explicit supplement requests. |
| `App.tsx` | `use-room-controller.ts` | `controller.songSearch.local` before `controller.songSearch.online` | WIRED | Manual static check returned `{"local":4579,"online":7199,"localBeforeOnline":true}`. |
| `controller.test.tsx` | `App.tsx` | DOM text index assertion inside Song search panel | WIRED | Test computes `localIndex`/`onlineIndex` and asserts `localIndex` is less than `onlineIndex`. |
| `admin-rooms.ts` | `CandidateTaskService` | retry, clean, promote | WIRED | Room-scoped task actions call service methods. |
| `player.ts` | `session-command-service.ts` | failed telemetry to `handlePlayerFailed` | WIRED | Server-owned failure recovery path is used. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `song-search.ts` | `onlineCandidates` | `onlineRuntime.tasks.discoverCandidates` -> registry -> provider -> repository | Yes | FLOWING |
| `control-commands.ts` | `task` | `onlineRuntime.tasks.requestSupplement` -> repository transition -> selected processor | Yes | FLOWING |
| `candidate-task-service.ts` | selected/retried task | `requestSupplement` / `retryTask` -> `processSelectedTask` | Yes | FLOWING |
| `candidate-cache-worker.ts` | ready task | provider `prepareFetch` / `verify` -> `markFetched` / `markReady` | Yes | FLOWING |
| `mobile App.tsx` | `songSearch.local` and `songSearch.online.candidates` | controller fetch from search route | Yes | FLOWING |
| `RoomStatusView.tsx` | `roomStatus.onlineTasks` and `recentEvents` | admin client -> admin rooms route -> snapshot builder | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|---|---|---|---|
| Workspace tests | `pnpm test` | Passed: 8 successful workspace tasks; API 27 files / 134 tests, Admin 4 files / 17 tests, Mobile 1 file / 23 tests, TV 11 files / 28 tests. | PASS |
| Workspace typecheck | `pnpm typecheck` | Passed: 12 successful workspace tasks. | PASS |
| Mobile ordering regression | `pnpm -F @home-ktv/mobile-controller test -- controller` | Passed: 1 test file / 23 tests, including mixed local-plus-online ordering. | PASS |
| Mobile typecheck | `pnpm -F @home-ktv/mobile-controller typecheck` | Passed with exit code 0. | PASS |
| 05-05 artifact verifier | `gsd-tools verify artifacts 05-05-PLAN.md` | Passed: 2/2 artifacts. | PASS |
| 05-05 key-link verifier | `gsd-tools verify key-links 05-05-PLAN.md` plus manual check | Tool returned false for literal regex patterns; manual grep confirmed JSX order and DOM assertion. | PASS |
| Mobile local-first render order | Static order check on `App.tsx` | `controller.songSearch?.local.map` at line 114; `online-panel` at line 177; local index 4579 < online index 7199. | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| ONLN-01 | 05-01, 05-04, 05-05 | 本地歌库无法满足时，用户可以主动请求在线补歌候选 | SATISFIED | Real server search can return controlled candidates when `demo-local` is enabled; phone can submit explicit request; mixed local/online UI keeps candidates visible below local results. |
| ONLN-02 | 05-01, 05-02, 05-04 | 在线候选提交到先缓存后播放流程，而不是直接在线播放 | SATISFIED | Request-supplement persists task; worker caches/verifies; demo provider exposes no playback URL. |
| ONLN-03 | 05-02, 05-04 | 只有受控且 ready 的资源才可以进入正式点歌队列 | SATISFIED | Queue gate rejects non-ready/unverified/ephemeral assets; worker-ready tasks do not auto-enqueue. |
| ONLN-04 | 05-03 | 管理员查看任务状态、重试失败、清理失败、资源转正 | SATISFIED | Admin status/actions and task rows are implemented and tested. |
| PLAY-05 | 05-02 | 播放失败自动切备用或跳下一首并提示原因 | SATISFIED | Phase implementation uses safe skip-first recovery and returns/broadcasts reason/result. |
| ADMN-02 | 05-03 | 后台查看房间状态、队列、TV、控制端数量、最近事件 | SATISFIED | Admin status payload and UI include room, queue, TV presence, controllers, and recent events. |

All six supplied Phase 5 requirement IDs are present in `.planning/REQUIREMENTS.md` and mapped to Phase 5 as complete. No additional Phase 5 requirement IDs were found beyond ONLN-01, ONLN-02, ONLN-03, ONLN-04, PLAY-05, and ADMN-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/mobile-controller/src/App.tsx` | 108 | Input `placeholder` text | Info | Normal search input hint; not a stub. |
| `apps/mobile-controller/src/test/controller.test.tsx` | 447 | Test name contains `placeholder` | Info | Test wording only; not a stub. |
| `apps/mobile-controller/src/test/controller.test.tsx` | 687 | `return null` in fake storage helper | Info | Test helper fallback; not product behavior. |

No blocker anti-patterns were found in the 05-05 modified application/test files.

### Human Verification Required

### 1. Mobile Online Supplement UAT

**Test:** With `ONLINE_PROVIDER_IDS=demo-local` and a controlled ready asset configured, search for cases with no local results and with mixed local-plus-online results, then submit a candidate.  
**Expected:** Empty-local search still shows online candidates and request-supplement controls; mixed search shows local results first and online supplement below; submit creates/updates a task and does not create queue/current playback state.  
**Why human:** Browser/device ordering, text clarity, and touch ergonomics need visual confirmation.

### 2. Admin Recovery Console UAT

**Test:** Open Rooms with seeded ready/failed/stale online tasks and recent playback failures; run retry, clean, and promote from task rows.  
**Expected:** Operators can diagnose task/event cause quickly, actions refresh state, and no top-level promote shortcut appears.  
**Why human:** Operational legibility and visual density cannot be fully verified by grep and unit tests.

### 3. Provider/Compliance UAT

**Test:** Confirm configured providers obey kill-switch, cache-before-play, and compliance boundaries.  
**Expected:** Disabled providers stay invisible/unfetchable; enabled providers only produce controlled cached resources.  
**Why human:** External provider policy and compliance are outside static code verification.

### Gaps Summary

The previous code-verifiable gap is closed. Mobile search now renders local results before online supplement candidates, and the behavior is covered by a mixed local-plus-online DOM-order regression test. Runtime online search, request-supplement persistence, cache worker processing, playback failure recovery, and admin recovery actions remain wired and covered by tests.

No implementation gaps remain from code verification. The phase still requires human UAT for mobile presentation on real viewports/devices, admin recovery legibility, and provider/compliance policy boundaries.

---

_Verified: 2026-05-07T12:53:37Z_  
_Verifier: Codex (gsd-verifier)_
