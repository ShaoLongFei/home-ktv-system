---
phase: 05-online-supplement-recovery
verified: 2026-05-07T12:13:24Z
status: gaps_found
score: 11/13 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 7/13
  gaps_closed:
    - "createServer() now passes online runtime tasks into real search routes, and real search can return controlled demo-local candidates when explicitly enabled."
    - "createServer() now passes online runtime tasks into real request-supplement command routes, and request-supplement persists a task without queue/current target mutation."
    - "CandidateCacheWorker now has a runtime trigger from selected/retried tasks and can move successful provider work through fetching, fetched, and ready."
  gaps_remaining: []
  regressions:
    - "Mobile search renders the online supplement section before local results, violating the local-first/below-local presentation truth."
gaps:
  - truth: "When local results exist, online candidates remain visible below them"
    status: failed
    reason: "Runtime search can now produce online candidates, but the phone UI renders the online supplement section before local search results. This violates the phase's local-first presentation goal."
    artifacts:
      - path: "apps/mobile-controller/src/App.tsx"
        issue: "The online supplement section starts before the local result map; static order check reports onlineBeforeLocal=true."
      - path: "apps/mobile-controller/src/test/controller.test.tsx"
        issue: "Existing mobile tests assert online candidates render but do not assert local-before-online ordering when both are present."
    missing:
      - "Move local result rendering before the online supplement panel in the search list."
      - "Add a mobile controller test proving local result text appears before online supplement text when both are returned."
human_verification:
  - test: "Mobile online supplement UAT"
    expected: "With a safe provider enabled, missing-song search shows online candidates and request-supplement creates a task without queueing playback."
    why_human: "Mobile ergonomics, ordering, and copy clarity need browser/device confirmation after the UI-order gap is fixed."
  - test: "Admin recovery console UAT"
    expected: "Operators can inspect task/event state and run retry, clean, and promote from task rows without a top-level promote shortcut."
    why_human: "Operational legibility and visual density cannot be fully verified by static checks."
  - test: "Provider/compliance UAT"
    expected: "Enabled providers obey kill-switch and cache-before-play boundaries; disabled providers remain invisible/unfetchable."
    why_human: "External provider scope and compliance policy are outside code-only verification."
---

# Phase 05: Online Supplement & Recovery Verification Report

**Phase Goal:** 在不破坏本地优先稳定性的前提下，补上安全补歌、失败回退和运维恢复能力  
**Verified:** 2026-05-07T12:13:24Z  
**Status:** gaps_found  
**Re-verification:** Yes - after 05-04 gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | When local search has no matches, the phone shows online candidates plus a request-supplement entry | VERIFIED | `createServer()` injects `onlineRuntime.tasks`; `online-runtime-wiring.test.ts` proves real search returns `demo-local` candidates; mobile UI renders candidates and request buttons. |
| 2 | When local results exist, online candidates remain visible below them | FAILED | `apps/mobile-controller/src/App.tsx` renders the online panel before `controller.songSearch?.local.map`; static spot-check returned `onlineBeforeLocal: true`. |
| 3 | Online candidate cards show title, artist, source, duration, candidate type, and risk/reliability labels | VERIFIED | `App.tsx` renders title, artist, sourceLabel, duration, candidateType, reliabilityLabel, riskLabel, and taskState. |
| 4 | Submitting a supplement request creates a persisted task flow instead of auto-enqueueing playback | VERIFIED | `server.ts` passes `onlineRuntime.tasks` to control commands; runtime test proves accepted task, empty admin queue, and null current target. |
| 5 | Task record preserves discovered, selected, review_required, fetching, fetched, ready, failed, stale, promoted, and purged | VERIFIED | Domain enum, SQL check constraint, repository mapper, and lifecycle service cover all states. |
| 6 | Candidate tasks advance through selected, fetching, fetched, ready, failed, stale, promoted, and purged as cache flow progresses | VERIFIED | `runtime.ts` attaches `CandidateCacheWorker`; tests prove selected demo tasks and retried failed tasks reach `ready`. |
| 7 | Ready cached assets stay supplement-sourced and only enter queue when explicitly selected | VERIFIED | Queue gate rejects non-ready/unverified/`online_ephemeral`; runtime tests assert request-supplement and retry do not mutate queue/current target. |
| 8 | Playback failure skips directly to the next song and the controller sees both reason and fallback result | VERIFIED | `player.ts` routes failed telemetry to `handlePlayerFailed`; service records failure and returns/broadcasts reason plus `skipped_to_next` or idle fallback. |
| 9 | Failed and stale tasks can be retried or cleaned without auto-enqueueing or auto-promoting | VERIFIED | Admin task routes call `retryTask`/`purgeTask`; runtime retry test keeps queue empty and current target null. |
| 10 | Admin Rooms defaults to room state, current song, queue, TV online, controller count, recent events, and online task summary | VERIFIED | `buildRoomControlSnapshot` and `admin-rooms.ts` include all fields; admin tests passed in orchestrator run. |
| 11 | Operators can refresh room state, refresh pairing token, retry or clean failed tasks, and promote resources from task detail | VERIFIED | Admin API helpers and `RoomStatusView` task-row actions are wired to room-scoped endpoints. |
| 12 | The Rooms page does not show a prominent ready-resource promote button | VERIFIED | Promote appears only inside ready task rows; no top-level promote action is present. |
| 13 | The recovery view makes the task and event relationship visible enough to diagnose failures quickly | UNCERTAIN | Static code shows online task rows and recent events together; final operational clarity needs human UAT. |

