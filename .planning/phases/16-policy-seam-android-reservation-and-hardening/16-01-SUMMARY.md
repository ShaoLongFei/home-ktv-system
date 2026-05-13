---
phase: 16-policy-seam-android-reservation-and-hardening
plan: 01
subsystem: ingest-policy
tags: [real-mv, admission-policy, admin-review, vitest, typescript]

requires:
  - phase: 14-admin-review-and-catalog-admission
    provides: real-MV review-first admission and Admin import review surfaces
  - phase: 15-search-queue-playback-and-switching
    provides: verified real-MV playback/search behavior that must remain policy-neutral
provides:
  - pure real-MV admission policy helper with reserved auto-admit eligibility facts
  - persisted candidateMeta.realMv.admissionPolicy on real-MV import candidates
  - API and Admin UI regression guards proving the metadata is diagnostic only
affects: [phase-16-hardening, real-mv-admission, admin-import-review]

tech-stack:
  added: []
  patterns:
    - pure policy helper for reserved future capability metadata
    - negative UI/source guard for invisible reserved product controls

key-files:
  created:
    - apps/api/src/modules/ingest/real-mv-policy.ts
    - apps/api/src/test/real-mv-policy.test.ts
  modified:
    - apps/api/src/modules/ingest/candidate-builder.ts
    - apps/api/src/test/admin-imports-routes.test.ts
    - apps/admin/src/test/real-mv-review-ui.test.tsx

key-decisions:
  - "Reserved auto-admit eligibility is stored under candidateMeta.realMv.admissionPolicy and remains informational."
  - "CatalogAdmissionService does not read reservedAutoAdmit, so manual approval remains the only admission action."
  - "Admin detail may expose policy as candidate metadata, but file realMv preview and UI controls stay policy-free."

patterns-established:
  - "RealMvAdmissionPolicy always uses mode=review_first and reservedAutoAdmit.reserved=true."
  - "Admin UI source guard keeps auto-admit wording confined to the negative regression guard."

requirements-completed: [HARD-01]

duration: 17min
completed: 2026-05-13
---

# Phase 16 Plan 01: Review-first Policy Seam Summary

**Reserved real-MV auto-admit eligibility metadata stored on candidates while review-first admission and Admin controls stay unchanged**

## Performance

- **Duration:** 17 min
- **Started:** 2026-05-13T12:37:46Z
- **Completed:** 2026-05-13T12:54:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `deriveRealMvAdmissionPolicy(...)` as a pure helper with locked reason codes and no repository, filesystem, route, or admission-service dependencies.
- Persisted `candidateMeta.realMv.admissionPolicy` during real-MV candidate building without changing the existing compatibility-derived candidate status.
- Added API/Admin regression coverage proving the policy object remains diagnostic metadata and no visible auto-admit control is exposed in v1.2.

## Task Commits

1. **Task 1: Persist reserved admission policy metadata on real-MV candidates** - `2a1d5dd` (`feat`)
2. **Task 2: Prove policy metadata stays non-operational and invisible as a switch** - `ac4397f` (`test`)

## Files Created/Modified

- `apps/api/src/modules/ingest/real-mv-policy.ts` - Defines `RealMvAdmissionPolicy` and derives reserved eligibility reasons.
- `apps/api/src/modules/ingest/candidate-builder.ts` - Stores the derived policy under `candidateMeta.realMv.admissionPolicy`.
- `apps/api/src/test/real-mv-policy.test.ts` - Covers policy derivation and builder persistence/status neutrality.
- `apps/api/src/test/admin-imports-routes.test.ts` - Asserts Admin detail serializes policy under candidate metadata, not file preview fields.
- `apps/admin/src/test/real-mv-review-ui.test.tsx` - Guards against visible auto-admit buttons, labels, or production UI copy.

## TDD Evidence

- Task 1 RED: `pnpm -F @home-ktv/api test -- src/test/real-mv-policy.test.ts` failed because `real-mv-policy.js` did not exist.
- Task 1 GREEN: same command passed after adding the helper and candidate-builder wiring.
- Task 2 RED: `pnpm -F @home-ktv/api test -- src/test/admin-imports-routes.test.ts` failed because the real-MV fixture had no `candidateMeta.realMv.admissionPolicy`.
- Task 2 GREEN: API and Admin tests passed after adding the diagnostic fixture and UI negative/source guards.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/real-mv-policy.test.ts src/test/admin-imports-routes.test.ts` - passed, 37 files / 238 tests.
- `pnpm -F @home-ktv/admin test -- src/test/real-mv-review-ui.test.tsx` - passed, 7 files / 39 tests.
- `pnpm -F @home-ktv/api typecheck` - passed.
- `pnpm -F @home-ktv/admin typecheck` - passed.
- `rg -n "reservedAutoAdmit" apps/api/src/modules/catalog/admission-service.ts` - exited 1 as expected.

## Decisions Made

- Kept policy derivation in ingest candidate construction rather than catalog admission so the reserved capability cannot promote candidates.
- Kept `admissionPolicy` out of `file.realMv` preview fields to avoid making the reserved policy part of visible review controls.
- Used a negative Admin UI source guard to prevent auto-admit wording from appearing in production UI copy.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The Admin UI source guard initially matched the metadata fixture key `reservedAutoAdmit`; the fixture helper now builds that key without visible source text so the guard focuses on user-facing auto-admit copy/control leakage.

## Known Stubs

None. Stub scan hits were limited to test harness defaults and controlled empty arrays such as `reasons: []`, not UI-rendered placeholder data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 16-01 provides the inert policy seam required by HARD-01. Later Phase 16 plans can build on this metadata while preserving the current rule that manual `批准入库` review remains the only admission action.

## Self-Check: PASSED

- Verified created files exist: `apps/api/src/modules/ingest/real-mv-policy.ts`, `apps/api/src/test/real-mv-policy.test.ts`, and this summary.
- Verified task commits exist: `2a1d5dd` and `ac4397f`.
- Verified summary includes `requirements-completed: [HARD-01]` and documents known stubs.

---
*Phase: 16-policy-seam-android-reservation-and-hardening*
*Completed: 2026-05-13*
