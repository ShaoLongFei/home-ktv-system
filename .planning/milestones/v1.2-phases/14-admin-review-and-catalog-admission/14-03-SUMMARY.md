---
phase: 14-admin-review-and-catalog-admission
plan: 03
subsystem: api
tags: [catalog, admission, real-mv, postgres, vitest]

requires:
  - phase: 13-mediainfo-probe-scanner-and-sidecars
    provides: scanned single-file real-MV candidates with MediaInfo, sidecar cover data, playback profile, compatibility, and trackRoles
  - phase: 14-admin-review-and-catalog-admission
    provides: reviewed real-MV trackRoles and durable song.json real-MV fields
provides:
  - Real-MV approval branch before legacy original/instrumental pair evaluation
  - Compatibility-driven formal song and asset readiness for playable, review-required, unknown, and unsupported candidates
  - One-asset real-MV promotion writer path with compatibility, MediaInfo, trackRoles, and playbackProfile persistence
  - Cover sidecar copy into the formal song directory with coverPath written to song.json
affects: [catalog-admission, formal-assets, real-mv-review, phase-15-playback]

tech-stack:
  added: []
  patterns:
    - TDD red-green commits for service admission and writer persistence
    - Real-MV branch selected by dual-track-video asset kind or single_file_audio_tracks playback profile
    - Safe same-directory cover sidecar copying from import roots into formal song directories

key-files:
  created:
    - .planning/phases/14-admin-review-and-catalog-admission/14-03-SUMMARY.md
  modified:
    - apps/api/src/modules/catalog/admission-service.ts
    - apps/api/src/test/catalog-admission.test.ts

key-decisions:
  - "Real-MV admission bypasses legacy pair evaluation and creates exactly one dual-track-video Asset."
  - "Scanner compatibility controls formal readiness, while real-MV switchQualityStatus remains review_required until runtime switching is verified later."
  - "Unsupported real-MV candidates stay review_required with repair metadata instead of being force-promoted or hidden."

patterns-established:
  - "PromoteApprovedCandidateInput accepts optional per-asset real-MV fields while preserving legacy pair defaults."
  - "PgCatalogAdmissionWriter inserts and updates JSONB compatibility, MediaInfo, trackRoles, and playbackProfile columns for formal assets."

requirements-completed: [REVIEW-03, REVIEW-04, REVIEW-05]

duration: 20min
completed: 2026-05-13
---

# Phase 14 Plan 03: Real-MV Formal Admission Summary

**Single-file real-MV candidates now approve into one formal Song and one dual-track-video Asset with track roles, compatibility facts, MediaInfo, playback profile, and cover sidecar promotion.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-13T03:16:00Z
- **Completed:** 2026-05-13T03:35:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a real-MV approval path that runs before legacy pair evaluation, admits supported single-file candidates, and keeps unsupported candidates visible as `review_required`.
- Wrote formal `song.json` with one `dual-track-video` asset, reviewed `trackRoles`, compatibility state, MediaInfo, playback profile, default asset fields, source metadata, and copied cover sidecar.
- Extended the PostgreSQL admission writer so formal assets persist real-MV fields while legacy pair callers keep their existing defaults.

## Task Commits

Each TDD task was committed atomically:

1. **Task 1 RED: Real-MV admission tests** - `36ce11d` (test)
2. **Task 1 GREEN: Real-MV approval branch** - `650f899` (feat)
3. **Task 2 RED: Real-MV writer coverage** - `bc62fc5` (test)
4. **Task 2 GREEN: Real-MV writer persistence** - `ca73158` (feat)

## Files Created/Modified

- `apps/api/src/modules/catalog/admission-service.ts` - Adds the real-MV admission branch, readiness helpers, cover sidecar copy, one-asset `song.json` writer payload, and writer SQL for real-MV asset fields.
- `apps/api/src/test/catalog-admission.test.ts` - Covers single real-MV approval, playable readiness, unsupported repair visibility, and writer persistence for real-MV columns and values.

## Decisions Made

- Real-MV approval only blocks on blank title or artist; incomplete role or compatibility facts remain reviewable metadata unless the scanner marked the file unsupported.
- `playable` maps to ready song and ready asset, but `switchQualityStatus` stays `review_required` because runtime audio-track switching belongs to Phase 15.
- `review_required` and `unknown` candidates can become formal review-required songs with promoted assets, preserving the facts needed for later review and playback validation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended promotion input during Task 1**
- **Found during:** Task 1 (real-MV approval branch)
- **Issue:** The service needed typed real-MV asset fields before Task 2's writer SQL could be completed.
- **Fix:** Added optional `songStatus`, asset status, compatibility, MediaInfo, `trackRoles`, and `playbackProfile` fields to `PromoteApprovedCandidateInput` while leaving writer persistence for Task 2.
- **Files modified:** `apps/api/src/modules/catalog/admission-service.ts`
- **Verification:** `pnpm -F @home-ktv/api test -- src/test/catalog-admission.test.ts`
- **Committed in:** `650f899`

**2. [Rule 1 - Bug] Fixed exact optional and readonly typecheck issues**
- **Found during:** Task 2 verification
- **Issue:** The new real-MV `song.json` payload could pass optional `undefined` values and readonly candidate arrays into exact optional types.
- **Fix:** Defaulted compatibility fields and cloned candidate arrays before writing `song.json`.
- **Files modified:** `apps/api/src/modules/catalog/admission-service.ts`
- **Verification:** `pnpm -F @home-ktv/api test -- src/test/catalog-admission.test.ts && pnpm -F @home-ktv/api typecheck`
- **Committed in:** `ca73158`

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were required for typed implementation and did not add scope beyond the planned real-MV admission and writer contract.

## Issues Encountered

- Parallel Plan 14-02 changed Admin UI files while this plan ran. I did not stage or modify those files; commits for this plan include only API admission and test files.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/catalog-admission.test.ts` passed: 32 files, 196 tests.
- `pnpm -F @home-ktv/api typecheck` passed with exit 0.
- Acceptance greps found the required real-MV service helpers, real-MV asset construction, writer SQL columns, and regression test patterns.

## Auth Gates

None.

## Known Stubs

None - stub scan found only normal default values and test harness arrays, with no blocking TODO/FIXME/placeholder or unwired UI data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 14-05 can now exercise the full admission surface, and Phase 15 can consume a formal one-asset real-MV catalog record without assuming runtime switching has been verified.

## Self-Check: PASSED

- Found summary file: `.planning/phases/14-admin-review-and-catalog-admission/14-03-SUMMARY.md`
- Found modified files: `admission-service.ts`, `catalog-admission.test.ts`
- Found task commits: `36ce11d`, `650f899`, `bc62fc5`, `ca73158`

---
*Phase: 14-admin-review-and-catalog-admission*
*Completed: 2026-05-13*
