---
phase: 01-media-contract-tv-runtime
plan: 02
subsystem: media-runtime
tags: [postgres, fastify, media-gateway, playback-target, switch-target, vitest]
requires:
  - phase: 01-media-contract-tv-runtime
    provides: Workspace packages and API shell from Plan 01-01
provides:
  - Canonical Postgres schema and migration for songs, assets, rooms, queue entries, device sessions, playback sessions, and playback events
  - Controlled /media/:assetId gateway that streams verified assets without exposing NAS paths
  - PlaybackTarget and SwitchTarget builders derived from persisted room/session/asset state
  - Explicit switch target tests for verified pairs and rejection cases
affects: [phase-01, phase-02, phase-03, api, tv-player, media-contracts]
tech-stack:
  added: [pg, "@types/pg", vitest]
  patterns:
    - SQL-first schema plus typed repository interfaces for Postgres-backed media/session state
    - Controlled media URLs are produced through AssetGateway, not copied from persisted file paths
    - Switch eligibility is checked by switchFamily, vocalMode, ready status, and verified switchQualityStatus
key-files:
  created:
    - apps/api/src/db/schema.ts
    - apps/api/src/db/migrations/0001_media_contract.sql
    - apps/api/src/modules/assets/asset-gateway.ts
    - apps/api/src/modules/assets/media-path-resolver.ts
    - apps/api/src/modules/playback/build-playback-target.ts
    - apps/api/src/modules/playback/build-switch-target.ts
    - apps/api/src/routes/media.ts
    - apps/api/src/test/build-playback-target.test.ts
    - apps/api/src/test/build-switch-target.test.ts
  modified:
    - apps/api/package.json
    - apps/api/src/server.ts
    - packages/domain/src/index.ts
    - packages/player-contracts/src/index.ts
    - pnpm-lock.yaml
key-decisions:
  - "Use SQL migration files and typed repository interfaces for Plan 01-02 instead of introducing an ORM layer before the first runtime access paths are proven."
  - "Expose only controlled media URLs in PlaybackTarget and SwitchTarget; raw file paths remain server-internal."
  - "Require exactly one ready and verified same-family counterpart before emitting a SwitchTarget."
  - "Keep API tests in src/test for typechecking, but exclude them from production build output."
patterns-established:
  - "Backend target builders depend on repository interfaces, which lets tests prove media-contract behavior without a live database."
  - "Media streaming uses path containment checks under MEDIA_ROOT and supports byte ranges for browser video seek/resume."
requirements-completed: [LIBR-03, PLAY-07]
duration: 15min
completed: 2026-04-28
---

# Phase 01 Plan 02: Media Contract Runtime Summary

**Canonical KTV media schema with controlled asset streaming, server-authored playback targets, and verified switch-target construction**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-28T08:32:22Z
- **Completed:** 2026-04-28T08:47:10Z
- **Tasks:** 3
- **Files modified:** 23

## Accomplishments

- Added the canonical Postgres schema/migration for `Song`, `Asset`, `Room`, `QueueEntry`, `PlaybackSession`, `DeviceSession`, and `PlaybackEvent`.
- Added `GET /media/:assetId` through `AssetGateway`, with MEDIA_ROOT containment checks, readiness checks, and byte-range streaming.
- Added playback and switch target builders that emit controlled media URLs and reject unverified or wrong-family switch candidates.
- Added Vitest coverage for playback target construction and the required switch target rejection cases.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the canonical Postgres schema for playback and switchable assets** - `a6144fd` (feat)
2. **Task 2: Build the controlled media gateway and playback target services** - `9ad766b` (feat)
3. **Task 3: Prove switch target correctness with explicit tests** - `0b25d19` (test)

## Files Created/Modified

- `apps/api/src/db/schema.ts` - Canonical table names, row types, enum values, SQL schema text, and `living-room` seed.
- `apps/api/src/db/migrations/0001_media_contract.sql` - Postgres migration for media/session tables and indexes.
- `apps/api/src/db/query-executor.ts` - Minimal query interface used by repositories.
- `apps/api/src/modules/catalog/repositories/song-repository.ts` - Song repository contract and Postgres mapper.
- `apps/api/src/modules/catalog/repositories/asset-repository.ts` - Asset repository contract, mapper, and verified switch counterpart query.
- `apps/api/src/modules/rooms/repositories/room-repository.ts` - Room repository contract and Postgres mapper.
- `apps/api/src/modules/playback/repositories/*.ts` - Queue entry, playback session, and playback event persistence access.
- `apps/api/src/modules/assets/media-path-resolver.ts` - MEDIA_ROOT path containment and file validation.
- `apps/api/src/modules/assets/asset-gateway.ts` - Controlled media URL creation and stream resolution.
- `apps/api/src/modules/playback/build-playback-target.ts` - Builds `PlaybackTarget` with current URL, resume position, vocal mode, switch family, and next preview.
- `apps/api/src/modules/playback/build-switch-target.ts` - Builds `SwitchTarget` only for one ready/verified same-family counterpart.
- `apps/api/src/routes/media.ts` - Fastify `/media/:assetId` route with streaming and range handling.
- `packages/domain/src/index.ts` - Shared domain model aligned to the persisted media/session schema.
- `packages/player-contracts/src/index.ts` - Playback and switch target contracts for TV runtime consumption.
- `apps/api/src/test/build-playback-target.test.ts` - Playback target test for `living-room` and next queue preview.
- `apps/api/src/test/build-switch-target.test.ts` - Switch target tests for verified pair, missing counterpart, wrong family, and `review_required`.
- `apps/api/tsconfig.build.json` and `apps/api/vitest.config.ts` - Build/test separation so tests typecheck but are not emitted into runtime output.

