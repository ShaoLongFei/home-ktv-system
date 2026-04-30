---
phase: 02-library-ingest-catalog-admin
plan: 01
subsystem: database
tags: [postgres, catalog, ingest, domain, vitest]

requires:
  - phase: 01-media-contract-tv-runtime
    provides: Media catalog, asset readiness, and verified switch target contracts
provides:
  - Song.status domain and database contract
  - Import scan, file, candidate, candidate-file, and source-record staging contracts
  - Joined ImportCandidateFileDetail repository contract for admin review flows
  - Verified switch-family partial unique guard on ready assets
affects: [scanner, import-review, catalog-admin, admission]

tech-stack:
  added: []
  patterns:
    - SQL migrations plus typed row interfaces remain the API persistence contract
    - Import staging data stays separate from formal songs/assets until admission

key-files:
  created:
    - apps/api/src/db/migrations/0002_library_ingest_admin.sql
    - apps/api/src/modules/ingest/repositories/import-candidate-repository.ts
    - apps/api/src/test/library-ingest-schema.test.ts
    - apps/api/src/test/catalog-contracts.test.ts
  modified:
    - packages/domain/src/index.ts
    - apps/api/src/db/schema.ts
    - apps/api/src/modules/catalog/repositories/song-repository.ts
    - apps/api/src/test/build-playback-target.test.ts
    - apps/api/src/test/player-runtime-contract.test.ts

key-decisions:
  - "Keep import files and candidates outside playback-visible songs/assets until admission approves them."
  - "Expose joined candidate-file details as safe root-relative metadata rather than absolute filesystem paths."

patterns-established:
  - "Import staging tables use explicit enum-like CHECK constraints mirrored by shared domain types."
  - "Repository detail mappers translate snake_case joined rows into admin-facing camelCase contracts."

requirements-completed: [LIBR-01, LIBR-04, LIBR-06]

duration: 10 min
completed: 2026-04-30
---

# Phase 02 Plan 01: Library Ingest Catalog Contracts Summary

**PostgreSQL import staging contracts with Song.status propagation and safe joined candidate-file detail mapping**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-30T09:06:32Z
- **Completed:** 2026-04-30T09:16:10Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `songs.status`, import staging tables, `source_records`, and the verified switch-family partial unique index in migration `0002`.
- Added shared domain and API schema contracts for import scans, files, candidates, candidate files, source records, and joined candidate-file details.
- Added `ImportCandidateRepository` with a joined query that returns admin-safe root-relative file metadata and probe evidence.
- Added TDD coverage for migration strings, domain exports, `Song.status` mapping/querying, and joined detail mapping.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Schema/domain contract test** - `d2a1481` (test)
2. **Task 1 GREEN: Schema/domain contracts** - `49d23cc` (feat)
3. **Task 2 RED: Catalog detail contract test** - `67fe6d2` (test)
4. **Task 2 GREEN: Import candidate detail repository** - `de392a8` (feat)

## Files Created/Modified

- `apps/api/src/db/migrations/0002_library_ingest_admin.sql` - Adds song status, import staging tables, source records, indexes, and verified switch guard.
- `packages/domain/src/index.ts` - Exports `SongStatus` and import scan/file/candidate/detail/source contracts.
- `apps/api/src/db/schema.ts` - Adds enum arrays, table names, row interfaces, and `SongRow.status`.
- `apps/api/src/modules/catalog/repositories/song-repository.ts` - Selects and maps `Song.status`.
- `apps/api/src/modules/ingest/repositories/import-candidate-repository.ts` - Maps and lists joined candidate file details.
- `apps/api/src/test/library-ingest-schema.test.ts` - Verifies migration and domain contract presence.
- `apps/api/src/test/catalog-contracts.test.ts` - Verifies song and candidate-file detail mapper contracts.
- `apps/api/src/test/build-playback-target.test.ts` - Updates test song fixture with `ready` status.
- `apps/api/src/test/player-runtime-contract.test.ts` - Updates test song fixture with `ready` status.

## Decisions Made

- Import staging tables are the trust boundary before formal catalog admission, so uncertain files do not enter playback-visible `songs/assets`.
- `ImportCandidateFileDetail` exposes root kind, relative path, safe file metadata, and probe evidence, but not unchecked absolute paths.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Propagated required Song.status during Task 1**
- **Found during:** Task 1 (Add schema and domain contracts)
- **Issue:** Making `Song.status` required caused API typecheck failures in `mapSongRow` and existing in-memory `Song` fixtures before Task 2 could run.
- **Fix:** Added `status` selection/mapping in `song-repository.ts` and added `status: "ready"` to affected API test fixtures.
- **Files modified:** `apps/api/src/modules/catalog/repositories/song-repository.ts`, `apps/api/src/test/build-playback-target.test.ts`, `apps/api/src/test/player-runtime-contract.test.ts`
- **Verification:** `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `49d23cc`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change; the fix implemented planned Task 2 status propagation earlier because Task 1 made the type contract required.

## Issues Encountered

- API typecheck reads `@home-ktv/domain` through generated `dist` declarations. Local verification required `pnpm -F @home-ktv/domain build` after changing domain source so the API package could see the new type exports.

## Known Stubs

None - no placeholder UI/data stubs were introduced. Empty object casts found by the stub scan are compile-only type assertions in schema contract tests.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm -F @home-ktv/api test -- library-ingest-schema catalog-contracts`
- `pnpm -F @home-ktv/api typecheck`

## Next Phase Readiness

Plan 02-02 can build scanner/import workflows on the explicit `import_*` staging tables and the shared admin-safe candidate-file detail mapper.

---
*Phase: 02-library-ingest-catalog-admin*
*Completed: 2026-04-30*
