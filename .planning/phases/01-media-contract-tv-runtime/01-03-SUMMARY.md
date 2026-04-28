---
phase: 01-media-contract-tv-runtime
plan: 03
subsystem: tv-runtime
tags: [fastify, react, vite, vitest, tv-player, dual-video, reconnect-recovery]
requires:
  - phase: 01-media-contract-tv-runtime
    provides: Workspace/package shell from Plan 01-01 and media/session target builders from Plan 01-02
provides:
  - Backend player bootstrap, heartbeat, telemetry, room snapshot, switch transition, reconnect recovery, and conflict APIs
  - Browser TV Player runtime with backend-authored snapshots, dual-video switch controller, reconnect recovery, and QR/status screens
  - Automated coverage for switch rollback, reconnect resume, reconnect fallback, and conflict-disabled playback
affects: [phase-01, phase-03, tv-player, api, player-contracts, room-session-runtime]
tech-stack:
  added: [vitest]
  patterns:
    - Backend remains the authority for snapshots, switch targets, conflicts, and reconnect recovery
    - TV runtime uses a dual-video pool with explicit activeVideo and standbyVideo roles
    - Switch failure is productized as rollback plus telemetry rather than a silent UI toggle failure
key-files:
  created:
    - apps/api/src/modules/player/register-player.ts
    - apps/api/src/modules/player/conflict-service.ts
    - apps/api/src/modules/player/heartbeat-service.ts
    - apps/api/src/modules/player/telemetry-service.ts
    - apps/api/src/routes/player.ts
    - apps/api/src/routes/room-snapshots.ts
    - apps/tv-player/src/runtime/video-pool.ts
    - apps/tv-player/src/runtime/switch-controller.ts
    - apps/tv-player/src/runtime/recovery-controller.ts
    - apps/tv-player/src/runtime/player-client.ts
    - apps/tv-player/src/screens/IdleScreen.tsx
    - apps/tv-player/src/screens/PlayingScreen.tsx
    - apps/tv-player/src/screens/ConflictScreen.tsx
    - apps/tv-player/src/test/switch-runtime.test.tsx
    - apps/tv-player/src/test/reconnect-recovery.test.tsx
  modified:
    - apps/api/src/server.ts
    - packages/player-contracts/src/index.ts
    - packages/protocol/src/index.ts
    - apps/tv-player/src/App.tsx
    - apps/tv-player/package.json
    - pnpm-lock.yaml
key-decisions:
  - "Keep the backend as the only source of truth for switch and reconnect semantics; the TV runtime requests a switch transition instead of deriving counterpart assets locally."
  - "Represent second-player conflicts as a first-class snapshot state and disable playback instead of offering takeover."
  - "Use a browser-first dual-video runtime with `activeVideo` and `standbyVideo`, preserving the future Android TV shell boundary around the same player contracts."
patterns-established:
  - "TV runtime controllers are testable without React or browser DOM by depending on a small KtvVideoElement interface."
  - "Room snapshots carry pairing, current target, switch target, notices, and conflict state through @home-ktv/player-contracts."
  - "Productized playback notices cover loading, recovering, switch-failed rollback, and reconnect fallback-start-over states."
requirements-completed: [PLAY-01, PLAY-02, PLAY-03, PLAY-06, PLAY-07]
duration: 23min
completed: 2026-04-28
---

# Phase 01 Plan 03: TV Player Runtime Loop Summary

**Backend-authored TV playback loop with player binding, conflict-safe snapshots, rollback-safe vocal switching, reconnect recovery, and browser TV runtime screens**

## Performance

- **Duration:** 23 min after interrupted-agent resume
- **Started:** 2026-04-28T08:49:28Z
- **Completed:** 2026-04-28T09:12:10Z
- **Tasks:** 4 total: 3 automated tasks complete, 1 real-TV human verification checkpoint persisted separately
- **Files modified:** 30

## Accomplishments

- Added player bootstrap, heartbeat, telemetry, room snapshot, switch transition, reconnect recovery, and active-player conflict APIs.
- Replaced the placeholder TV app with a room-bound runtime shell that renders idle, playing, and conflict states with the agreed QR behavior.
- Added a dual-video switch controller that preloads standby video, commits only after ready playback, and reports rollback-safe `switch_failed` telemetry.
- Added reconnect recovery runtime and tests for resume-near-position and fallback-start-over behavior.

## Task Commits

Each automated task was committed atomically:

1. **Task 1: Backend player session, snapshot, heartbeat, telemetry, and conflict contract** - `a78f707` (feat)
2. **Task 2: TV runtime shell with dual-video switching, QR states, and playback messaging** - `e74ca9a` (feat)
3. **Task 3: Automated rollback and reconnect coverage** - `4b1d944` (test)

## Files Created/Modified

