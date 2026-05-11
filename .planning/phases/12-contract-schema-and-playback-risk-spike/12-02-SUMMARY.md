---
phase: 12-contract-schema-and-playback-risk-spike
plan: 02
subsystem: database
tags: [postgres, real-mv, jsonb, repository-mapping, compatibility]

requires:
  - phase: 12-contract-schema-and-playback-risk-spike
    provides: Shared real-MV domain contracts from 12-01
provides:
  - Additive migration 0007 for real-MV asset and candidate-file fields
  - Schema row interfaces and enum mirror for compatibility status
  - Repository mapping and normalization for real-MV JSONB contract fields
affects: [phase-12-probe, phase-12-playback-target, phase-13-scanner, phase-14-review, phase-15-playback]

tech-stack:
  added: []
  patterns:
    - JSONB storage for normalized media facts and track roles
    - Shaped default normalization for malformed or empty JSONB values

key-files:
  created:
    - apps/api/src/db/migrations/0007_real_mv_contracts.sql
    - apps/api/src/test/real-mv-schema.test.ts
  modified:
    - apps/api/src/db/schema.ts
    - apps/api/src/modules/catalog/repositories/asset-repository.ts
    - apps/api/src/modules/catalog/repositories/song-repository.ts
    - apps/api/src/modules/ingest/repositories/import-candidate-repository.ts
    - apps/api/src/test/catalog-contracts.test.ts
    - apps/api/src/test/catalog-search-repository.test.ts

key-decisions:
  - "Migration 0007 is additive and backfills existing ready verified assets to playable."
  - "Repository mappers normalize empty or malformed JSONB to the same shaped defaults used by the migration."
  - "Import candidate files carry the same normalized real-MV facts before catalog admission."

patterns-established:
  - "Asset SELECT lists that feed mapAssetRow must include compatibility/media/track/playback columns."
  - "Candidate file mapping separates normalized mediaInfoSummary from raw probePayload."

requirements-completed: [MEDIA-01, MEDIA-02, MEDIA-03]

duration: 8min
completed: 2026-05-11
---

# Phase 12-02: Durable Schema and Repository Mapping Summary

**PostgreSQL rows and repository mappers now persist and return real-MV compatibility, media facts, provenance, track roles, and playback profile fields.**

## Performance

- **Duration:** 8 min elapsed
- **Started:** 2026-05-11T08:00:17Z
- **Completed:** 2026-05-11T08:08:24Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added migration `0007_real_mv_contracts.sql` with additive real-MV columns on `assets` and `import_candidate_files`.
- Mirrored compatibility status values and row fields in `schema.ts`, including the schemaSql asset columns and compatibility index.
- Extended asset and import candidate repositories to return normalized Phase 12 fields.
- Added focused schema and repository tests covering migration text, schema mirror, one-file real-MV asset mapping, candidate mapping, and malformed JSONB defaults.

## Task Commits

1. **Task 1: Add additive SQL migration for real-MV contract fields** - included in `feat(12-02): persist real MV schema fields`
2. **Task 2: Mirror schema fields and enum values in TypeScript rows** - included in `feat(12-02): persist real MV schema fields`
3. **Task 3: Map real-MV fields through asset and candidate repositories** - included in `feat(12-02): persist real MV schema fields`

## Files Created/Modified

- `apps/api/src/db/migrations/0007_real_mv_contracts.sql` - Adds compatibility, reasons, media summary, provenance, track roles, playback profile fields, indexes, and legacy playable backfill.
- `apps/api/src/db/schema.ts` - Mirrors new enum values, row fields, asset schemaSql columns, and compatibility index.
- `apps/api/src/modules/catalog/repositories/asset-repository.ts` - Maps and normalizes new real-MV fields for formal assets.
- `apps/api/src/modules/catalog/repositories/song-repository.ts` - Includes new asset columns when loading assets for formal song records.
- `apps/api/src/modules/ingest/repositories/import-candidate-repository.ts` - Upserts and maps candidate-file real-MV fields before admission.
- `apps/api/src/test/real-mv-schema.test.ts` - Verifies migration and schema mirror.
- `apps/api/src/test/catalog-contracts.test.ts` - Verifies repository mapping and malformed JSONB normalization.
- `apps/api/src/test/catalog-search-repository.test.ts` - Updates AssetRow fixture defaults for the additive row contract.

## Decisions Made

- Used JSONB for structured reason/media/provenance/track/playback fields, matching the review-first Phase 12 contract and avoiding premature normalized child tables.
- Kept default values shaped and explicit in SQL so older rows and partial candidate rows map predictably.
- Reused the same normalized fields on candidate files and formal assets so later scanner/review/admission code can carry facts forward without translating vocabulary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated all mapAssetRow callers to select and fixture new AssetRow fields**
- **Found during:** Task 3 (Repository mapping)
- **Issue:** `mapAssetRow` became responsible for new row fields, so `song-repository` and catalog-search fixtures also needed the additive columns for type safety and runtime mapping.
- **Fix:** Added the six real-MV asset columns to the formal song asset SELECT and updated the catalog-search AssetRow fixture defaults.
- **Files modified:** `apps/api/src/modules/catalog/repositories/song-repository.ts`, `apps/api/src/test/catalog-search-repository.test.ts`
- **Verification:** `pnpm -F @home-ktv/api typecheck`
- **Committed in:** included in `feat(12-02): persist real MV schema fields`

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** Required to keep repository consumers compiling after the additive row contract change; no product scope was added.

## Issues Encountered

- API typecheck initially read stale `@home-ktv/domain` build output and could not see 12-01 exports. Running `pnpm -F @home-ktv/domain build` refreshed the local package build before rerunning API typecheck.

## Verification

- `pnpm --filter @home-ktv/api exec vitest run src/test/real-mv-schema.test.ts src/test/catalog-contracts.test.ts`
- `pnpm -F @home-ktv/api typecheck`
- Acceptance grep checks for migration status values, JSONB defaults, backfill, schema row fields, repository SELECTs, mapping helpers, and absence of duplicate-asset or platform-specific storage fields.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-03 can now write normalized probe facts and compatibility decisions into durable candidate fields, then expose the same facts through asset gateway behavior without inventing new schema vocabulary.

---
*Phase: 12-contract-schema-and-playback-risk-spike*
*Completed: 2026-05-11*
