---
phase: 14-admin-review-and-catalog-admission
plan: 01
subsystem: api
tags: [fastify, vitest, postgres, jsonb, trackroles]

requires:
  - phase: 13-mediainfo-probe-scanner-and-sidecars
    provides: real-MV import candidate files with MediaInfo audio tracks and guessed trackRoles
provides:
  - Admin import metadata PATCH parsing for reviewed trackRoles
  - Candidate-file trackRoles validation against raw MediaInfo audio tracks
  - Persistence of reviewed trackRoles into import_candidate_files.track_roles
  - INVALID_TRACK_ROLE_REF route error mapping
affects: [admin-import-review, catalog-admission, real-mv-trackroles, phase-14, phase-15]

tech-stack:
  added: []
  patterns:
    - typed Fastify PATCH parser helpers for nested domain metadata
    - transaction-scoped repository validation before JSONB metadata updates
    - repository domain error translated to route-level HTTP 400

key-files:
  created:
    - .planning/phases/14-admin-review-and-catalog-admission/14-01-SUMMARY.md
  modified:
    - apps/api/src/routes/admin-imports.ts
    - apps/api/src/modules/ingest/repositories/import-candidate-repository.ts
    - apps/api/src/test/admin-imports-routes.test.ts

key-decisions:
  - "Reviewed trackRoles are accepted only as a complete original/instrumental object whose slots are TrackRef or null."
  - "Repository validation uses current candidate file MediaInfo audioTracks inside the metadata update transaction."
  - "Invalid reviewed track refs return INVALID_TRACK_ROLE_REF without changing unrelated route error behavior."

patterns-established:
  - "parseTrackRolesPatch validates nested track-role metadata before repository calls."
  - "validateTrackRolesAgainstAudioTracks rejects non-null refs that do not match both audio track id and index."

requirements-completed: [REVIEW-02]

duration: 14min
completed: 2026-05-13
---

# Phase 14 Plan 01: Admin Reviewed TrackRoles API Summary

**PATCH metadata for Admin import candidates now accepts reviewed trackRoles, validates refs against raw audio tracks, and persists them to candidate file JSONB.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-13T02:53:47Z
- **Completed:** 2026-05-13T03:07:36Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `parseTrackRolesPatch`, `parseTrackRoleSlot`, and `isTrackRefPatch` to reject malformed reviewed track-role metadata at the route boundary.
- Extended candidate metadata updates with `files[].trackRoles`, persisted through `import_candidate_files.track_roles`.
- Added repository validation so non-null original/instrumental refs must match the candidate file's raw `mediaInfoSummary.audioTracks` by both `id` and `index`.
- Mapped `ImportCandidateMetadataError("INVALID_TRACK_ROLE_REF")` to HTTP 400 from the Admin PATCH route.

## Task Commits

Each task was committed atomically:

1. **Task 1: Parse reviewed trackRoles in the Admin metadata PATCH route** - `4b1cf2f` (feat)
2. **Task 2: Persist reviewed trackRoles after validating against raw audio tracks** - `1472914` (feat)

## Files Created/Modified

- `apps/api/src/routes/admin-imports.ts` - Parses reviewed trackRoles and returns route-level 400 responses for invalid role refs.
- `apps/api/src/modules/ingest/repositories/import-candidate-repository.ts` - Extends metadata input, validates refs against current audio tracks, and writes `track_roles`.
- `apps/api/src/test/admin-imports-routes.test.ts` - Covers valid trackRoles forwarding, malformed shape rejection, and `INVALID_TRACK_ROLE_REF` mapping.

## Decisions Made

- Kept missing role selections valid by allowing `original` and `instrumental` to be `null`; review warnings remain separate from hard approval blockers.
- Required the top-level `trackRoles` patch object to contain exactly `original` and `instrumental` so malformed JSONB cannot reach persistence.
- Treated trackRole validation as repository responsibility because the repository has access to current candidate file audio-track facts in the same transaction.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/admin-imports-routes.test.ts` passed during Task 2 green verification before unrelated parallel 14-04 red tests were committed: 32 files, 188 tests.
- `pnpm -F @home-ktv/api typecheck` passed with exit 0 during Task 2 verification.
- Final isolated verification after the parallel 14-04 red-test commit:
  - `pnpm -F @home-ktv/api exec vitest run src/test/admin-imports-routes.test.ts` passed: 1 file, 12 tests.
  - `pnpm -F @home-ktv/api typecheck` passed with exit 0.

## Deviations from Plan

None - plan code changes executed as written.

## Issues Encountered

- The prescribed package-script test command later failed because another parallel agent committed unrelated 14-04 failing tests in `src/test/song-json-consistency-validator.test.ts` (`5317697`). I did not modify that out-of-scope work; this plan's route test and typecheck were verified with isolated commands after that commit.

## Auth Gates

None.

## Known Stubs

None - stub scan found no TODO/FIXME/placeholder or hardcoded empty UI data patterns in the files modified by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Admin review UI and catalog admission plans can now send reviewed original/accompaniment track-role refs through the existing Admin metadata PATCH route and rely on repository validation before approval.

## Self-Check: PASSED

- Found summary file: `.planning/phases/14-admin-review-and-catalog-admission/14-01-SUMMARY.md`
- Found modified code files: `admin-imports.ts`, `import-candidate-repository.ts`, `admin-imports-routes.test.ts`
- Found task commits: `4b1cf2f`, `1472914`

---
*Phase: 14-admin-review-and-catalog-admission*
*Completed: 2026-05-13*
