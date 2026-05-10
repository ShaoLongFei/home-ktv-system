---
phase: 04-search-song-selection
plan: 03
subsystem: mobile-controller
tags: [search, queue, react, fastify, tdd, mobile]

requires:
  - phase: 04-search-song-selection
    provides: room-scoped song search API and SongSearchResponse contracts
provides:
  - AssetId-aware add-queue-entry validation that rejects stale or non-queueable selected versions
  - Mobile searchSongs client helper and selected-asset addQueueEntry payloads
  - Debounced and immediate mobile song search controller state
  - Version-aware Chinese mobile search UI with duplicate confirmation and disabled online boundary
affects: [04-search-song-selection, mobile-controller, queue-selection, online-supplement]

tech-stack:
  added: ["@home-ktv/domain dependency for mobile-controller"]
  patterns:
    - Mobile controller consumes shared SongSearchResponse contracts directly from @home-ktv/domain
    - Selected assetId is always server-validated before queue append
    - Online supplement remains a disabled UI/API placeholder until Phase 5

key-files:
  created:
    - .planning/phases/04-search-song-selection/04-03-SUMMARY.md
  modified:
    - apps/api/src/routes/control-commands.ts
    - apps/api/src/modules/playback/session-command-service.ts
    - apps/api/src/test/room-queue-commands.test.ts
    - apps/mobile-controller/package.json
    - pnpm-lock.yaml
    - apps/mobile-controller/src/api/client.ts
    - apps/mobile-controller/src/runtime/use-room-controller.ts
    - apps/mobile-controller/src/App.tsx
    - apps/mobile-controller/src/App.css
    - apps/mobile-controller/src/test/controller.test.tsx

key-decisions:
  - "Queue commands accept an optional assetId but still fall back to song.defaultAssetId for compatibility."
  - "Selected assets are validated by song ownership, ready status, non-online-ephemeral source, verified switch quality, and ready verified counterpart availability."
  - "Mobile search state uses 250ms debounce plus explicit submit while guarding against stale search responses."
  - "The mobile UI expands multi-version local results inline and keeps online补歌 disabled in Phase 4."

patterns-established:
  - "Version selection is assetId-first in the mobile UI, but vocal mode remains a playback-time switch-family control."
  - "Queued search results require confirmation before duplicate add, while still allowing repeat KTV requests."

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-04, QUEU-02]

duration: 12min
completed: 2026-05-07
---

# Phase 04 Plan 03: Version-Aware Mobile Song Selection Summary

**Mobile Chinese search flow with debounced local results, inline version selection, duplicate confirmation, and assetId-validated queue commands.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-07T06:53:05Z
- **Completed:** 2026-05-07T07:05:24Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Extended `add-queue-entry` to accept a selected `assetId`, validate it against formal ready playback rules, and append the selected asset.
- Added mobile `searchSongs` client/runtime state with empty-query load, 250ms debounce, immediate submit, stale-response protection, and duplicate confirmation state.
- Replaced the mobile ready-song list with a search panel that renders local results, one-version direct add, multi-version inline rows, queued status, local empty state, and disabled online placeholder copy.

## Task Commits

1. **Task 1 RED: asset selection queue tests** - `d6531df` (test)
2. **Task 1 GREEN: selected queue asset validation** - `b35775e` (feat)
3. **Task 2 RED: mobile search runtime tests** - `7c570cb` (test)
4. **Task 2 GREEN: mobile search controller state** - `dba1fe8` (feat)
5. **Task 3 RED: version-aware search UI tests** - `62e60c2` (test)
6. **Task 3 GREEN: version-aware mobile search UI** - `35ce23e` (feat)
7. **Task 3 REFACTOR: remove legacy ready-song runtime surface** - `66eeb9d` (refactor)

**Plan metadata:** final docs commit

## Files Created/Modified

