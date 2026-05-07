---
phase: 05-online-supplement-recovery
plan: 03
subsystem: admin-recovery
tags: [fastify, react, typescript, room-status, online-tasks, playback-events]

requires:
  - phase: 05-online-supplement-recovery
    provides: online supplement task lifecycle and recovery actions from plans 05-01 and 05-02
provides:
  - Admin room status payload with recent playback events and online task summary
  - Typed admin API helpers for room refresh, pairing refresh, retry, clean, and promote actions
  - Recovery-focused Rooms page with task-scoped repair controls
affects: [admin-rooms, room-control-snapshot, online-supplement-recovery, playback-events]

tech-stack:
  added: []
  patterns:
    - Recovery fields are additive to the room control snapshot and admin status contract
    - Online resource promotion stays task-scoped under admin room task routes
    - Admin Rooms UI uses dense operational rows for queue, tasks, and events

key-files:
  created:
    - apps/admin/src/test/api-client.test.tsx
  modified:
    - apps/api/src/modules/playback/repositories/playback-event-repository.ts
    - apps/api/src/modules/rooms/build-control-snapshot.ts
    - apps/api/src/routes/admin-rooms.ts
    - apps/api/src/test/admin-room-status.test.ts
    - apps/admin/src/rooms/types.ts
    - apps/admin/src/api/client.ts
    - apps/admin/src/rooms/RoomStatusView.tsx
    - apps/admin/src/App.css
    - apps/admin/src/test/room-status.test.tsx

key-decisions:
  - "Admin room recovery data is assembled server-side from playback events and active online tasks instead of inferred in the UI."
  - "Online task repair and promotion actions remain task-scoped row actions; the Rooms page has no prominent ready-resource promote shortcut."

patterns-established:
  - "Recent playback events are queried through an optional repository capability so older append-only test repositories remain compatible."
  - "Room realtime updates preserve or carry recovery fields so the admin status model stays complete after WebSocket messages."

requirements-completed: [ONLN-04, ADMN-02]

duration: 9min
completed: 2026-05-07
---

# Phase 05 Plan 03: Room Recovery Surface Summary

**Admin Rooms recovery console with server-side recent playback events, online task diagnostics, and task-scoped repair actions**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-07T11:05:08Z
- **Completed:** 2026-05-07T11:14:13Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Extended admin room status responses with recent playback events and online task counts/rows.
- Added typed admin helpers for room refresh, pairing refresh, failed task retry/clean, and task resource promotion.
- Rebuilt the Rooms page into a compact recovery console with room state, current song, queue, TV/controllers, recent events, and online task actions.

## Task Commits

Each task was committed atomically. TDD tasks include RED and GREEN commits:

1. **Task 1 RED:** `6d2a33a` (test) add failing admin room recovery summary test
2. **Task 1 GREEN:** `4e50d7a` (feat) expose admin room recovery snapshot
3. **Task 2 RED:** `daa7252` (test) add failing admin recovery client helper test
4. **Task 2 GREEN:** `af1f037` (feat) add admin room recovery API helpers
5. **Task 3 RED:** `d3c2453` (test) add failing room recovery console test
6. **Task 3 GREEN:** `ada064f` (feat) build room recovery console

**Plan metadata:** recorded in the final docs commit.

## Files Created/Modified

- `apps/api/src/modules/playback/repositories/playback-event-repository.ts` - Adds recent room playback event query.
- `apps/api/src/modules/rooms/build-control-snapshot.ts` - Builds recent event previews and active online task summaries.
- `apps/api/src/routes/admin-rooms.ts` - Returns recovery data and keeps task repair routes room-scoped.
- `apps/api/src/test/admin-room-status.test.ts` - Covers recent events and online task summary fields.
- `apps/admin/src/rooms/types.ts` - Extends room status, realtime snapshot, and task action contracts.
- `apps/admin/src/api/client.ts` - Adds explicit recovery helper methods.
- `apps/admin/src/rooms/RoomStatusView.tsx` - Presents the operational recovery console and task row actions.
- `apps/admin/src/App.css` - Adds dense recovery layout, task rows, chips, and responsive behavior.
- `apps/admin/src/test/room-status.test.tsx` - Covers recovery fields, task actions, and no prominent promote shortcut.
- `apps/admin/src/test/api-client.test.tsx` - Covers helper routes and methods.

## Decisions Made

- Admin recovery payloads are assembled by the backend so operators see task/event relationships from the same room truth source as playback state.
- Promotion remains available only inside task rows, keeping Rooms from becoming a top-level promote-everything control panel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guarded optional playback event query capability**
- **Found during:** Task 1 (backend recovery snapshot)
- **Issue:** Some existing test repositories had `playbackEvents.append` but no `listRecentByRoom`, causing runtime failures when snapshots were built outside admin routes.
- **Fix:** Made recent playback event lookup capability-checked and defaulted to an empty event list when unavailable.
- **Files modified:** `apps/api/src/modules/rooms/build-control-snapshot.ts`, `apps/api/src/modules/playback/repositories/playback-event-repository.ts`
- **Verification:** `pnpm -F @home-ktv/api test -- admin-room-status`; `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `4e50d7a`

**2. [Rule 3 - Blocking] Matched new admin client test to Vitest include pattern**
- **Found during:** Task 2 (client helper RED)
- **Issue:** Admin Vitest config only includes `src/test/**/*.test.tsx`, so a `.test.ts` file was not executed.
- **Fix:** Created the test as `api-client.test.tsx`.
- **Files modified:** `apps/admin/src/test/api-client.test.tsx`
- **Verification:** `pnpm -F @home-ktv/admin test -- api-client`
- **Committed in:** `daa7252`

**3. [Rule 1 - Bug] Preserved recovery fields on realtime snapshot conversion**
- **Found during:** Task 2 (admin typecheck)
- **Issue:** Realtime snapshot conversion produced a `RoomStatusResponse` without the new recovery fields.
- **Fix:** Added optional recovery fields to realtime payloads and preserved/defaulted them when applying WebSocket updates.
- **Files modified:** `apps/admin/src/rooms/types.ts`, `apps/admin/src/rooms/RoomStatusView.tsx`
- **Verification:** `pnpm -F @home-ktv/admin typecheck`
- **Committed in:** `af1f037`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking issue)
**Impact on plan:** All fixes were required for compatibility with existing callers and test infrastructure; no scope expansion beyond the recovery surface.

## Issues Encountered

None remaining. All verification commands passed after the auto-fixes above.

## Verification

- `pnpm -F @home-ktv/api test -- admin-room-status` - passed
- `pnpm -F @home-ktv/api typecheck` - passed
- `pnpm -F @home-ktv/admin test -- room-status` - passed
- `pnpm -F @home-ktv/admin typecheck` - passed

## Known Stubs

None. Stub scan only found intentional empty arrays/defaults and null state placeholders used as runtime defaults, not UI-blocking mock data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 05 plan work is complete. The online supplement recovery surface is ready for phase-level verification and UAT against realistic task/event data.

## Self-Check: PASSED

- Verified key files exist on disk.
- Verified task commits exist in git history: `6d2a33a`, `4e50d7a`, `daa7252`, `af1f037`, `d3c2453`, `ada064f`.

---
*Phase: 05-online-supplement-recovery*
*Completed: 2026-05-07*
