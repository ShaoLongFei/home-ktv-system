---
phase: 14-admin-review-and-catalog-admission
plan: 05
subsystem: testing
tags: [vitest, real-mv, catalog-admission, admin-ui, song-json]

requires:
  - phase: 14-admin-review-and-catalog-admission
    provides: Admin reviewed real-MV trackRoles and review guidance from Plan 14-02
  - phase: 14-admin-review-and-catalog-admission
    provides: One-asset real-MV admission and compatibility readiness from Plan 14-03
  - phase: 14-admin-review-and-catalog-admission
    provides: Durable real-MV song.json validation from Plan 14-04
provides:
  - API regression coverage from reviewed trackRoles through one formal real-MV song.json asset
  - Compatibility readiness regression coverage for playable, review_required, unknown, and unsupported real-MV candidates
  - Admin UI regression coverage for real-MV review facts, guidance, and corrected trackRoles PATCH payloads
  - Explicit test guardrails preserving the Phase 15 boundary
affects: [catalog-admission, admin-import-review, song-json-validation, phase-15-playback-boundary]

tech-stack:
  added: []
  patterns:
    - Local in-memory admission harness for end-to-end-ish real-MV catalog regression tests
    - App-level Admin fetch harness for focused real-MV UI review regression tests

key-files:
  created:
    - apps/api/src/test/real-mv-admission-regression.test.ts
    - apps/admin/src/test/real-mv-review-ui.test.tsx
  modified: []

key-decisions:
  - "Final Phase 14 real-MV coverage remains test-only and does not introduce runtime playback or switching behavior."
  - "API regression validates real-MV admission through CatalogAdmissionService plus song.json validation rather than Phase 15 playback."
  - "Admin regression uses an app-level fetch harness to verify visible review facts and PATCH payloads without Playwright or screenshots."

patterns-established:
  - "Regression tests include source guards to prevent excluded runtime concerns from entering Phase 14 coverage."
  - "Real-MV UI fixture variants cover review-required, missing-cover, missing-role, and unsupported guidance cases without production changes."

requirements-completed: [REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05]

duration: 15min
completed: 2026-05-13
---

# Phase 14 Plan 05: Final Real-MV Regression Guardrails Summary

**Targeted API and Admin regression suites now prove reviewed real-MV admission, one-asset song.json output, UI review facts, guidance, and PATCH payloads without Phase 15 runtime work.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-05-13T03:51:06Z
- **Completed:** 2026-05-13T04:06:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added API regression coverage for reviewed `trackRoles`, one formal `dual-track-video` asset, copied cover sidecar, and single-asset `song.json`.
- Covered real-MV compatibility readiness mapping: `playable -> ready/ready`, `review_required` and `unknown -> review_required/promoted`, and `unsupported -> review_required` without writer calls.
- Added validator coverage proving admitted one-asset real-MV song.json passes, missing role refs are warnings, and legacy `SWITCH_PAIR_NOT_VERIFIED` does not leak into the real-MV contract.
- Added Admin UI regression coverage for metadata fields, cover, MediaInfo, raw audio tracks, provenance, metadata conflicts, role selectors, repair guidance, approval gating, and corrected `trackRoles` PATCH payloads.

## Task Commits

Each task was committed atomically, with one follow-up fix for a verification-blocking type issue:

1. **Task 1: Add API real-MV admission regression suite** - `2d8beb0` (test)
2. **Task 2: Add Admin real-MV review UI regression suite** - `5274ea6` (test)
3. **Task 1 follow-up: Satisfy API regression exact optional typing** - `e85e854` (fix)

## Files Created/Modified

- `apps/api/src/test/real-mv-admission-regression.test.ts` - Covers real-MV admission, readiness mapping, song.json output, validator contract, and excluded-scope source guard.
- `apps/admin/src/test/real-mv-review-ui.test.tsx` - Covers Admin review facts, guidance, role correction payloads, approval-light behavior, unsupported candidate visibility, and excluded-scope source guard.