## Verification

- `pnpm --filter @home-ktv/api typecheck` - passed for Task 1 after rebuilding shared package output.
- `pnpm --filter @home-ktv/api build` - passed for Task 2 and final verification.
- `pnpm --filter @home-ktv/api test -- build-playback-target build-switch-target` - passed; 2 files and 5 tests.
- `pnpm typecheck` - passed; Turborepo ran 9 successful tasks.

## Decisions Made

- Kept persistence SQL-first for this plan. The repository interfaces leave room for Drizzle later, but the runtime contracts do not depend on ORM choice.
- Registered the media route in the API server with a Postgres-backed asset repository when `DATABASE_URL` is configured; without database config it fails closed rather than exposing filesystem paths.
- Required a builder-side verified-state check in addition to the repository SQL filter, so switch target correctness does not rely on a single layer.
- Split API build and test config so test files remain typechecked but do not ship in `dist`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected `Asset.filePath` domain nullability**
- **Found during:** Task 2 verification
- **Issue:** The new schema persists `assets.file_path` as non-null, but the shared `Asset` type still allowed `filePath: null` and carried fields not persisted by the schema.
- **Fix:** Tightened `Asset.filePath` to `string` and removed non-persisted asset fields from the shared domain type and mapper.
- **Files modified:** `packages/domain/src/index.ts`, `apps/api/src/modules/catalog/repositories/asset-repository.ts`
- **Verification:** `pnpm --filter @home-ktv/api build` passed.
- **Committed in:** `a6144fd` and `9ad766b`

**2. [Rule 2 - Missing Critical] Added queue entry repository access**
- **Found during:** Task 2 implementation
- **Issue:** Playback target construction needs current and next queue entries, but the plan's repository file list did not include queue entry access.
- **Fix:** Added `QueueEntryRepository` and a Postgres implementation so playback targets can resolve current queue state and next-song previews from persisted records.
- **Files modified:** `apps/api/src/modules/playback/repositories/queue-entry-repository.ts`
- **Verification:** Playback target test covers current asset URL plus next queue preview.
- **Committed in:** `9ad766b`

**3. [Rule 2 - Missing Critical] Added media byte-range responses**
- **Found during:** Task 2 implementation
- **Issue:** A plain full-file stream is not enough for reliable browser video seek/resume behavior.
- **Fix:** Added `Range` request parsing, `206 Partial Content`, `Content-Range`, and `Accept-Ranges` handling to `/media/:assetId`.
- **Files modified:** `apps/api/src/routes/media.ts`
- **Verification:** `pnpm --filter @home-ktv/api build` passed.
- **Committed in:** `9ad766b`

**4. [Rule 1 - Bug] Prevented built test files from running twice**
- **Found during:** Final verification
- **Issue:** API build emitted test files to `dist`, which made Vitest discover both source and compiled tests.
- **Fix:** Added `tsconfig.build.json` excluding tests from production build output and `vitest.config.ts` limiting test discovery to `src/test/**/*.test.ts`.
- **Files modified:** `apps/api/tsconfig.build.json`, `apps/api/vitest.config.ts`, `apps/api/package.json`
- **Verification:** Test command returned 2 files and 5 tests, and API build passed.
- **Committed in:** `0b25d19`

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 missing critical)
**Impact on plan:** All fixes support the plan's media-contract correctness and browser playback requirements. No product scope was added.

## Issues Encountered

- Shared package declaration output needed rebuilding after domain/player-contract changes because the API package imports workspace package declarations.
- Dependency installation produced transient low-speed registry warnings while adding Vitest; install completed successfully.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-03 can now build the TV runtime against `PlaybackTarget` and `SwitchTarget` without guessing media paths or switch eligibility. Later catalog/import phases can reuse the canonical `switch_family` and `switch_quality_status` fields as the formal resource-admission gate.

## Self-Check: PASSED

- Key created files exist.
- Task commits found: `a6144fd`, `9ad766b`, `0b25d19`.
- No missing files or commits detected.

---
*Phase: 01-media-contract-tv-runtime*
*Completed: 2026-04-28*
