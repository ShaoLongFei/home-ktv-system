---
phase: 02-library-ingest-catalog-admin
plan: 05
subsystem: api
tags: [typescript, fastify, postgres, catalog-admin, song-json, validation]

requires:
  - phase: 02-03-import-review-admission-api
    provides: formal promotion path, CatalogAdmissionService, and song.json writer
provides:
  - formal catalog browse and edit admin API
  - revalidation-aware default asset and asset maintenance routes
  - strict formal pair revalidation with no duration override path
  - song.json consistency validator for formal /songs directories
affects: [02-06-formal-catalog-admin-ui, 03-room-sessions-queue-control, 04-search-song-selection]

tech-stack:
  added: []
  patterns:
    - route mutations call CatalogAdmissionService for switch-sensitive changes
    - formal song.json validation returns structured issue codes and aggregate status
    - file paths from song.json are resolved safely under the configured songs root

key-files:
  created:
    - apps/api/src/routes/admin-catalog.ts
    - apps/api/src/modules/catalog/song-json-consistency-validator.ts
    - apps/api/src/test/admin-catalog-routes.test.ts
    - apps/api/src/test/song-json-consistency-validator.test.ts
  modified:
    - apps/api/src/server.ts
    - apps/api/src/modules/catalog/repositories/song-repository.ts
    - apps/api/src/modules/catalog/repositories/asset-repository.ts
    - apps/api/src/modules/catalog/admission-service.ts
    - apps/api/src/modules/catalog/song-json.ts

key-decisions:
  - "Formal catalog maintenance routes never write switch-sensitive asset changes directly; they call revalidation."
  - "Duration delta greater than 300ms always produces review_required/non-verified state."
  - "song.json validation treats missing files, unsafe paths, malformed metadata, and default asset mismatches as failed consistency checks."

patterns-established:
  - "Admin catalog route dependencies are injected for tests and wired to Postgres repositories at runtime."
  - "Formal validation endpoints reuse repository song/assets and validate against filesystem song.json."
  - "Root validation aggregates per-song statuses as failed, review_required, or passed."

requirements-completed: [LIBR-04, LIBR-05, LIBR-06, ADMN-01]

duration: 28 min
completed: 2026-04-30
---

# Phase 02 Plan 05: Formal Catalog Maintenance API Summary

**Formal catalog admin API with strict resource revalidation and /songs song.json consistency checks**

## Performance

- **Duration:** 28 min
- **Started:** 2026-04-30T11:17:12Z
- **Completed:** 2026-04-30T14:35:41Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `/admin/catalog/songs` browse/detail, metadata edit, default asset edit, asset edit, and revalidate routes.
- Extended song and asset repositories with formal catalog list/detail/update methods.
- Extended `CatalogAdmissionService` with formal pair evaluation and revalidation after dangerous mutations.
- Added `validateSongJsonConsistency` and validation endpoints for one song and the formal songs root.

## Task Commits

1. **Task 1 RED: admin catalog route tests** - `82aa9c7`
2. **Task 1 GREEN: formal catalog admin API** - `4bec240`
3. **Task 2 RED: song.json validator and route tests** - included in working tree before implementation
4. **Task 2 GREEN: song.json consistency validation** - `c819bad`

## Files Created/Modified

- `apps/api/src/routes/admin-catalog.ts` - Formal catalog browse/edit/revalidate and song.json validation routes.
- `apps/api/src/modules/catalog/repositories/song-repository.ts` - Formal song list/detail/metadata/default/status repository methods.
- `apps/api/src/modules/catalog/repositories/asset-repository.ts` - Formal asset update and list methods.
- `apps/api/src/modules/catalog/admission-service.ts` - Formal pair evaluation and revalidation service methods.
- `apps/api/src/modules/catalog/song-json.ts` - Expanded formal song.json document shape plus JSON reader.
- `apps/api/src/modules/catalog/song-json-consistency-validator.ts` - Filesystem and DB consistency validator.
- `apps/api/src/test/admin-catalog-routes.test.ts` - Route coverage for catalog maintenance and validation endpoints.
- `apps/api/src/test/song-json-consistency-validator.test.ts` - Validator coverage for malformed state, missing files, status mismatch, and duration delta.

## Decisions Made

- Metadata-only song edits do not revalidate switch eligibility; default asset and asset mutations do.
- Validation resolves all song.json media paths under `songsRoot` and reports unsafe paths instead of following them.
- A pair with duration delta over 300ms is reported as `duration-delta-over-300ms` with no manual override field.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added route-level validation endpoint tests**

- **Found during:** Task 2 implementation.
- **Issue:** The initial RED tests covered the validator directly but not the admin route exposure required by the plan.
- **Fix:** Added `GET /admin/catalog/songs/:songId/validate` and `POST /admin/catalog/validate-songs-root` tests before implementing the endpoints.
- **Files modified:** `apps/api/src/test/admin-catalog-routes.test.ts`.
- **Verification:** `pnpm -F @home-ktv/api test -- admin-catalog-routes song-json-consistency-validator`.
- **Committed in:** `c819bad`.

---

**Total deviations:** 1 auto-fixed (missing critical route coverage).
**Impact on plan:** Strengthened planned route exposure coverage without changing product scope.

## Issues Encountered

Subagent execution stopped due account usage limits after Task 1 completed. Task 2 was completed inline in the main session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02-06 can build formal catalog maintenance UI against stable `/admin/catalog/*` browse, edit, revalidate, and validate endpoints.

---
*Phase: 02-library-ingest-catalog-admin*
*Completed: 2026-04-30*