## Decisions Made

- Kept this plan test-only; no production behavior changed.
- Validated admission through service and validator harnesses instead of adding runtime playback or switching assumptions.
- Verified Admin review through React Testing Library and fetch mocks instead of Playwright or screenshots.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Harness] Matched combined Admin guidance text**
- **Found during:** Task 2 verification
- **Issue:** The UI renders unsupported and retry guidance in one paragraph, so exact full-node text lookups did not match each sentence separately.
- **Fix:** Switched to exact guidance constants with text-content matchers that verify both required sentences inside the combined paragraph.
- **Files modified:** `apps/admin/src/test/real-mv-review-ui.test.tsx`
- **Verification:** `pnpm -F @home-ktv/admin test -- src/test/real-mv-review-ui.test.tsx` passed.
- **Committed in:** `5274ea6`

**2. [Rule 3 - Blocking] Omitted optional Admin cover URL instead of assigning undefined**
- **Found during:** Task 2 typecheck
- **Issue:** `exactOptionalPropertyTypes` rejects `coverPreviewUrl: undefined` in test fixture overrides.
- **Fix:** Added a helper that omits `coverPreviewUrl` for no-cover fixture variants.
- **Files modified:** `apps/admin/src/test/real-mv-review-ui.test.tsx`
- **Verification:** `pnpm -F @home-ktv/admin typecheck` passed.
- **Committed in:** `5274ea6`

**3. [Rule 3 - Blocking] Defaulted API helper playbackProfile**
- **Found during:** Overall API typecheck
- **Issue:** The API validation helper assigned an optional promotion `playbackProfile` into required `Asset.playbackProfile`.
- **Fix:** Defaulted the helper to the real-MV playback profile when the promotion type is optional.
- **Files modified:** `apps/api/src/test/real-mv-admission-regression.test.ts`
- **Verification:** `pnpm -F @home-ktv/api typecheck` passed.
- **Committed in:** `e85e854`

---

**Total deviations:** 3 auto-fixed (1 Rule 1, 2 Rule 3)
**Impact on plan:** All fixes were limited to the new regression test harnesses and were required for correct verification. No product scope changed.

## Issues Encountered

- Vitest emitted the existing `--localstorage-file` warning in Admin tests, but the command exited 0.
- The package test scripts run the full package suite even when a target path is passed; the requested target files are included in those successful runs.
- `gsd-tools state advance-plan` could not parse the current STATE.md shape, so I updated STATE.md, ROADMAP.md, and REQUIREMENTS.md directly to record completion.

## Auth Gates

None.

## Known Stubs

None. Stub scan found only intentional empty arrays and empty fixture defaults inside test harness setup; no app UI stubs or mock-only production data paths were introduced.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/real-mv-admission-regression.test.ts` passed: 33 files, 200 tests.
- `pnpm -F @home-ktv/admin test -- src/test/real-mv-review-ui.test.tsx` passed: 7 files, 36 tests.
- `pnpm -F @home-ktv/api typecheck` passed.
- `pnpm -F @home-ktv/admin typecheck` passed.
- Acceptance greps found all required API and Admin regression anchors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 14 now has final regression evidence that real-MV candidates can be reviewed, corrected, admitted as one formal asset, written to durable song.json, and kept visible with repair guidance when unsupported. Phase 15 can build runtime playback and audio-track switching on top of these locked contracts.

## Self-Check: PASSED

- Found created files: `apps/api/src/test/real-mv-admission-regression.test.ts`, `apps/admin/src/test/real-mv-review-ui.test.tsx`
- Found summary file: `.planning/phases/14-admin-review-and-catalog-admission/14-05-SUMMARY.md`
- Found task commits: `2d8beb0`, `5274ea6`, `e85e854`

---
*Phase: 14-admin-review-and-catalog-admission*
*Completed: 2026-05-13*
