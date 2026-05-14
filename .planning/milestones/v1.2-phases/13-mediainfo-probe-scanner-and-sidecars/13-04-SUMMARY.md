---
phase: 13-mediainfo-probe-scanner-and-sidecars
plan: 04
subsystem: api-ui
tags: [admin, imports, real-mv, sidecars, preview, mediainfo]

requires:
  - phase: 13-mediainfo-probe-scanner-and-sidecars
    provides: "Real MV scanner facts, sidecar metadata, candidate evidence, playback profile, and compatibility status from Plans 13-01 through 13-03"
provides:
  - "Admin import API serializes scanner-enriched real MV review fields without exposing absolute filesystem paths"
  - "Admin can safely request same-stem real MV cover previews from stored sidecar metadata"
  - "Import Workbench shows a compact real MV preview with MediaInfo facts, provenance, conflicts, and scanner warnings"
affects: [phase-13, phase-14, admin-import-review, real-mv-admission, cover-preview]

tech-stack:
  added: []
  patterns:
    - "Admin API returns root-relative real MV metadata and derives preview URLs server-side from stored sidecar evidence."
    - "Cover preview serving validates candidate ownership, scan root boundaries, path traversal, and image content types before streaming."
    - "Import Workbench renders scanner evidence as review context while keeping formal admission decisions for Phase 14."

key-files:
  created: []
  modified:
    - apps/api/src/routes/admin-imports.ts
    - apps/api/src/server.ts
    - apps/api/src/test/admin-imports-routes.test.ts
    - apps/admin/src/imports/types.ts
    - apps/admin/src/imports/CandidateEditor.tsx
    - apps/admin/src/test/import-workbench.test.tsx
    - apps/admin/src/i18n.tsx
    - apps/admin/src/App.css

key-decisions:
  - "Admin preview data stays review-oriented: it exposes scanner evidence but does not approve or admit candidates into the formal catalog."
  - "Cover previews are derived from persisted same-root sidecar metadata rather than client-supplied paths."
  - "Serialized real MV sidecar data remains root-relative so Admin responses do not leak local absolute media paths."

patterns-established:
  - "Real MV Admin API serialization prefers file probeSummary evidence, with candidateMeta fallback for compatibility with already-built candidate payloads."
  - "Safe media preview routes resolve through LibraryPaths and reject missing covers, unknown roots, traversal, and files outside the scan root."
  - "CandidateEditor uses a compact preview panel above the existing metadata form and preserves existing form/action behavior."

requirements-completed: [SCAN-02, SCAN-03, SCAN-04, SCAN-05]

duration: 45 min
completed: 2026-05-12
---

# Phase 13 Plan 04: Admin Import Serialization And Preview Summary

**Admin import review now exposes real MV scanner evidence, safe cover thumbnails, and a compact Import Workbench preview**

## Performance

- **Duration:** 45 min
- **Started:** 2026-05-12T20:25:51+08:00
- **Completed:** 2026-05-12T21:49:08+08:00
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added Admin API serialization for real MV compatibility, MediaInfo summary, provenance, track roles, playback profile, scanner warnings, sidecars, and cover preview URLs.
- Added a safe cover preview route that serves only stored same-root cover sidecars and rejects missing, invalid, traversal, or outside-root paths.
- Rendered a compact real MV candidate preview in Import Workbench with cover state, media facts, source/provenance chips, and review warning chips.
- Added Admin/API tests and TypeScript coverage for the new API payload and UI preview behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Serialize real MV file detail fields** - `2feb84e` (feat)
2. **Task 2: Add safe cover preview route** - `4271634` (feat)
3. **Task 3: Render minimal real MV preview in CandidateEditor** - `08daa29` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `apps/api/src/routes/admin-imports.ts` - Serializes scanner-enriched real MV fields and serves safe candidate cover previews.
- `apps/api/src/server.ts` - Passes library path configuration into Admin import routes for root-safe cover resolution.
- `apps/api/src/test/admin-imports-routes.test.ts` - Covers serialization, URL generation, cover serving, and path safety.
- `apps/admin/src/imports/types.ts` - Adds Admin-facing real MV, MediaInfo, playback profile, sidecar, and preview types.
- `apps/admin/src/imports/CandidateEditor.tsx` - Shows compact real MV preview evidence above the existing metadata form.
- `apps/admin/src/test/import-workbench.test.tsx` - Covers visible Chinese preview labels and warning state rendering.
- `apps/admin/src/i18n.tsx` - Adds localized labels for real MV import preview fields.
- `apps/admin/src/App.css` - Styles the compact real MV preview, cover frame, metadata facts, and warning chips.

## Decisions Made

- Admin preview does not change admission semantics; Phase 14 remains responsible for resolving conflicts and admitting catalog songs.
- Cover preview URLs are server-generated and tied to candidate/file IDs instead of exposing raw filesystem paths.
- Sidecar metadata returned to Admin is kept root-relative to avoid leaking user-local absolute paths.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/admin-imports-routes.test.ts` - passed, 31 test files / 185 tests.
- `pnpm -F @home-ktv/admin test -- src/test/import-workbench.test.tsx` - passed, 6 test files / 30 tests.
- `pnpm -F @home-ktv/api typecheck` - passed.
- `pnpm -F @home-ktv/admin typecheck` - passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 13 now exposes scanner, metadata, sidecar, cover, compatibility, and warning evidence through Admin review surfaces. Phase 14 can build the formal review/admission flow on top of these reviewable candidates.

---
*Phase: 13-mediainfo-probe-scanner-and-sidecars*
*Completed: 2026-05-12*
