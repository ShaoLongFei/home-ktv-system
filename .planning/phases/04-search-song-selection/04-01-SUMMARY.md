---
phase: 04-search-song-selection
plan: 01
subsystem: api
tags: [search, catalog, postgres, pinyin, opencc, tdd]

requires:
  - phase: 02-library-ingest-catalog-admin
    provides: formal catalog admission and SQL schema patterns
provides:
  - Shared song search response contracts for local results, version options, queue state, match reasons, and disabled online placeholders
  - API search normalization helpers for NFKC, simplified/traditional conversion, separator folding, pinyin, and initials
  - Explicit search ranking buckets matching Phase 4 D-01 through D-04
  - PostgreSQL catalog search migration and schemaSql mirror with pg_trgm and queueable asset indexes
  - Formal admission writes for generated title and artist pinyin/initial search keys
affects: [04-search-song-selection, mobile-controller, catalog-search, queue-selection]

tech-stack:
  added: [pinyin-pro@3.28.1, opencc-js@1.3.0]
  patterns:
    - API-scoped text normalization helpers feed both tests and catalog write paths
    - SQL migrations remain mirrored in apps/api/src/db/schema.ts

key-files:
  created:
    - apps/api/src/modules/catalog/search-normalization.ts
    - apps/api/src/modules/catalog/search-ranking.ts
    - apps/api/src/db/migrations/0005_catalog_search.sql
    - apps/api/src/test/catalog-search-normalization.test.ts
    - apps/api/src/types/opencc-js.d.ts
  modified:
    - packages/domain/src/index.ts
    - apps/api/package.json
    - pnpm-lock.yaml
    - apps/api/src/db/schema.ts
    - apps/api/src/modules/catalog/admission-service.ts
    - apps/api/src/test/catalog-admission.test.ts
    - apps/api/src/test/catalog-contracts.test.ts

key-decisions:
  - "Use API-only pinyin-pro and opencc-js dependencies for deterministic Chinese search normalization."
  - "Keep Phase 4 search indexes in PostgreSQL with pg_trgm and btree indexes instead of introducing a separate search service."
  - "Populate formal-song pinyin search keys in the admission writer rather than relying on migration defaults."

patterns-established:
  - "Search helpers normalize inputs with NFKC, simplified conversion, lowercase, and separator removal before matching."
  - "Admission write paths compute title and artist pinyin/initial columns for each newly promoted formal song."

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04]

duration: 6min
completed: 2026-05-07
---

# Phase 04 Plan 01: Search Foundation Summary

**Chinese-first catalog search contracts, normalization helpers, ranking buckets, and PostgreSQL search columns/indexes for later room-scoped search.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-07T06:30:44Z
- **Completed:** 2026-05-07T06:36:30Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Added shared `SongSearchResponse`, local result, version option, queue state, match reason, and disabled online placeholder contracts.
- Added API search normalization and ranking helpers with tests for full-width input, separators, simplified/traditional conversion, pinyin, initials, and score ordering.
- Added `0005_catalog_search.sql` plus `schemaSql` mirror entries for `pg_trgm`, artist search columns, title/artist/pinyin/initial indexes, aliases/search hints GIN indexes, and queueable asset lookup.
- Updated formal catalog admission so newly promoted songs write generated title and artist pinyin/initial keys.

## Task Commits

1. **Task 1 RED: Search normalization tests** - `903cb95` (test)
2. **Task 1 GREEN: Search contracts and helpers** - `b645220` (feat)
3. **Task 2 RED: Admission/search schema tests** - `521743d` (test)
4. **Task 2 GREEN: Search schema and admission writes** - `ee7d22a` (feat)

**Plan metadata:** final docs commit

## Files Created/Modified

- `packages/domain/src/index.ts` - Shared search response and result contracts.
- `apps/api/package.json` - API-scoped `pinyin-pro` and `opencc-js` dependencies.
- `pnpm-lock.yaml` - Locked search normalization dependencies.
- `apps/api/src/modules/catalog/search-normalization.ts` - NFKC/OpenCC/pinyin normalization helpers.
- `apps/api/src/modules/catalog/search-ranking.ts` - Explicit search score bucket constants.
- `apps/api/src/types/opencc-js.d.ts` - Minimal local typing for the untyped OpenCC package entrypoint.
- `apps/api/src/db/migrations/0005_catalog_search.sql` - Catalog search extension, columns, and indexes.
- `apps/api/src/db/schema.ts` - `SongRow` and `schemaSql` mirror for search columns/indexes.
- `apps/api/src/modules/catalog/admission-service.ts` - Formal admission search-key generation and writes.
- `apps/api/src/test/catalog-admission.test.ts` - Admission writer and schema mirror regression tests.
- `apps/api/src/test/catalog-search-normalization.test.ts` - Search normalization/ranking behavior tests.
- `apps/api/src/test/catalog-contracts.test.ts` - Updated `SongRow` fixture for new artist search columns.

## Decisions Made

- Use `pinyin-pro` and `opencc-js` only in the API package, keeping browser/mobile bundles untouched until search UI work needs shared behavior.
- Keep online search represented only by shared disabled placeholder contracts in this plan; no route, repository, queue, cache, or provider behavior was exposed.
- Treat migration defaults as backfill safety for existing rows, while formal admission writes real generated search keys for new songs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added local typing for opencc-js**
- **Found during:** Task 1 GREEN
- **Issue:** `opencc-js` 1.3.0 does not ship TypeScript declarations for the main ESM entrypoint, causing API typecheck to fail.
- **Fix:** Added `apps/api/src/types/opencc-js.d.ts` with the `Converter` signature used by the helper.
- **Files modified:** `apps/api/src/types/opencc-js.d.ts`
- **Verification:** `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `b645220`

**2. [Rule 3 - Blocking] Updated SongRow contract fixture for new schema columns**
- **Found during:** Task 2 GREEN
- **Issue:** Adding `artist_pinyin` and `artist_initials` to `SongRow` made the existing catalog contract fixture incomplete.
- **Fix:** Added generated artist search values to the fixture.
- **Files modified:** `apps/api/src/test/catalog-contracts.test.ts`
- **Verification:** `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `ee7d22a`

---

**Total deviations:** 2 auto-fixed (2 Rule 3 blocking)
**Impact on plan:** Both fixes were required for type correctness and did not expand runtime scope beyond the planned search foundation.

## Issues Encountered

None beyond the auto-fixed typecheck blockers documented above.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None found. Stub scan only matched intentional test arrays/fixture defaults and existing null-handling logic, not UI/data-source placeholders.

## Verification

- `pnpm -F @home-ktv/api test -- catalog-search-normalization catalog-admission` - passed, 20 files / 92 tests
- `pnpm -F @home-ktv/api typecheck` - passed
- `pnpm typecheck` - passed, 12 turbo tasks successful

## Next Phase Readiness

Plan 04-02 can build the search repository/route on stable shared contracts, deterministic normalization helpers, explicit score buckets, and indexed schema columns. The route should still enforce the formal-ready and queueable-version boundaries from the existing catalog/session architecture.

## Self-Check: PASSED

- Verified summary and all key created/modified files exist.
- Verified task commits exist: `903cb95`, `b645220`, `521743d`, `ee7d22a`.

---
*Phase: 04-search-song-selection*
*Completed: 2026-05-07*
