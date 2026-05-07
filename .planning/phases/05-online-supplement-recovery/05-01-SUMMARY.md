---
phase: 05-online-supplement-recovery
plan: 01
subsystem: api
tags: [online-supplement, candidate-tasks, provider-registry, mobile-controller, search]

# Dependency graph
requires:
  - phase: 04-search-song-selection
    provides: local-first search response shape and search route entry point
provides:
  - shared online supplement candidate/task contracts
  - candidate_tasks persistence and lifecycle transitions
  - provider registry plus discovery and supplement request wiring
  - mobile search rendering for online candidates and explicit supplement requests
affects: [phase-05-online-supplement-recovery, mobile-controller, api search, control commands]

# Tech tracking
tech-stack:
  added: []
  patterns: [room/provider-scoped online supplement tasks, local-first search with online candidates below local results, explicit supplement requests that do not enqueue playback]

key-files:
  created: [apps/api/src/db/migrations/0006_online_candidates.sql, apps/api/src/modules/online/candidate-task-service.ts, apps/api/src/modules/online/provider-registry.ts, apps/api/src/modules/online/repositories/candidate-task-repository.ts, apps/api/src/test/online-candidate-task.test.ts, apps/api/src/test/online-candidate-discovery.test.ts]
  modified: [packages/domain/src/index.ts, apps/api/src/db/schema.ts, apps/api/src/routes/song-search.ts, apps/api/src/routes/control-commands.ts, apps/api/src/test/song-search-routes.test.ts, apps/mobile-controller/src/api/client.ts, apps/mobile-controller/src/runtime/use-room-controller.ts, apps/mobile-controller/src/App.tsx, apps/mobile-controller/src/test/controller.test.tsx]

key-decisions:
  - "Made online supplement candidates first-class shared domain contracts with explicit task states."
  - "Kept supplement selection in a dedicated candidate-task service instead of routing it through queue-entry commands."
  - "Rendered mobile online candidates beneath local results and kept request-supplement separate from add-to-queue."

patterns-established:
  - "Pattern 1: candidate task records are room/provider/candidate scoped and track discovered through purged transitions."
  - "Pattern 2: search responses can carry local results plus online supplement candidates and a request entry."
  - "Pattern 3: explicit supplement requests mutate task state but do not auto-enqueue playback."

requirements-completed: [ONLN-01, ONLN-02]

# Metrics
duration: 18min
completed: 2026-05-07
---

# Phase 05: Online Supplement & Recovery Summary

**Local-first song search now surfaces online supplement candidates, persists candidate tasks, and lets mobile users request supplementation explicitly without auto-queueing playback.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-07T10:23:33Z
- **Completed:** 2026-05-07T10:41:11Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Added shared online supplement contracts and the full candidate task lifecycle to `@home-ktv/domain`.
- Introduced `candidate_tasks` persistence plus typed repository/service boundaries for discovery and supplement selection.
- Wired API search and control routes to return online candidates and persist supplement requests without enqueuing playback.
- Updated the mobile controller to render online candidates beneath local results and send explicit supplement requests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add online candidate contracts and persistence** - `f303590` / `fe1eb17` (test → feat)
2. **Task 2: Discover online candidates and persist supplement requests** - `94284e9` / `dc716a5` (test → feat)
3. **Task 3: Wire mobile search for online candidates and supplement requests** - `979bb64` (feat)

## Files Created/Modified

- `packages/domain/src/index.ts` - shared online candidate/task contracts and search response shape
- `apps/api/src/db/migrations/0006_online_candidates.sql` - `candidate_tasks` table and indexes
- `apps/api/src/db/schema.ts` - schema mirror for the online task table
- `apps/api/src/modules/online/repositories/candidate-task-repository.ts` - typed persistence boundary
- `apps/api/src/modules/online/provider-registry.ts` - provider enablement and kill-switch filter
- `apps/api/src/modules/online/candidate-task-service.ts` - discovery and supplement request orchestration
- `apps/api/src/routes/song-search.ts` - local-first search with online candidate payloads
- `apps/api/src/routes/control-commands.ts` - explicit supplement request command path
- `apps/mobile-controller/src/api/client.ts` - supplement request API helper
- `apps/mobile-controller/src/runtime/use-room-controller.ts` - supplement request runtime action
- `apps/mobile-controller/src/App.tsx` - online candidate and request-entry rendering
- `apps/api/src/test/*` and `apps/mobile-controller/src/test/controller.test.tsx` - coverage for lifecycle, search ordering, and explicit supplement requests

## Decisions Made

- Used a dedicated online candidate task lifecycle rather than folding supplement flow into queue entries.
- Kept playback enqueueing separate from supplement requests so ready resources remain explicitly chosen.
- Treated online candidate cards as supplemental search results that stay visually below local matches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt the shared domain package after adding new exports**
- **Found during:** Task 1
- **Issue:** The API test runner was still resolving `@home-ktv/domain` from stale generated output.
- **Fix:** Rebuilt `packages/domain` so the new online candidate exports were visible to the API test run.
- **Files modified:** build outputs only
- **Verification:** `pnpm -F @home-ktv/api test -- online-candidate-task` passed after the rebuild
- **Committed in:** not committed; build artifact only

**2. [Rule 3 - Blocking] Made the mobile search UI tolerant of older online response fixtures**
- **Found during:** Task 3
- **Issue:** Existing controller tests still returned the legacy online placeholder shape in a few fixtures.
- **Fix:** Guarded the UI against a missing `requestSupplement` entry while the tests were updated.
- **Files modified:** `apps/mobile-controller/src/App.tsx`
- **Verification:** `pnpm -F @home-ktv/mobile-controller test -- controller` passed
- **Committed in:** `979bb64`

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** No scope creep. The fixes were required to complete the new contracts and keep the existing test harness green.

## Issues Encountered

- The shared domain package had to be rebuilt once after adding new exports so Vitest could resolve the updated runtime bundle.
- The mobile controller test fixtures still carried the old placeholder response shape, so the UI was made backward-compatible during the transition.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 now has a concrete supplement discovery/data model and a mobile entry path.
- The next plan can focus on cache lifecycle, ready gating, and recovery operations on top of the new candidate task flow.

---
*Phase: 05-online-supplement-recovery*
*Completed: 2026-05-07*

## Self-Check: PASSED
