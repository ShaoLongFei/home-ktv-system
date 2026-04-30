---
phase: 02-library-ingest-catalog-admin
plan: 06
subsystem: ui
tags: [typescript, react, tanstack-query, admin-ui, catalog-maintenance, happy-dom]

requires:
  - phase: 02-04-admin-import-workbench
    provides: imports-first admin app, shared admin API client, DOM test setup
  - phase: 02-05-formal-catalog-maintenance-api
    provides: formal catalog browse, edit, default asset, asset revalidation, and song.json validation routes
provides:
  - admin Songs tab for formal catalog maintenance
  - dense formal song/resource browse and filter UI
  - metadata, default asset, asset status, vocal mode, lyric mode, and switch family editors
  - dangerous catalog change confirmation and revalidation/validation result panels
affects: [03-room-sessions-queue-control, 04-search-song-selection, admin-maintenance]

tech-stack:
  added: []
  patterns:
    - formal catalog UI uses TanStack Query mutations against typed admin client helpers
    - dangerous resource edits are staged behind a dedicated confirmation dialog
    - DOM tests mock catalog routes through typed song and asset fixtures

key-files:
  created:
    - apps/admin/src/songs/SongDetailEditor.tsx
    - apps/admin/src/songs/AssetPairEditor.tsx
    - apps/admin/src/songs/ConfirmDangerDialog.tsx
    - apps/admin/src/songs/types.ts
  modified:
    - apps/admin/src/App.tsx
    - apps/admin/src/App.css
    - apps/admin/src/api/client.ts
    - apps/admin/src/songs/SongCatalogView.tsx
    - apps/admin/src/test/song-catalog.test.tsx

key-decisions:
  - "The admin app stays imports-first, with Songs exposed as a compact peer tab."
  - "Asset updates send only changed patch fields to reduce accidental overwrite risk."
  - "Duration delta review results are displayed without any force verified or manual override control."

patterns-established:
  - "Catalog list filters are represented in the query key and translated into `/admin/catalog/songs` query params."
  - "Song detail maintenance owns metadata/default-asset actions while AssetPairEditor owns resource-level patches."
  - "Dangerous formal catalog changes use ConfirmDangerDialog instead of reusing import reject-delete wording."

requirements-completed: [LIBR-05, ADMN-01]

duration: 14 min
completed: 2026-04-30
---

# Phase 02 Plan 06: Formal Catalog Maintenance UI Summary

**Admin Songs workspace for formal catalog browsing, metadata editing, resource maintenance, and strict revalidation review**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-30T14:47:32Z
- **Completed:** 2026-04-30T15:01:06Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added a Songs tab beside the imports-first workbench without changing the default admin entry point.
- Added formal song/resource browse with status and language filters plus asset summary fields required by ADMN-01.
- Added song metadata editing, default asset selection, asset-level maintenance, dangerous change confirmation, and revalidation/validation result display.
- Extended DOM-backed admin tests to cover browse/filter, metadata edit, default asset edit, dangerous confirmation, and no manual verified override.

## Task Commits

1. **Task 1: Add formal catalog navigation and browse view** - `1afb0b2` (feat)
2. **Task 2: Add song detail and asset pair maintenance UI** - `c7c4c3e` (feat)

## Files Created/Modified

- `apps/admin/src/songs/types.ts` - Typed formal catalog API response and mutation shapes.
- `apps/admin/src/songs/SongCatalogView.tsx` - Songs workspace with filters, selection, query caching, and mutation wiring.
- `apps/admin/src/songs/SongDetailEditor.tsx` - Metadata, default asset, revalidate, and song.json validation controls.
- `apps/admin/src/songs/AssetPairEditor.tsx` - Resource status, vocal mode, lyric mode, switch family, and danger confirmation flow.
- `apps/admin/src/songs/ConfirmDangerDialog.tsx` - Formal catalog-specific dangerous change confirmation dialog.
- `apps/admin/src/api/client.ts` - Typed admin catalog client helpers.
- `apps/admin/src/App.tsx` - Imports/Songs admin section navigation.
- `apps/admin/src/App.css` - Catalog workbench, editor, dialog, and validation panel styling.
- `apps/admin/src/test/song-catalog.test.tsx` - DOM coverage for catalog browsing and maintenance flows.

## Decisions Made

- Keep Imports as the first admin screen and add Songs as a peer tab so review and maintenance stay in one app without a landing page.
- Send only changed asset patch fields; this avoids overwriting unchanged resource state when an admin edits one maintenance field.
- Confirm switch-sensitive or readiness-sensitive resource updates before PATCH, then rely on the API revalidation response to show review_required outcomes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Asset patch initially submitted full draft state**

- **Found during:** Task 2 verification.
- **Issue:** The asset editor sent status, vocal mode, lyric mode, and switch family on every update, even when only one field changed.
- **Fix:** Added changed-field patch construction and limited confirmation to disabling ready assets, changing vocal mode, or changing switch family.
- **Files modified:** `apps/admin/src/songs/AssetPairEditor.tsx`, `apps/admin/src/test/song-catalog.test.tsx`.
- **Verification:** `pnpm -F @home-ktv/admin test -- song-catalog`, `pnpm -F @home-ktv/admin typecheck`.
- **Committed in:** `c7c4c3e`.

**2. [Rule 1 - Bug] DOM tests used ambiguous labels and incomplete fetch mocks**

- **Found during:** Task 2 verification.
- **Issue:** Tests queried the metadata language field ambiguously, asserted exact text that was split across nodes, and one test rendered without the catalog fetch mock.
- **Fix:** Scoped metadata queries to the detail region, matched rendered review text by regex/content, typed mock songs/assets, and installed the fetch mock before validation controls.
- **Files modified:** `apps/admin/src/test/song-catalog.test.tsx`.
- **Verification:** `pnpm -F @home-ktv/admin test -- song-catalog`, `pnpm -F @home-ktv/admin typecheck`.
- **Committed in:** `c7c4c3e`.

---

**Total deviations:** 2 auto-fixed (2 bugs).
**Impact on plan:** Both fixes tightened planned behavior and test reliability without expanding product scope.

## Issues Encountered

Initial Task 2 verification failed due brittle DOM assertions, narrow test fixture types, and one missing fetch mock. The implementation and tests were corrected and the planned checks now pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 2 now has scanner ingestion, candidate review, formal catalog APIs, and formal catalog maintenance UI connected end-to-end. Later search and session phases can consume a maintained formal catalog with strict switch-pair validation preserved.

---
*Phase: 02-library-ingest-catalog-admin*
*Completed: 2026-04-30*