- `apps/api/src/routes/control-commands.ts` - Passes optional `assetId` through add-queue-entry command payloads.
- `apps/api/src/modules/playback/session-command-service.ts` - Validates selected assets and appends `selectedAsset.id`.
- `apps/api/src/test/room-queue-commands.test.ts` - Covers selected asset acceptance, default fallback, and invalid selected asset rejection.
- `apps/mobile-controller/package.json` - Adds `@home-ktv/domain`.
- `pnpm-lock.yaml` - Records mobile domain workspace dependency.
- `apps/mobile-controller/src/api/client.ts` - Adds `searchSongs` and assetId-aware `addQueueEntry`.
- `apps/mobile-controller/src/runtime/use-room-controller.ts` - Adds search state, debounce/submit flow, selected-version enqueue, and duplicate confirmation state.
- `apps/mobile-controller/src/App.tsx` - Adds search form, result rows, version rows, online placeholder, and duplicate modal.
- `apps/mobile-controller/src/App.css` - Adds mobile-stable search/result/version/placeholder styles.
- `apps/mobile-controller/src/test/controller.test.tsx` - Covers runtime search behavior and DOM selection flow.

## Decisions Made

- Optional `assetId` preserves old single-version compatibility while letting the mobile UI queue a concrete version.
- `sourceType === "online_ephemeral"` is rejected server-side so Phase 4 cannot queue online placeholders.
- Duplicate queued songs use a lightweight confirmation modal instead of blocking repeat KTV requests.
- The online block remains display-only with the Phase 4 message `本地未入库，补歌功能后续可用`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Materialized the new mobile workspace dependency**
- **Found during:** Task 2 GREEN
- **Issue:** After adding `@home-ktv/domain`, mobile typecheck could not resolve the package until the workspace symlink existed.
- **Fix:** Ran `pnpm install` after `pnpm install --lockfile-only` to update local workspace links.
- **Files modified:** `apps/mobile-controller/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm -F @home-ktv/mobile-controller typecheck`
- **Committed in:** `dba1fe8`

**2. [Rule 3 - Blocking] Removed leftover Phase 3 ready-song runtime compatibility**
- **Found during:** Task 3 REFACTOR
- **Issue:** Task 2 temporarily kept a derived `availableSongs` surface so the pre-Task3 App could compile, but it was no longer needed after the search UI replacement.
- **Fix:** Removed `fetchAvailableSongs`, `availableSongs`, and `addSong` compatibility paths from mobile client/runtime.
- **Files modified:** `apps/mobile-controller/src/api/client.ts`, `apps/mobile-controller/src/runtime/use-room-controller.ts`
- **Verification:** `pnpm -F @home-ktv/mobile-controller test -- controller`, `pnpm -F @home-ktv/mobile-controller typecheck`
- **Committed in:** `66eeb9d`

---

**Total deviations:** 2 auto-fixed (Rule 3)
**Impact on plan:** Both fixes kept the implementation aligned with the planned search-only mobile flow.

## Issues Encountered

- TypeScript `exactOptionalPropertyTypes` required `searchSongs` to omit `signal` when undefined; fixed before committing Task 2 GREEN.
- Test fixtures initially used invalid domain enum values for non-ready and non-verified assets; adjusted to `caching` and `review_required`.

## Known Stubs

- `apps/mobile-controller/src/App.tsx` and `apps/mobile-controller/src/test/controller.test.tsx` intentionally render the Phase 4 disabled online placeholder text `本地未入库，补歌功能后续可用`. This is not queueable and is tracked for Phase 5 online supplement work.

## Verification

- `pnpm -F @home-ktv/api test -- room-queue-commands` - 22 files passed, 109 tests passed
- `pnpm -F @home-ktv/mobile-controller test -- controller` - 1 file passed, 21 tests passed
- `pnpm -F @home-ktv/mobile-controller build` - TypeScript and Vite production build passed
- `pnpm typecheck` - 12 tasks successful

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 local search and version-aware selection are complete. Phase 5 can build on the disabled online placeholder boundary without any queue/cache path currently exposed from the mobile UI.

## Self-Check: PASSED

- Verified all key files exist.
- Verified task commits exist: `d6531df`, `b35775e`, `7c570cb`, `dba1fe8`, `62e60c2`, `35ce23e`, `66eeb9d`.

---
*Phase: 04-search-song-selection*
*Completed: 2026-05-07*
