---
phase: 05-online-supplement-recovery
plan: 04
subsystem: api
tags: [online-supplement, runtime-wiring, provider-registry, cache-worker, fastify]

requires:
  - phase: 05-online-supplement-recovery
    provides: online candidate discovery, task lifecycle, cache worker, and admin recovery surface from 05-01 through 05-03
provides:
  - Explicit runtime online provider config with enabled provider and kill-switch IDs
  - Deterministic local demo provider for controlled runtime and createServer tests
  - Shared online runtime assembly for provider registry, CandidateTaskService, and CandidateCacheWorker
  - createServer route injection for search, request-supplement, and admin room recovery
  - Selected/retry trigger path that advances cache-capable tasks through worker processing
affects: [online-supplement-recovery, api-server, song-search, control-commands, admin-rooms]

tech-stack:
  added: []
  patterns:
    - Runtime provider enablement is explicit through config and defaults to disabled.
    - CandidateTaskService owns selected/retry transitions and delegates cache work through a structural processor interface.
    - CandidateCacheWorker remains the only runtime path that calls provider prepareFetch and verify.

key-files:
  created:
    - apps/api/src/modules/online/demo-provider.ts
    - apps/api/src/modules/online/runtime.ts
    - apps/api/src/test/online-runtime-wiring.test.ts
  modified:
    - apps/api/src/config.ts
    - apps/api/src/server.ts
    - apps/api/src/routes/admin-rooms.ts
    - apps/api/src/modules/online/candidate-task-service.ts
    - apps/api/src/test/online-candidate-task.test.ts
    - apps/api/src/test/online-candidate-discovery.test.ts
    - apps/api/src/test/player-failure-recovery.test.ts
    - apps/api/src/test/realtime-room-sync.test.ts
    - apps/api/src/test/room-queue-commands.test.ts

key-decisions:
  - "Runtime online providers remain disabled by default and become visible only through ONLINE_PROVIDER_IDS."
  - "The built-in demo-local provider never returns direct playback URLs and only reaches ready when ONLINE_DEMO_READY_ASSET_ID is configured."
  - "Selected and retried tasks synchronously trigger the in-process cache worker for this phase, without queue entries or playback targets."

patterns-established:
  - "Online runtime assembly: createOnlineRuntime returns registry, tasks, and worker from one config/provider boundary."
  - "Selected-task processor hook: CandidateTaskService can trigger cache work without depending on a concrete worker class."
  - "Runtime wiring regression tests: createServer tests cover real search, supplement, admin task visibility, retry, and no playback mutation."

requirements-completed: [ONLN-01, ONLN-02, ONLN-03]

duration: 15min
completed: 2026-05-07
---

# Phase 05 Plan 04: Runtime Wiring Gap Closure Summary

**createServer now exposes controlled online candidates, persists supplement tasks, and advances selected/retried tasks through cache-worker verification without auto-enqueueing playback.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-07T11:46:58Z
- **Completed:** 2026-05-07T12:02:21Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Added explicit provider config: `ONLINE_PROVIDER_IDS`, `ONLINE_PROVIDER_KILL_SWITCH_IDS`, and `ONLINE_DEMO_READY_ASSET_ID`.
- Added `demo-local`, a deterministic local provider that performs no network access and never exposes direct playback URLs.
- Added `createOnlineRuntime()` and wired the same `CandidateTaskService` into real search, request-supplement, and admin room routes.
- Attached `CandidateCacheWorker` to selected/retry transitions so cache-capable tasks can move through `fetching`, `fetched`, and `ready`.
- Added createServer-level regression tests covering runtime search, supplement persistence, retry-to-ready, and no queue/current-target mutation.

## Task Commits

Each task was committed atomically. TDD tasks include RED and GREEN commits:

1. **Task 1 RED:** `edd2c94` test(05-04): add failing runtime provider wiring tests
2. **Task 1 GREEN:** `807d400` feat(05-04): add runtime online provider boundary
3. **Task 2 RED:** `95f09ed` test(05-04): add failing createServer online wiring test
4. **Task 2 GREEN:** `80e07bf` feat(05-04): wire online runtime into createServer
5. **Task 3 RED:** `a8f1da7` test(05-04): add failing cache worker trigger coverage
6. **Task 3 GREEN:** `c153484` feat(05-04): trigger cache worker for selected online tasks

**Plan metadata:** recorded in the final docs commit.

## Files Created/Modified

