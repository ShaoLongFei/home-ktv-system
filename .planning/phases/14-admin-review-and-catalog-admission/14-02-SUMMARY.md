---
phase: 14-admin-review-and-catalog-admission
plan: 02
subsystem: admin-ui
tags: [react, vitest, real-mv, trackroles, i18n]

requires:
  - phase: 14-admin-review-and-catalog-admission
    provides: Admin metadata PATCH accepts and validates reviewed real-MV trackRoles
provides:
  - Admin real-MV candidate editor with editable original/accompaniment track-role selectors
  - Metadata PATCH payloads carrying reviewed TrackRoles refs from raw MediaInfo audio tracks
  - Raw audio-track facts, metadata conflict provenance, and compatibility guidance in the Admin review UI
  - Approval gate limited to non-empty title and artist
affects: [admin-import-review, real-mv-trackroles, catalog-admission, phase-15]

tech-stack:
  added: []
  patterns:
    - feature-local React form state mirrors reviewed TrackRoles before metadata PATCH
    - dense Admin review sections render raw scanner facts without creating a wizard flow

key-files:
  created:
    - .planning/phases/14-admin-review-and-catalog-admission/14-02-SUMMARY.md
  modified:
    - apps/admin/src/imports/types.ts
    - apps/admin/src/imports/CandidateEditor.tsx
    - apps/admin/src/i18n.tsx
    - apps/admin/src/App.css
    - apps/admin/src/test/import-workbench.test.tsx

key-decisions:
  - "Reviewed real-MV track roles are edited from raw MediaInfo audioTracks and sent as full TrackRef objects in files[].trackRoles."
  - "Approval remains blocked only by blank title or blank artist; compatibility, provenance, cover, and track-role issues stay review guidance."
  - "Real-MV evidence stays inside the existing dense CandidateEditor instead of introducing a separate review wizard."

patterns-established:
  - "RealMvTrackRoleReview owns original/accompaniment selector rendering while CandidateEditor owns form-state mutation."
  - "RealMvPreviewPanel renders raw scanner facts, metadata conflicts, and compatibility guidance as compact review sections."

requirements-completed: [REVIEW-01, REVIEW-02, REVIEW-05]

duration: 15min
completed: 2026-05-13
---

# Phase 14 Plan 02: Admin Real-MV Review UI Summary

**Admin real-MV review now exposes editable track roles, raw audio facts, conflict provenance, and compatibility guidance without adding approval blockers beyond title and artist.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-13T03:24:26Z
- **Completed:** 2026-05-13T03:39:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `RealMvTrackRoleReview` with original/accompaniment selectors populated from `mediaInfoSummary.audioTracks`.
- Extended Admin metadata form state and `MetadataUpdateInput.files[]` so reviewed `trackRoles` are sent through the existing PATCH flow.
- Rendered raw audio track index, label, codec, language, and channel facts in the real-MV preview.
- Rendered filename/sidecar metadata conflict source values and compatibility guidance for playable, review-required, unknown, and unsupported candidates.
- Changed approval gating so only blank title or blank artist disables approval.

## Task Commits

Each TDD task was committed with RED and GREEN commits:

1. **Task 1 RED: Add failing test for editable real-MV track roles** - `c33efe2` (test)
2. **Task 1 GREEN: Implement real-MV track role review controls** - `29a9c3b` (feat)
3. **Task 2 RED: Add failing test for real-MV review facts and approval gate** - `7875e50` (test)
4. **Task 2 GREEN: Show raw facts, conflicts, guidance, and title/artist approval gate** - `f1f4f48` (feat)

## Files Created/Modified

- `apps/admin/src/imports/types.ts` - Adds optional `trackRoles?: TrackRoles` to Admin metadata PATCH file inputs.
- `apps/admin/src/imports/CandidateEditor.tsx` - Adds reviewed track-role form state, selectors, raw audio facts, metadata conflict rendering, compatibility guidance, and approval gating.
- `apps/admin/src/i18n.tsx` - Adds English and Chinese copy for raw tracks, conflicts, guidance, and title/artist requirement.
- `apps/admin/src/App.css` - Styles the track-role review controls and compact real-MV evidence sections.
- `apps/admin/src/test/import-workbench.test.tsx` - Covers DOM evidence, reviewed track-role PATCH payloads, guidance copy, and title/artist approval gating.

## Decisions Made

- Sent full `{ index, id, label }` track refs instead of track IDs so the UI matches the API validation contract from 14-01.
- Kept blank original/accompaniment selector choices valid and persisted as `null`, preserving review-first behavior without creating a new hard blocker.
- Used the existing CandidateEditor layout so Admin can review metadata, provenance, conflicts, compatibility, and track roles in one place.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Regression] Updated existing Needs review assertion**
- **Found during:** Task 1 GREEN verification
- **Issue:** Adding blank track-role selector options introduced multiple visible `需要确认` strings, so an existing single-element assertion became ambiguous.
- **Fix:** Updated the existing preview assertion to accept one or more `需要确认` labels.
- **Files modified:** `apps/admin/src/test/import-workbench.test.tsx`
- **Verification:** `pnpm -F @home-ktv/admin test -- src/test/import-workbench.test.tsx` passed.
- **Committed in:** `29a9c3b`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** The fix was limited to test coverage made stale by the planned UI addition.

## Issues Encountered

- Vitest emitted existing `--localstorage-file` warnings, but the test command exited 0 with all tests passing.

## Auth Gates

None.

## Known Stubs

None. Stub scan found only the intentional blank `value=""` selector options used for the required `需要确认` track-role choice.

## Verification

- `pnpm -F @home-ktv/admin test -- src/test/import-workbench.test.tsx && pnpm -F @home-ktv/admin typecheck` passed with exit 0.
- Test result: 6 files passed, 32 tests passed.
- Acceptance greps found `RealMvTrackRoleReview`, `updateTrackRole`, `trackRoles: file.trackRoles`, `trackRoles?: TrackRoles`, the Chinese DOM/PATCH assertions, i18n keys, CSS classes, and the exact approval disabled expression.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Admin can now review and save real-MV track-role corrections and inspect scanner facts before admission. Phase 14 admission and Phase 15 playback/search work can consume the reviewed `trackRoles` while preserving the boundary that runtime playback switching is not verified here.

## Self-Check: PASSED

- Found summary file: `.planning/phases/14-admin-review-and-catalog-admission/14-02-SUMMARY.md`
- Found modified code files: `types.ts`, `CandidateEditor.tsx`, `i18n.tsx`, `App.css`, `import-workbench.test.tsx`
- Found task commits: `c33efe2`, `29a9c3b`, `7875e50`, `f1f4f48`

---
*Phase: 14-admin-review-and-catalog-admission*
*Completed: 2026-05-13*