- `apps/api/src/modules/player/*.ts` - Player registration, conflict detection, heartbeat persistence, and telemetry ingestion services.
- `apps/api/src/routes/player.ts` - Player bootstrap, heartbeat, telemetry, switch-transition, and reconnect-recovery endpoints.
- `apps/api/src/routes/room-snapshots.ts` - Backend-authored `RoomSnapshot` construction and HTTP delivery.
- `apps/api/src/modules/playback/apply-switch-transition.ts` - Switch transition endpoint logic backed by the verified switch-target builder.
- `apps/api/src/modules/playback/apply-reconnect-recovery.ts` - Resume-near-position and fallback-start-over recovery logic.
- `packages/player-contracts/src/index.ts` - Pairing, conflict, notice, room snapshot, switch transition, and reconnect recovery contracts.
- `apps/tv-player/src/runtime/*.ts` - Player client, snapshot hook, dual-video pool, switch controller, and recovery controller.
- `apps/tv-player/src/screens/*.tsx` - Idle, playing, and conflict screens with large idle QR and small corner playing QR.
- `apps/tv-player/src/components/PlaybackStatusBanner.tsx` - Productized loading, recovering, switch-failed rollback, and resumed-from-start messages.
- `apps/tv-player/src/test/*.test.tsx` - Runtime tests for switch success, switch rollback, conflict-disabled playback, reconnect resume, and reconnect fallback.

## Verification

- `pnpm --filter @home-ktv/api test -- player-runtime-contract` - passed; 3 files, 9 tests.
- `pnpm --filter @home-ktv/api build` - passed.
- `pnpm --filter @home-ktv/tv-player build` - passed; Vite produced production bundle.
- `pnpm --filter @home-ktv/tv-player test -- switch-runtime reconnect-recovery` - passed; 2 files, 5 tests.
- `pnpm typecheck` - passed; Turborepo ran 9 successful tasks.
- Real TV verification - not executed in this agent environment; persisted as UAT follow-up.

## Decisions Made

- Kept TV switching as a backend-authorized transition request. The TV does not infer asset pairing locally, which preserves the formal library admission rule for verified original/accompaniment pairs.
- Chose polling HTTP snapshots for Phase 1 instead of adding WebSocket/SSE infrastructure. This stays within the agreed single-backend/PostgreSQL/NAS/ffmpeg floor and leaves realtime fanout for later room-session phases.
- Kept conflict handling non-takeover by design: a second TV player receives an explicit conflict screen and the runtime disables playback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt shared package declarations before standalone API build**
- **Found during:** Task 1 verification
- **Issue:** `pnpm --filter @home-ktv/api build` reads workspace package declaration output, which was stale after extending `@home-ktv/player-contracts`.
- **Fix:** Rebuilt `@home-ktv/domain`, `@home-ktv/protocol`, and `@home-ktv/player-contracts`; final `pnpm typecheck` now rebuilds the dependency chain.
- **Files modified:** None; generated `dist/` output is ignored.
- **Verification:** `pnpm --filter @home-ktv/api build` passed.
- **Committed in:** Not applicable; generated output only.

**2. [Rule 2 - Missing Critical] Added TV package test runner dependency**
- **Found during:** Task 3
- **Issue:** The TV package still had a placeholder `test` script, but this plan requires automated TV runtime tests.
- **Fix:** Added `vitest` to `@home-ktv/tv-player`, updated its test script, and refreshed the lockfile.
- **Files modified:** `apps/tv-player/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter @home-ktv/tv-player test -- switch-runtime reconnect-recovery` passed.
- **Committed in:** `4b1d944`

**3. [Rule 1 - Bug] Corrected TV runtime type boundaries**
- **Found during:** Task 2 build verification
- **Issue:** The first TV runtime pass imported `@home-ktv/domain` directly and did not narrow reconnect status before returning a non-null target.
- **Fix:** Derived vocal mode from `RoomSnapshot` contracts, narrowed recovery result status, and widened the video adapter's `hidden` type to match DOM typings.
- **Files modified:** `apps/tv-player/src/runtime/player-client.ts`, `apps/tv-player/src/runtime/switch-controller.ts`, `apps/tv-player/src/runtime/recovery-controller.ts`, `apps/tv-player/src/runtime/video-pool.ts`
- **Verification:** `pnpm --filter @home-ktv/tv-player build` passed.
- **Committed in:** `e74ca9a`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** All fixes were required to make the planned runtime and verification commands reliable. No additional infrastructure was added.

## Issues Encountered

- Execution resumed from an interrupted partial backend implementation. The partial work was preserved, verified, fixed where needed, and committed instead of being reverted.
- The real TV / mini PC Chrome validation cannot be performed from this agent environment. It is carried forward as explicit UAT rather than marked as passed.

## User Setup Required

See `01-03-USER-SETUP.md` for the local Phase 1 environment: `DATABASE_URL`, `MEDIA_ROOT`, `PUBLIC_BASE_URL`, one verified original/instrumental pair, and desktop Chrome/Chromium on the TV-connected mini PC.

## Next Phase Readiness

Phase 3 can build mobile room control on top of the player bootstrap, pairing QR payload, backend-authored snapshots, telemetry facts, switch transition API, and reconnect recovery API. Before marking Phase 1 fully complete, run the persisted real-TV UAT on the target mini PC / TV path.

## Self-Check: PASSED

- Key created files exist.
- Task commits found: `a78f707`, `e74ca9a`, `4b1d944`.
- Automated verification commands passed.
- Human verification remains tracked separately and is not claimed as passed.

---
*Phase: 01-media-contract-tv-runtime*
*Completed: 2026-04-28*
