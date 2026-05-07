---
phase: 05-online-supplement-recovery
plan: 02
subsystem: api
tags: [online-supplement, playback-recovery, fastify, postgres, tdd]

requires:
  - phase: 05-online-supplement-recovery
    provides: online candidate discovery and initial supplement task storage from 05-01
  - phase: 03-room-sessions-queue-control
    provides: server-authoritative queue/session command handling
  - phase: 04-search-song-selection
    provides: version-aware asset selection and online supplement entry points
provides:
  - DB-backed candidate lifecycle transitions from selected through ready, failed, stale, promoted, and purged
  - In-process candidate cache worker orchestration with provider kill-switch checks
  - Ready/verified online_cached queue admission while keeping online_ephemeral rejected
  - Room-scoped admin retry, clean, and promote endpoints for online tasks
  - Failed playback telemetry recovery that skips directly to the next queue item and broadcasts a notice
affects: [05-03, admin-rooms, mobile-controller, tv-player, playback-events]

tech-stack:
  added: []
  patterns:
    - explicit candidate task state transitions through CandidateTaskService
    - task-scoped admin repair actions under /admin/rooms/:roomSlug/online-tasks/:taskId
    - server-owned failed playback recovery through session-command-service

key-files:
  created:
    - apps/api/src/modules/online/candidate-cache-worker.ts
    - apps/api/src/test/admin-online-task-actions.test.ts
    - apps/api/src/test/player-failure-recovery.test.ts
  modified:
    - apps/api/src/modules/online/candidate-task-service.ts
    - apps/api/src/modules/online/provider-registry.ts
    - apps/api/src/modules/online/repositories/candidate-task-repository.ts
    - apps/api/src/modules/playback/session-command-service.ts
    - apps/api/src/modules/player/telemetry-service.ts
    - apps/api/src/modules/rooms/build-control-snapshot.ts
    - apps/api/src/routes/admin-rooms.ts
    - apps/api/src/routes/player.ts
    - apps/api/src/server.ts
    - apps/api/src/test/online-candidate-task.test.ts
    - apps/api/src/test/online-candidate-discovery.test.ts
    - apps/api/src/test/room-queue-commands.test.ts
    - packages/player-contracts/src/index.ts

key-decisions:
  - "Online task repair actions are room- and task-scoped under admin room routes, and do not enqueue playback."
  - "Failed playback is marked as failed in queue history, then recovered by skipping to the next queue item or idle."
  - "Ready online_cached assets remain supplement-sourced and queueable only when ready and switch-verified."

patterns-established:
  - "Candidate lifecycle helpers: service methods own every task state transition and recent-event metadata."
  - "Recovery notice fanout: failure recovery builds one notice and passes it through room/control snapshots."
  - "Provider cache orchestration: in-process worker calls prepareFetch and verify without introducing a queue system."

requirements-completed: [ONLN-02, ONLN-03, PLAY-05]

duration: 15 min
completed: 2026-05-07
---

# Phase 05 Plan 02: Online Lifecycle and Playback Recovery Summary

**Online candidate lifecycle, task-scoped repair actions, ready cached queue admission, and skip-first failed playback recovery**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-07T10:46:14Z
- **Completed:** 2026-05-07T11:01:21Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added explicit online candidate transitions for fetching, fetched, ready, review_required, failed, stale, retry, promote, and purge.
- Added an in-process cache worker that honors provider kill-switches before fetch/verification.
- Added admin room endpoints for retry, clean, and promote actions without queue mutation.
- Kept queue admission strict: online_ephemeral remains rejected, ready verified online_cached assets are queueable.
- Routed failed player telemetry through server-side advancement, marking the failed entry and broadcasting a recovery notice.

## Task Commits

Each task was committed atomically. TDD tasks include RED and GREEN commits:

1. **Task 1 RED:** `7dec6a3` test(05-02): add failing online lifecycle coverage
2. **Task 1 GREEN:** `988b269` feat(05-02): implement online candidate lifecycle engine
3. **Task 2 RED:** `9c0ba08` test(05-02): add failing admin online task actions coverage
4. **Task 2 GREEN:** `2143225` feat(05-02): wire room-scoped online task repair actions
5. **Task 3 RED:** `567a341` test(05-02): add failing playback failure recovery coverage
6. **Task 3 GREEN:** `03499b7` feat(05-02): skip failed playback with recovery notice