- `apps/api/src/config.ts` - Adds runtime online provider config and default normalization.
- `apps/api/src/modules/online/demo-provider.ts` - Adds the safe deterministic `demo-local` provider.
- `apps/api/src/modules/online/runtime.ts` - Assembles provider registry, task service, worker, repositories, and worker attachment.
- `apps/api/src/server.ts` - Injects `onlineRuntime.tasks` into search, control commands, and admin rooms.
- `apps/api/src/routes/admin-rooms.ts` - Accepts the runtime `online` dependency while preserving the existing `onlineTasks` test/route dependency shape.
- `apps/api/src/modules/online/candidate-task-service.ts` - Adds `SelectedCandidateTaskProcessor` and triggers selected/retry tasks.
- `apps/api/src/test/online-runtime-wiring.test.ts` - Adds createServer-level runtime gap regression tests.
- `apps/api/src/test/online-candidate-task.test.ts` - Adds service-level selected processor trigger coverage.
- Existing API tests - Update config helper defaults for the new online config fields.

## Decisions Made

- Runtime online providers are opt-in only; an empty config keeps the local-first default.
- The demo provider is safe for tests and controlled local dev, but it needs an explicit ready asset ID before it can verify to `ready`.
- The worker trigger is attached through a structural interface rather than importing `CandidateCacheWorker` into the task service.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing ApiConfig test helpers for new required config fields**
- **Found during:** Task 1 (provider config GREEN)
- **Issue:** API typecheck failed because existing tests constructed full `ApiConfig` objects without the new online config fields.
- **Fix:** Added disabled-by-default online config fields to affected test helpers.
- **Files modified:** `apps/api/src/test/online-candidate-discovery.test.ts`, `apps/api/src/test/player-failure-recovery.test.ts`, `apps/api/src/test/realtime-room-sync.test.ts`, `apps/api/src/test/room-queue-commands.test.ts`
- **Verification:** `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `807d400`

**2. [Rule 3 - Blocking] Preserved admin route compatibility while adding runtime online injection**
- **Found during:** Task 2 (createServer route wiring)
- **Issue:** The plan expected an `online` runtime injection for admin rooms, while existing admin route tests and dependencies used `onlineTasks`.
- **Fix:** Added `online` as an alias and resolved `dependencies.online ?? dependencies.onlineTasks`, preserving existing route tests.
- **Files modified:** `apps/api/src/routes/admin-rooms.ts`, `apps/api/src/server.ts`
- **Verification:** `pnpm -F @home-ktv/api test -- online-runtime-wiring song-search-routes online-candidate-discovery`; `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `80e07bf`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required by the existing code shape and did not add scope beyond runtime gap closure.

## Issues Encountered

- `RoomSnapshot` does not include queue rows; the no-auto-enqueue createServer test checks `admin.queue` plus `snapshot.currentTarget` instead.
- After Task 3, a demo provider without `ONLINE_DEMO_READY_ASSET_ID` correctly moves selected tasks to `review_required`; Task 2 expectations were updated to match the final worker-triggered behavior.

## Original Verification Gaps

- **Runtime search wiring:** Closed. `createServer()` now passes `online: onlineRuntime.tasks` into `registerSongSearchRoutes`, and `online-runtime-wiring.test.ts` proves `demo-local` candidates appear through real search.
- **Runtime supplement command wiring:** Closed. `createServer()` now passes `online: onlineRuntime.tasks` into `registerControlCommandRoutes`, and tests prove request-supplement persists a task instead of returning `ONLINE_CANDIDATE_NOT_FOUND`.
- **Runtime cache worker trigger:** Closed. `createOnlineRuntime()` attaches `CandidateCacheWorker`; tests prove selected demo tasks can reach `ready`, failed provider tasks can retry to `ready`, and queue/current target remain empty.

## Known Stubs

None. Stub-pattern scan only found intentional empty arrays/defaults and null initial state in tests/runtime guards, not UI-blocking mock data or placeholder flows.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/api test -- online-runtime-wiring song-search-routes online-candidate-discovery online-candidate-task admin-online-task-actions` - passed, 27 test files / 134 tests.
- `pnpm -F @home-ktv/api typecheck` - passed.
- `pnpm typecheck` - passed, 12 workspace tasks.

## Next Phase Readiness

Phase 5 runtime gaps are closed. Phase-level verification can now re-check the online supplement flow end-to-end against controlled providers, then proceed to human UAT for mobile ergonomics and admin recovery legibility.

## Self-Check: PASSED

- Found summary file at `.planning/phases/05-online-supplement-recovery/05-04-SUMMARY.md`.
- Found created files: `demo-provider.ts`, `runtime.ts`, and `online-runtime-wiring.test.ts`.
- Found key modified files: `config.ts`, `server.ts`, `admin-rooms.ts`, and `candidate-task-service.ts`.
- Found all task commits in git history: `edd2c94`, `807d400`, `95f09ed`, `80e07bf`, `a8f1da7`, `c153484`.

---
*Phase: 05-online-supplement-recovery*
*Completed: 2026-05-07*
