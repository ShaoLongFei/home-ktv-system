---
phase: 04-search-song-selection
plan: 02
subsystem: api
tags: [search, catalog, fastify, postgres, queue, tdd]

requires:
  - phase: 04-search-song-selection
    provides: search contracts, normalization helpers, ranking buckets, and catalog search schema columns
provides:
  - Formal catalog search repository read model for ready queueable verified switch-family songs
  - Artist pinyin/initials maintenance and opportunistic backfill before search
  - D-12 version grouping and recommendation sorting independent of defaultAssetId
  - Room-scoped GET /rooms/:roomSlug/songs/search API with queued-song forwarding
  - Disabled online placeholder response for Phase 4 search
affects: [04-search-song-selection, mobile-controller, queue-selection, online-supplement]

tech-stack:
  added: []
  patterns:
    - Repository search read models return domain records and route layers serialize response contracts
    - Room-scoped reads derive queued state from server queue repository before catalog search
    - Phase 4 online search remains an explicit disabled placeholder in API responses

key-files:
  created:
    - apps/api/src/routes/song-search.ts
    - apps/api/src/test/catalog-search-repository.test.ts
    - apps/api/src/test/song-search-routes.test.ts
  modified:
    - apps/api/src/modules/catalog/repositories/song-repository.ts
    - apps/api/src/server.ts

key-decisions:
  - "Keep formal catalog search server-authoritative: the route forwards room queue state and the repository returns ready queueable local results only."
  - "Backfill missing artist pinyin/initials inside PgSongRepository.searchFormalSongs so existing rows become searchable without a separate data script."
  - "Preserve defaultAssetId as add-queue fallback only; search version recommendations use D-12 quality/newness/display-name ordering."
  - "Expose Phase 5 online supplement only as a disabled placeholder response in Phase 4."

patterns-established:
  - "Search repository groups verified switch families into one UI version option per family."
  - "Room-scoped search routes resolve rooms first, read effective queue entries, then serialize local results plus disabled online status."

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04, QUEU-02]

duration: 9min
completed: 2026-05-07
---

# Phase 04 Plan 02: Formal Song Search API Summary

**Room-scoped formal song search with artist pinyin backfill, queue-aware local results, D-12 version recommendations, and disabled online placeholder.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-07T06:42:01Z
- **Completed:** 2026-05-07T06:50:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `PgSongRepository.searchFormalSongs` with ranking buckets, ready/formal asset filters, verified switch-family queueability, artist search-key backfill, queue state, and grouped version options.
- Updated artist metadata writes to persist `artist_pinyin` and `artist_initials` whenever `artistName` changes.
- Added `GET /rooms/:roomSlug/songs/search` and registered it after the compatibility `available-songs` route.
- Added repository and route tests covering Chinese artist pinyin/initials, SQL safeguards, D-12 recommendation sorting, room lookup, queued song forwarding, limit parsing, and disabled online responses.

## Task Commits

1. **Task 1 RED: Formal search repository tests** - `b3b6464` (test)
2. **Task 1 GREEN: Formal search repository implementation** - `e0daec0` (feat)
3. **Task 2 RED: Room song search route tests** - `099983a` (test)
4. **Task 2 GREEN: Room song search route implementation** - `5cbbe2b` (feat)
5. **Task 2 typecheck cleanup: Route test fake return type** - `75293de` (test)

**Plan metadata:** final docs commit

## Files Created/Modified

- `apps/api/src/modules/catalog/repositories/song-repository.ts` - Added search contracts, artist key backfill/write maintenance, queueable read model SQL, and version option grouping/recommendation mapping.
- `apps/api/src/routes/song-search.ts` - Added room-scoped search endpoint returning `SongSearchResponse`.
- `apps/api/src/server.ts` - Registered the search route and updated the in-memory repository stub for the expanded song repository interface.
- `apps/api/src/test/catalog-search-repository.test.ts` - Added repository TDD coverage for search SQL, artist pinyin/initials, metadata writes, queue state, grouping, and D-12 recommendation behavior.
- `apps/api/src/test/song-search-routes.test.ts` - Added route TDD coverage for room errors, query/limit forwarding, queued song IDs, local result serialization, and disabled online placeholder.

## Decisions Made

- Search route output stays purely local in Phase 4; online is represented only as `{ status: "disabled", message: "本地未入库，补歌功能后续可用", candidates: [] }`.
- Existing rows with missing artist search keys are repaired at search time by a bounded repository backfill instead of adding a separate migration/script in this plan.
- Search UI recommendations intentionally ignore `song.defaultAssetId`; version sorting follows quality, newest asset, then display name.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated in-memory server repository stub for new search contract**
- **Found during:** Task 1 GREEN
- **Issue:** Adding `searchFormalSongs` to `AdminCatalogSongRepository` made the server's no-database in-memory repository fail API typecheck.
- **Fix:** Added a no-result `searchFormalSongs` implementation to the in-memory repository stub.
- **Files modified:** `apps/api/src/server.ts`
- **Verification:** `pnpm -F @home-ktv/api typecheck`
- **Committed in:** `e0daec0`

**2. [Rule 3 - Blocking] Fixed route test fake QueueEntryRepository typing**
- **Found during:** Overall verification after Task 2
- **Issue:** The route test fake implemented `append()` with a `void` return, which passed runtime tests but failed workspace typecheck against `QueueEntryRepository`.
- **Fix:** Returned a fixture `QueueEntry` from the fake `append()` method.
- **Files modified:** `apps/api/src/test/song-search-routes.test.ts`
- **Verification:** `pnpm typecheck`
- **Committed in:** `75293de`

---

**Total deviations:** 2 auto-fixed (2 Rule 3 blocking)
**Impact on plan:** Both fixes were required for type correctness and stayed within the planned API/search surface.

## Issues Encountered

- The first overall typecheck caught a test fake type mismatch after runtime tests and API build had passed. The fake was corrected and the full verification set was rerun successfully.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None found. Stub scan matched intentional empty arrays, fixture defaults, and null-handling in tests/runtime scaffolding only.

## Verification

- `pnpm -F @home-ktv/api test -- catalog-search-repository song-search-routes` - passed, 22 files / 102 tests
- `pnpm -F @home-ktv/api build` - passed
- `pnpm typecheck` - passed, 12 turbo tasks successful

## Next Phase Readiness

Plan 04-03 can build the mobile song-selection experience against a registered room-scoped search endpoint that already returns queue state, local version options, and an explicit disabled online placeholder.

## Self-Check: PASSED

- Verified summary and all key created/modified files exist.
- Verified task commits exist: `b3b6464`, `e0daec0`, `099983a`, `5cbbe2b`, `75293de`.

---
*Phase: 04-search-song-selection*
*Completed: 2026-05-07*