## Files Created/Modified

- `apps/api/src/modules/online/candidate-cache-worker.ts` - Runs prepareFetch/verify through lifecycle transitions.
- `apps/api/src/modules/online/candidate-task-service.ts` - Owns retry, purge, promote, ready, failure, stale, and fetch transitions.
- `apps/api/src/modules/online/repositories/candidate-task-repository.ts` - Adds task lookup required for room-scoped repair.
- `apps/api/src/modules/online/provider-registry.ts` - Defines cache provider prepareFetch/verify contracts.
- `apps/api/src/modules/playback/session-command-service.ts` - Adds failed playback recovery and failure notice creation.
- `apps/api/src/routes/admin-rooms.ts` - Adds room-scoped online task retry/clean/promote endpoints.
- `apps/api/src/routes/player.ts` - Routes failed telemetry through server-side skip recovery.
- `apps/api/src/server.ts` - Wires the online task service into admin room routes.
- `apps/api/src/test/*` - Adds TDD coverage for lifecycle, ready gate, admin actions, and failure recovery.
- `packages/player-contracts/src/index.ts` - Adds the playback failure notice kind.

## Decisions Made

- Online task repair actions stay inside task flow routes, not a prominent room-level promotion button.
- Failed playback uses queue status `failed` for the failed entry while the fallback result reports skipped_to_next or skipped_to_idle.
- Provider cache work remains in-process for this phase; no BullMQ/worker process was introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used the existing online repository path**
- **Found during:** Task 1
- **Issue:** The plan listed `apps/api/src/modules/online/candidate-task-repository.ts`, but the repository already existed under `apps/api/src/modules/online/repositories/candidate-task-repository.ts`.
- **Fix:** Extended the existing repository in place and created only the missing cache worker at the planned root module path.
- **Files modified:** `apps/api/src/modules/online/repositories/candidate-task-repository.ts`, `apps/api/src/modules/online/candidate-cache-worker.ts`
- **Verification:** `pnpm -F @home-ktv/api test -- online-candidate-task`; `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `988b269`

**2. [Rule 2 - Missing Critical] Wired online task service into runtime routes**
- **Found during:** Task 2
- **Issue:** Admin room task actions would only work in isolated route tests unless the runtime server provided an online task service dependency.
- **Fix:** Created a runtime CandidateTaskService with the existing candidate task repository and an empty provider registry, then passed it to admin room routes.
- **Files modified:** `apps/api/src/server.ts`, `apps/api/src/routes/admin-rooms.ts`
- **Verification:** `pnpm -F @home-ktv/api test -- room-queue-commands admin-online-task-actions`; `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `2143225`

---

**Total deviations:** 2 auto-fixed (Rule 2: 1, Rule 3: 1)  
**Impact on plan:** Both fixes were required to make the planned lifecycle and admin actions operate in the existing codebase. No scope was added beyond the plan.

## Issues Encountered

- TypeScript exact optional property checks required omitting optional fields rather than passing explicit `undefined`; fixed during task verification.
- `@home-ktv/api` typecheck reads package output types for `@home-ktv/player-contracts`; the contracts package was rebuilt locally after adding the new notice kind.

## Known Stubs

None. Stub-pattern scan only found normal empty array/object initializers in tests, repositories, and snapshot builders.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/api test -- online-candidate-task room-queue-commands admin-online-task-actions player-failure-recovery` - passed, 26 test files / 126 tests.
- `pnpm -F @home-ktv/api typecheck` - passed.

## Next Phase Readiness

Ready for 05-03. The server now exposes the lifecycle, repair actions, and recovery events that the admin recovery view can render.

## Self-Check: PASSED

- Found summary file at `.planning/phases/05-online-supplement-recovery/05-02-SUMMARY.md`.
- Found created files: candidate cache worker, admin online task action test, and player failure recovery test.
- Found all task commits in git history: `7dec6a3`, `988b269`, `9c0ba08`, `2143225`, `567a341`, `03499b7`.

---
*Phase: 05-online-supplement-recovery*
*Completed: 2026-05-07*
