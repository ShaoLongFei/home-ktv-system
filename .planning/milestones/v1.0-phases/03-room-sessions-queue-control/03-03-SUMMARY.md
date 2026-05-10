---
phase: 03-room-sessions-queue-control
plan: 03
subsystem: api
tags: [postgres, typescript, vitest, session-engine, queues]

# Dependency graph
requires:
  - phase: 03-01
    provides: persistent pairing-token and control-session foundation
  - phase: 03-02
    provides: control-session restore and admin token refresh infrastructure
provides:
  - removed queue state with undo metadata and explicit undo window support
  - shared controller command names and room control snapshot event names
  - pure session-engine helpers for effective queue filtering and promotion
  - queue, playback-session, and control-command repository methods for authoritative room state changes
affects: [03-04, controller routes, admin room state, room snapshot fanout]

# Tech tracking
tech-stack:
  added: [none]
  patterns: [explicit removed queue lifecycle, dual-key protocol lookup map, repository-driven session mutations]

key-files:
  created:
    - apps/api/src/db/migrations/0004_queue_commands.sql
    - apps/api/src/modules/playback/repositories/room-session-command-repository.ts
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/package.json
    - packages/domain/src/index.ts
    - packages/protocol/src/index.ts
    - packages/session-engine/src/index.ts
    - apps/api/src/modules/playback/repositories/queue-entry-repository.ts
    - apps/api/src/modules/playback/repositories/playback-session-repository.ts
    - apps/api/src/server.ts
    - apps/api/src/test/session-engine.test.ts

key-decisions:
  - "Queue removal is modeled explicitly as status=removed with removed_at, removed_by_control_session_id, and undo_expires_at."
  - "Protocol names are exposed both as named groups and as raw string lookups so tests and future command code can reference them directly."
  - "Session-engine helpers stay pure and only reorder/filter queue arrays; repository methods own persistence."
  - "Undo removal is only allowed while the undo window is still open."

patterns-established:
  - "Use repository methods for queue state changes instead of route-level SQL."
  - "Treat `playing`, `preparing`, `loading`, and `queued` as effective queue states; treat `removed` as undoable only within the configured window."
  - "Keep protocol message strings as a shared source of truth for command and room event names."

requirements-completed: [QUEU-01, QUEU-03, QUEU-04, QUEU-05, QUEU-06, PLAY-04]

# Metrics
duration: 1h 5m
completed: 2026-05-03
---

# Phase 3-03: Session Engine and Queue Repository Summary

**Queue removal now has explicit undo metadata, and the session-engine/repository layer can drive authoritative room mutations.**

## Performance

- **Duration:** 1h 5m
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Added `removed` queue status plus undo metadata in domain types, schema SQL, and migration SQL.
- Expanded `@home-ktv/protocol` with controller command names and `room.control.snapshot.updated`, including raw-string lookup support.
- Implemented pure session-engine queue helpers, queue repository methods, playback-session mutation methods, and a room-session-command repository.
- Added in-memory queue repository support for tests and updated test fixtures to match the stricter queue contract.

## Task Commits

Each task was verified in the workspace, but no git commits were created in this session.

## Files Created/Modified
- `packages/domain/src/index.ts` - added `removed` queue state and removal metadata fields.
- `packages/protocol/src/index.ts` - added controller command names, control snapshot event name, and raw lookup keys.
- `packages/session-engine/src/index.ts` - added command/result types and pure queue helpers.
- `apps/api/src/db/schema.ts` - updated queue schema and indexes for removed/undo state.
- `apps/api/src/db/migrations/0004_queue_commands.sql` - migration for removed queue metadata.
- `apps/api/src/modules/playback/repositories/queue-entry-repository.ts` - queue query/mutation API plus in-memory implementation.
- `apps/api/src/modules/playback/repositories/playback-session-repository.ts` - session start/idle/switch mutation API.
- `apps/api/src/modules/playback/repositories/room-session-command-repository.ts` - command audit/idempotency repository.
- `apps/api/src/server.ts` - wired in-memory queue repository and session methods for runtime tests.
- `apps/api/src/test/session-engine.test.ts` - red/green contract coverage for removed queue behavior.

## Decisions Made
- Kept removal as a first-class queue state instead of overloading `skipped` or `played`.
- Preserved undoability with an explicit expiry window so the UI and repository can agree on what is still recoverable.
- Kept the session engine pure and left persistence work to repositories.

## Deviations from Plan

None - the implementation followed the intended phase shape, with one workspace reinstall to sync the new package dependency.

## Issues Encountered
- `@home-ktv/api` initially could not resolve `@home-ktv/session-engine`; adding the workspace dependency and reinstalling fixed resolution.
- `promoteAfterCurrent` needed an explicit array guard to satisfy TypeScript strictness.
- The initial undo-window test data was inconsistent with the desired contract and was corrected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `03-04` can now consume typed queue mutations, session version checks, and command persistence without route-level SQL.
- The remaining work is realtime fanout, mobile controller surface, and admin room state presentation.

---
*Phase: 03-room-sessions-queue-control*
*Completed: 2026-05-03*