**Score:** 11/13 truths verified

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
| `apps/mobile-controller/src/App.tsx` | Mobile candidate rendering | PARTIAL | Candidate cards render, but online panel is ordered before local results. |
| `apps/admin/src/rooms/RoomStatusView.tsx` | Recovery UI | VERIFIED | Room, queue, TV/controllers, recent events, task summaries, and row-scoped actions are present. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `server.ts` | `song-search.ts` | `registerSongSearchRoutes(... online: onlineRuntime.tasks)` | WIRED | Lines 201-206 pass runtime tasks into real search routes. |
| `server.ts` | `control-commands.ts` | `registerControlCommandRoutes(... online: onlineRuntime.tasks)` | WIRED | Lines 207-213 pass runtime tasks into request-supplement command routes. |
| `server.ts` | `admin-rooms.ts` | `registerAdminRoomsRoutes(... online: onlineRuntime.tasks)` | WIRED | Lines 160-172 pass the same runtime task service into admin status/actions. |
| `runtime.ts` | `candidate-cache-worker.ts` | `tasks.attachSelectedTaskProcessor(worker)` | WIRED | Selected/retry transitions invoke `worker.processTask`. |
| `candidate-cache-worker.ts` | `provider-registry.ts` | `getCacheCapableProvider`, `prepareFetch`, `verify` | WIRED | Worker only processes cache-capable enabled providers. |
| `use-room-controller.ts` | `api/client.ts` | `searchSongs` and `requestSupplement` | WIRED | Runtime hook fetches search and submits explicit supplement requests. |
| `admin-rooms.ts` | `CandidateTaskService` | retry, clean, promote | WIRED | Room-scoped task actions call service methods. |
| `player.ts` | `session-command-service.ts` | failed telemetry to `handlePlayerFailed` | WIRED | Server-owned failure recovery path is used. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `song-search.ts` | `onlineCandidates` | `onlineRuntime.tasks.discoverCandidates` -> registry -> provider -> repository | Yes | FLOWING |
| `control-commands.ts` | `task` | `onlineRuntime.tasks.requestSupplement` -> repository transition -> selected processor | Yes | FLOWING |
| `candidate-task-service.ts` | selected/retried task | `requestSupplement` / `retryTask` -> `processSelectedTask` | Yes | FLOWING |
| `candidate-cache-worker.ts` | ready task | provider `prepareFetch` / `verify` -> `markFetched` / `markReady` | Yes | FLOWING |
| `mobile App.tsx` | `songSearch.local` and `songSearch.online.candidates` | controller fetch from search route | Yes, wrong render order | PARTIAL |
| `RoomStatusView.tsx` | `roomStatus.onlineTasks` and `recentEvents` | admin client -> admin rooms route -> snapshot builder | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|---|---|---|---|
| Previous runtime gaps | `pnpm -F @home-ktv/api test -- online-runtime-wiring` | 27 files / 134 tests passed in 1.53s; includes search, request-supplement, selected ready, retry ready, and no queue/current target mutation. | PASS |
| Workspace verification from orchestrator | `pnpm test` | Passed: 8 workspace test tasks; API 27 files / 134 tests, Admin 4 files / 17 tests, Mobile 1 file / 22 tests, TV 11 files / 28 tests. | PASS |
| Workspace typecheck from orchestrator | `pnpm typecheck` | Passed: 12 successful workspace tasks. | PASS |
| 05-04 artifact verifier | `gsd-tools verify artifacts 05-04-PLAN.md` | 6/6 artifacts passed. | PASS |
| Mobile local-first render order | Static order check on `App.tsx` | `{"onlineBeforeLocal":true,"online":4659,"local":6532}` | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| ONLN-01 | 05-01, 05-04 | 本地歌库无法满足时，用户可以主动请求在线补歌候选 | SATISFIED | Real server search can return controlled candidates when `demo-local` is enabled; phone can submit explicit request. |
| ONLN-02 | 05-01, 05-02, 05-04 | 在线候选提交到先缓存后播放流程，而不是直接在线播放 | SATISFIED | Request-supplement persists task; worker caches/verifies; demo provider exposes no playback URL. |
| ONLN-03 | 05-02, 05-04 | 只有受控且 ready 的资源才可以进入正式点歌队列 | SATISFIED | Queue gate rejects non-ready/unverified/ephemeral assets; worker-ready tasks do not auto-enqueue. |
| ONLN-04 | 05-03 | 管理员查看任务状态、重试失败、清理失败、资源转正 | SATISFIED | Admin status/actions and task rows are implemented and tested. |
| PLAY-05 | 05-02 | 播放失败自动切备用或跳下一首并提示原因 | SATISFIED | Phase implementation uses safe skip-first recovery and returns/broadcasts reason/result. |
| ADMN-02 | 05-03 | 后台查看房间状态、队列、TV、控制端数量、最近事件 | SATISFIED | Admin status payload and UI include room, queue, TV presence, controllers, and recent events. |

