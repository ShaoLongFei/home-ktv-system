---
phase: 02-library-ingest-catalog-admin
plan: 03
subsystem: api
tags: [typescript, fastify, postgres, catalog-admission, song-json, filesystem]

requires:
  - phase: 02-02-local-ingest-scanner
    provides: scanner, scheduler, import files, and grouped candidate persistence
provides:
  - admin import candidate list/detail/metadata/scan routes
  - hold and reject-delete import candidate actions
  - strict original/instrumental admission evaluation
  - explicit formal directory conflict and resolve-conflict flow
  - atomic formal song.json writer
affects: [02-04-admin-import-workbench, 02-05-catalog-maintenance, 03-room-sessions-queue-control]

tech-stack:
  added: []
  patterns:
    - CatalogAdmissionService owns destructive import actions and formal promotion
    - admin routes return logical rootKind plus relativePath, never absolute filesystem paths
    - approval_failed reruns repair known target directories instead of becoming ordinary conflicts

key-files:
  created:
    - apps/api/src/routes/admin-imports.ts
    - apps/api/src/modules/catalog/admission-service.ts
    - apps/api/src/modules/catalog/song-json.ts
    - apps/api/src/test/admin-imports-routes.test.ts
    - apps/api/src/test/catalog-admission.test.ts
  modified:
    - apps/api/src/server.ts
    - apps/api/src/modules/ingest/repositories/import-candidate-repository.ts
    - apps/api/src/modules/ingest/repositories/import-file-repository.ts
    - apps/api/src/modules/ingest/import-scanner.ts
    - apps/api/src/test/import-scanner.test.ts

key-decisions:
  - "Import review metadata uses PATCH /admin/import-candidates/:candidateId as the canonical update route."
  - "Approval never auto-merges an existing formal song directory; it returns FORMAL_DIRECTORY_CONFLICT until resolve-conflict is called."
  - "approval_failed candidates with a recorded targetDirectory are treated as repair reruns, not new directory conflicts."

patterns-established:
  - "ImportCandidateRepository exposes grouped candidate details through getCandidateWithFiles for route responses."
  - "CatalogAdmissionService returns typed admission statuses and route-safe error codes."
  - "song.json writes use temp-file plus rename inside the target directory."

requirements-completed: [LIBR-02, LIBR-04, LIBR-06]

duration: 17 min
completed: 2026-04-30
---

# Phase 02 Plan 03: Import Review and Admission API Summary

**Admin import review API with destructive action confirmation, strict pair admission, conflict handling, and repair-aware promotion**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-30T10:12:00Z
- **Completed:** 2026-04-30T10:29:14Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added `/admin/import-candidates` list/detail and canonical metadata PATCH routes backed by joined `ImportCandidateFileDetail` rows.
- Added `/admin/imports/scan` manual scan route that calls `enqueueManualScan(scope)`.
- Added hold and reject-delete routes; reject-delete requires `confirmDelete: true`.
- Added `CatalogAdmissionService` for hold movement, destructive delete, strict approval evaluation, formal directory conflict detection, and explicit conflict resolution.
- Added atomic formal `song.json` writing and a Postgres promotion writer for songs/assets/source_records.

## Task Commits

1. **Task 1 RED: admin import route contracts** - `3756ece`
2. **Task 1 GREEN: import review routes** - `36609f9`
3. **Task 2 RED: catalog admission contracts** - `c30dc1e`
4. **Task 2 GREEN: catalog admission actions** - `005a2a7`
5. **Repair fix: approval_failed reruns** - `b8caeb0`

## Files Created/Modified

- `apps/api/src/routes/admin-imports.ts` - Admin import list/detail/metadata/manual-scan/action routes.
- `apps/api/src/modules/catalog/admission-service.ts` - Hold, reject-delete, strict pair approval, conflict resolution, and promotion repair.
- `apps/api/src/modules/catalog/song-json.ts` - Atomic `song.json` writer.
- `apps/api/src/modules/ingest/repositories/import-candidate-repository.ts` - Candidate list/detail/metadata/status mutation methods.
- `apps/api/src/modules/ingest/repositories/import-file-repository.ts` - File location and deletion mutation methods.
- `apps/api/src/server.ts` - Registers admin import routes with runtime scanner/admission dependencies.

## Decisions Made

- Metadata updates stay on exactly `PATCH /admin/import-candidates/:candidateId`, so the admin UI has one canonical update target.
- Directory conflicts are reported before any move or `song.json` write; resolution must be explicit via `merge_existing` or `create_version`.
- `approval_failed` with matching `targetDirectory` is repairable and can rewrite `song.json` / complete promotion on rerun.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Narrowed ImportScanner repository dependency after ImportFileRepository gained admission methods**

- **Found during:** Task 2 typecheck.
- **Issue:** Adding admission-only import file mutations made scanner tests implement methods they do not use.
- **Fix:** Narrowed `ImportScannerOptions.importFiles` to only the lookup/upsert/delete methods scanner actually calls.
- **Files modified:** `apps/api/src/modules/ingest/import-scanner.ts`, `apps/api/src/test/import-scanner.test.ts`.
- **Verification:** `pnpm -F @home-ktv/api test -- admin-imports-routes catalog-admission import-scanner` and API typecheck.
- **Committed in:** `005a2a7`.

**2. [Rule 1 - Bug] approval_failed reruns were treated as ordinary formal directory conflicts**

- **Found during:** Post-implementation plan review.
- **Issue:** A failed promotion that had already moved files could not repair, because the existing target directory triggered `FORMAL_DIRECTORY_CONFLICT`.
- **Fix:** Added a regression test and allowed repair reruns when candidate status is `approval_failed` and `candidate_meta.targetDirectory` matches the computed target.
- **Files modified:** `apps/api/src/modules/catalog/admission-service.ts`, `apps/api/src/test/catalog-admission.test.ts`.
- **Verification:** `pnpm -F @home-ktv/api test -- admin-imports-routes catalog-admission && pnpm -F @home-ktv/api typecheck`.
- **Committed in:** `b8caeb0`.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug).
**Impact on plan:** Both fixes strengthen the planned contract without adding product scope; final plan diff remains at 10 files.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02-04 can build the imports-first admin workbench against stable review endpoints. Plan 02-05 can build catalog maintenance on top of the formal promotion path and `song.json` shape introduced here.

---
*Phase: 02-library-ingest-catalog-admin*
*Completed: 2026-04-30*
