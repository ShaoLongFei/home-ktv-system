---
phase: 02-library-ingest-catalog-admin
plan: 02
subsystem: api
tags: [typescript, fastify, postgres, chokidar, ffprobe, ingest]

requires:
  - phase: 02-01-library-ingest-contracts
    provides: import scan, import file, and import candidate schema/domain contracts
provides:
  - incremental local library scanner with probe caching
  - grouped import candidate generation from changed import files
  - chokidar-backed watcher, scheduled, and manual scan scheduler
  - API startup and shutdown lifecycle wiring for scan infrastructure
affects: [02-03-admin-imports-api, 02-04-admin-import-workbench, 02-05-catalog-maintenance]

tech-stack:
  added: [chokidar@5.0.0]
  patterns:
    - scanner compares file identity before ffprobe
    - all scan triggers route through ImportScanner.scan
    - import candidate persistence is grouped behind upsertCandidateWithFiles

key-files:
  created:
    - apps/api/src/modules/ingest/library-paths.ts
    - apps/api/src/modules/ingest/media-probe.ts
    - apps/api/src/modules/ingest/import-scanner.ts
    - apps/api/src/modules/ingest/candidate-builder.ts
    - apps/api/src/modules/ingest/scan-scheduler.ts
    - apps/api/src/modules/ingest/repositories/import-file-repository.ts
    - apps/api/src/modules/ingest/repositories/scan-run-repository.ts
    - apps/api/src/test/import-scanner.test.ts
    - apps/api/src/test/scan-scheduler-startup.test.ts
  modified:
    - apps/api/package.json
    - pnpm-lock.yaml
    - apps/api/src/config.ts
    - apps/api/src/server.ts
    - apps/api/src/modules/ingest/repositories/import-candidate-repository.ts

key-decisions:
  - "SCAN_INTERVAL_MINUTES defaults to 360 minutes to keep scheduled scans lightweight."
  - "Watcher, scheduled, and manual triggers all enqueue the same ImportScanner.scan intent."
  - "Candidate grouping is persisted through ImportCandidateRepository.upsertCandidateWithFiles so scans produce reviewable candidates immediately."

patterns-established:
  - "Probe cache identity: root kind, relative path, size, mtime, and first-64KiB quick hash."
  - "Server runtime starts scan infrastructure only when DATABASE_URL and MEDIA_ROOT are configured."
  - "Fastify onClose cleans scheduler resources before closing the Postgres pool."

requirements-completed: [LIBR-01]

duration: 14 min
completed: 2026-04-30
---

# Phase 02 Plan 02: Local Ingest Scanner and Scheduler Summary

**Incremental local library scanning with ffprobe caching, candidate generation, and API-managed watcher/scheduled/manual scan lifecycle**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-30T09:54:13Z
- **Completed:** 2026-04-30T10:08:33Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added canonical library path resolution for `/songs`, `/imports/pending`, and `/imports/needs-review`.
- Added `ImportScanner.scan()` with supported media discovery, quick hash identity checks, ffprobe-on-change behavior, import file persistence, and candidate-builder handoff.
- Added `CandidateBuilder.buildFromImportFiles()` and extended `PgImportCandidateRepository.upsertCandidateWithFiles()` so scanner output becomes grouped review candidates.
- Added `createScanScheduler()` with chokidar watcher events, low-frequency scheduled scans, manual scan enqueue, serialized scan execution, and cleanup.
- Wired Postgres-backed API startup to construct scanner dependencies, start the scheduler when `DATABASE_URL` and `MEDIA_ROOT` are configured, and close scheduler resources before ending the pool.

## Task Commits

1. **Task 1 RED: import scanner contracts** - `977fdd2`
2. **Task 1 GREEN: incremental scanner and candidates** - `d6f7b5f`
3. **Task 2 RED: scheduler startup contracts** - `92fa294`
4. **Task 2 GREEN: scheduler lifecycle wiring** - `30061c2`
5. **Task 2 fix: server config defaults** - `e073207`

## Files Created/Modified

- `apps/api/src/modules/ingest/import-scanner.ts` - Incremental scan entry point, changed-file probe path, deletion hint handling, candidate handoff.
- `apps/api/src/modules/ingest/candidate-builder.ts` - Groups import files by inferred artist/title and persists candidate files.
- `apps/api/src/modules/ingest/scan-scheduler.ts` - Chokidar watcher, scheduled timer, manual enqueue, serialized scanner queue, cleanup.
- `apps/api/src/modules/ingest/media-probe.ts` - Safe `ffprobe` wrapper using `execFile`, timeout, max buffer, and JSON parsing.
- `apps/api/src/modules/ingest/repositories/import-file-repository.ts` - Postgres import file lookup/upsert/delete marker.
- `apps/api/src/modules/ingest/repositories/scan-run-repository.ts` - Postgres scan run start/finish tracking.
- `apps/api/src/modules/ingest/repositories/import-candidate-repository.ts` - Candidate row and candidate-file upsert path.
- `apps/api/src/server.ts` - Runtime scanner/scheduler construction and Fastify shutdown cleanup.
- `apps/api/src/config.ts` - `SCAN_INTERVAL_MINUTES` support with a 360-minute default.

## Decisions Made

- Scheduled scans default to 360 minutes because watcher events handle normal changes and scheduled scans are only a reconciliation fallback.
- The scanner uses first-64KiB SHA-1 plus size for quick hashing, avoiding full-file hashing during routine scans.
- `PgImportCandidateRepository` uses a pool client transaction when available, so candidate rows and linked candidate-file rows are persisted together.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preserved config fixture compatibility after adding scanIntervalMinutes**

- **Found during:** Task 2 verification.
- **Issue:** Adding `scanIntervalMinutes` as a required runtime value forced unrelated test fixtures to change, pushing the final file count to the plan limit.
- **Fix:** Added `ApiConfigInput` and `normalizeApiConfig()` so callers can omit `scanIntervalMinutes` while runtime config still resolves to a concrete number.
- **Files modified:** `apps/api/src/config.ts`, `apps/api/src/server.ts`.
- **Verification:** `pnpm -F @home-ktv/api test -- import-scanner scan-scheduler-startup && pnpm -F @home-ktv/api typecheck`.
- **Committed in:** `e073207`.

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** No behavioral scope expansion. Final plan diff remains at 14 files and keeps `scanIntervalMinutes` concrete inside runtime code.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02-03 can reuse `ImportScanner.scan()` and `ScanScheduler.enqueueManualScan()` for admin-triggered scans. Import review APIs now have persisted `import_files`, `import_candidates`, and candidate-file details to expose.

---
*Phase: 02-library-ingest-catalog-admin*
*Completed: 2026-04-30*