All six supplied Phase 5 requirement IDs are claimed in plan frontmatter and accounted for against `.planning/REQUIREMENTS.md`. No additional Phase 5 IDs were found beyond ONLN-01, ONLN-02, ONLN-03, ONLN-04, PLAY-05, and ADMN-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `apps/mobile-controller/src/App.tsx` | 113 | Online supplement panel rendered before local results | Blocker | Violates local-first presentation: online candidates appear above local search results. |
| `apps/mobile-controller/src/test/controller.test.tsx` | 447 | Mobile online test covers empty-local only and no mixed-order assertion | Warning | Allows local/online ordering regression to pass automated tests. |

Other `return null` / empty-array matches are normal guard paths, runtime defaults, or no-result returns, not stubs. No direct online playback URL path was found in online provider/runtime code.

### Human Verification Required

### 1. Mobile Online Supplement UAT

**Test:** With `ONLINE_PROVIDER_IDS=demo-local` and a controlled ready asset configured, search for a missing song and submit a candidate.  
**Expected:** Candidate cards appear without displacing local results above them; request creates/updates a task and does not create queue/current playback state.  
**Why human:** Browser/device ordering, text clarity, and ergonomics need visual confirmation after the UI-order fix.

### 2. Admin Recovery Console UAT

**Test:** Open Rooms with seeded ready/failed/stale online tasks and recent playback failures; run retry, clean, and promote from task rows.  
**Expected:** Operators can diagnose task/event cause quickly, actions refresh state, and no top-level promote shortcut appears.  
**Why human:** Operational legibility cannot be fully verified by grep and unit tests.

### 3. Provider/Compliance UAT

**Test:** Confirm configured providers obey kill-switch, cache-before-play, and compliance boundaries.  
**Expected:** Disabled providers stay invisible/unfetchable; enabled providers only produce controlled cached resources.  
**Why human:** External provider policy and compliance are outside static code verification.

### Gaps Summary

The three previous runtime wiring gaps are closed. `createServer()` now wires online runtime tasks into real search, request-supplement, and admin routes; selected and retried tasks trigger the cache worker; runtime tests prove candidates can be discovered, tasks can reach `ready`, and no queue/current playback target is created automatically.

The phase is still not goal-complete because the mobile search UI violates local-first presentation by rendering online candidates before local results. The remaining fix is narrow: reorder the search panel so local results render first, then online supplement candidates, and add a mixed local+online ordering test.

---

_Verified: 2026-05-07T12:13:24Z_  
_Verifier: Claude (gsd-verifier)_
