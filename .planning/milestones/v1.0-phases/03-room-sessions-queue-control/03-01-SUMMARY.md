---
phase: 03-room-sessions-queue-control
plan: 01
subsystem: database
tags: [postgres, sql, typescript, vitest, contracts]

# Dependency graph
requires:
  - phase: 02-library-ingest-catalog-admin
    provides: verified song/asset catalog models and stable API/package structure
provides:
  - Phase 3 control-session persistence tables for pairing tokens, control sessions, and idempotent commands
  - Shared domain contracts for control session IDs, pairing tokens, and command statuses
  - Mobile-facing `RoomControlSnapshot` and supporting presence/queue contract types
affects: [03-room-sessions-queue-control, mobile-controller, admin room status, session-engine]

# Tech tracking
tech-stack:
  added: [none]
  patterns: [sql migration + schemaSql mirror, type-only contract assertions in shared package tests]

key-files:
  created: [apps/api/src/db/migrations/0003_room_sessions_control.sql, apps/api/src/test/control-session-schema.test.ts]
  modified: [apps/api/src/db/schema.ts, packages/domain/src/index.ts, packages/player-contracts/src/index.ts]

key-decisions:
  - "Store both pairing token plaintext and hash so the same opaque QR token can be re-displayed until expiry while verification still uses the hash."
  - "Model control commands with explicit command/result status fields so later session-engine work can enforce idempotency and conflict handling."
  - "Expose a dedicated mobile `RoomControlSnapshot` instead of bending the existing TV `RoomSnapshot` shape."

patterns-established:
  - "Mirror migration SQL in `schemaSql` and cover it with string-level contract tests."
  - "Keep shared room/session state shapes in `@home-ktv/domain` and `@home-ktv/player-contracts` rather than duplicating them in app code."

requirements-completed: [PAIR-01, PAIR-02, PAIR-03, PAIR-04]

# Metrics
duration: 11min
completed: 2026-05-01
---

# Phase 03: Room Sessions & Queue Control Summary

**Phase 3 persistence and shared contracts for QR pairing, control-session restore, and mobile room control snapshots.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-01T13:43:00Z
- **Completed:** 2026-05-01T13:53:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added Phase 3 room-control persistence for pairing tokens, control sessions, and command idempotency.
- Extended shared domain and player-contract packages with control-session IDs, command statuses, and mobile control snapshot types.
- Verified the schema and type contracts with `vitest` and full workspace `tsc` typecheck.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add room pairing, control session, and command tables** - `4f5ac8a` / `675015f` (test, feat)
2. **Task 2: Add domain and player contract types** - `81043c9` / `0f3673c` (test, feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `apps/api/src/db/migrations/0003_room_sessions_control.sql` - Phase 3 persistence tables and indexes
- `apps/api/src/db/schema.ts` - mirrored schema SQL and row interfaces
- `apps/api/src/test/control-session-schema.test.ts` - schema and shared-contract assertions
- `packages/domain/src/index.ts` - control-session and command domain types
- `packages/player-contracts/src/index.ts` - mobile control snapshot and presence contracts

## Decisions Made
- Kept pairing token plaintext in storage alongside a hash to support stable QR re-display until expiry.
- Added explicit command result statuses to support later idempotency and conflict handling in the session engine.
- Introduced a separate mobile control snapshot contract instead of extending the TV snapshot shape.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The first red test pass required treating a missing migration file as empty SQL so the failure would be a contract assertion rather than a file read error.
- `pnpm typecheck` initially failed as intended during the red phase because the new shared exports were not yet present.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Database and shared contract foundation is ready for the remaining Phase 3 plans.
- Later plans can now build control-session restore, queue command handling, and room snapshot broadcasting on top of these types.

## Self-Check: PASSED
- Found created files: `apps/api/src/db/migrations/0003_room_sessions_control.sql`, `apps/api/src/test/control-session-schema.test.ts`, `.planning/phases/03-room-sessions-queue-control/03-01-SUMMARY.md`
- Found task commits: `4f5ac8a`, `675015f`, `81043c9`, `0f3673c`

---
*Phase: 03-room-sessions-queue-control*
*Completed: 2026-05-01*
