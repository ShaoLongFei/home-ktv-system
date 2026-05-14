---
phase: 12-contract-schema-and-playback-risk-spike
plan: 01
subsystem: domain
tags: [real-mv, media-contract, compatibility, track-roles]

requires:
  - phase: 11-admin-runtime-boundary-completion
    provides: Runtime boundaries and productized catalog/control flows for v1.1
provides:
  - Shared real-MV compatibility status contract
  - TrackRef and TrackRoles contracts for one-file dual-audio MV assets
  - MediaInfo summary and provenance contracts
  - Platform-neutral PlaybackProfile contract
affects: [phase-12-schema, phase-12-probe, phase-12-playback-target, phase-13-scanner, phase-14-review, phase-15-playback]

tech-stack:
  added: []
  patterns:
    - Optional Phase 12 fields on existing domain models to preserve legacy fixture compatibility
    - Platform-neutral playback contracts without Android-specific naming

key-files:
  created:
    - apps/api/src/test/real-mv-domain-contracts.test.ts
  modified:
    - packages/domain/src/index.ts

key-decisions:
  - "One physical real-MV file remains one Asset identity with internal trackRoles."
  - "Compatibility readiness uses exactly unknown, review_required, playable, and unsupported."
  - "TrackRef stores index, id, and label so runtime selection and human review do not collapse to raw indexes."
  - "PlaybackProfile stays platform-neutral in Phase 12."

patterns-established:
  - "Real-MV metadata is additive and optional on Asset and ImportCandidateFile until schema-backed rows are introduced."
  - "Tests assert forbidden Android-specific terms are absent from shared contracts."

requirements-completed: [MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04]

duration: 44min
completed: 2026-05-11
---

# Phase 12-01: Shared Real-MV Domain Contract Types Summary

**Shared TypeScript contracts now represent one physical dual-audio MV file with compatibility, media facts, provenance, track roles, and a platform-neutral playback profile.**

## Performance

- **Duration:** 44 min elapsed
- **Started:** 2026-05-11T07:16:13Z
- **Completed:** 2026-05-11T08:00:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added exact Phase 12 compatibility status values and exported shared compatibility reason types.
- Added TrackRef, TrackRoles, MediaInfoSummary, MediaInfoProvenance, AudioTrackSummary, and PlaybackProfile domain contracts.
- Extended Asset and ImportCandidateFile so one real-MV file can carry track roles and normalized media metadata before and after catalog admission.
- Added focused Vitest coverage for exact status values, one-file asset modeling, candidate metadata, and platform-neutral playback profile text.

## Task Commits

1. **Task 1: Add Phase 12 real-MV domain contract types** - included in `feat(12-01): add real MV domain contracts`
2. **Task 2: Attach real-MV metadata fields to Asset and candidate file contracts** - included in `feat(12-01): add real MV domain contracts`

## Files Created/Modified

- `packages/domain/src/index.ts` - Adds shared real-MV status, track, media summary, provenance, and playback profile contracts; extends Asset and ImportCandidateFile with optional Phase 12 fields.
- `apps/api/src/test/real-mv-domain-contracts.test.ts` - Verifies exact status values, one physical MV as one Asset, candidate pre-admission fields, and platform-neutral playback profiles.

## Decisions Made

- Kept real-MV fields optional on existing domain interfaces so current demo/local fixtures remain valid while later plans add durable persistence.
- Used `trackRoles.original` and `trackRoles.instrumental` as the only Phase 12 role mapping, avoiding separate original/instrumental asset identity fields.
- Kept Android TV concerns out of the domain contract by testing for forbidden platform-specific strings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The broad `pnpm -F @home-ktv/api test -- src/test/real-mv-domain-contracts.test.ts` route can trigger unrelated API tests and sandbox listener failures in this environment. The focused command `pnpm --filter @home-ktv/api exec vitest run src/test/real-mv-domain-contracts.test.ts` was used for reliable plan-scoped verification.

## Verification

- `pnpm -F @home-ktv/domain typecheck`
- `pnpm --filter @home-ktv/api exec vitest run src/test/real-mv-domain-contracts.test.ts`
- Acceptance grep checks for exact status values, TrackRef fields, MediaInfoSummary, PlaybackProfile kind, optional Asset/ImportCandidateFile fields, one-asset test coverage, and absence of forbidden Android-specific contract names.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-02 can now add database columns and repository mapping against these shared domain contracts. 12-03 can derive normalized probe facts and compatibility reasons without inventing parallel status or track-role vocabulary.

---
*Phase: 12-contract-schema-and-playback-risk-spike*
*Completed: 2026-05-11*
