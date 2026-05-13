---
phase: 14-admin-review-and-catalog-admission
plan: 04
subsystem: api
tags: [catalog, song-json, real-mv, validation, vitest]

requires:
  - phase: 14-admin-review-and-catalog-admission
    provides: reviewed real-MV admission fields and formal asset contracts
provides:
  - Durable real-MV fields on SongJsonDocument and SongJsonAsset
  - Single real-MV song.json consistency validation branch
  - Cover path safety and existence validation
  - Track-role reference validation against MediaInfo audio tracks
affects: [catalog-admission, formal-song-json, real-mv-audit, phase-15-playback]

tech-stack:
  added: []
  patterns:
    - Type-only contract coverage using satisfies against SongJsonDocument
    - Validator branch keyed by playbackProfile.kind for single-file real MV assets
    - Cover path validation that distinguishes unsafe references from missing optional files

key-files:
  created:
    - apps/api/src/test/song-json.test.ts
    - .planning/phases/14-admin-review-and-catalog-admission/14-04-SUMMARY.md
  modified:
    - apps/api/src/modules/catalog/song-json.ts
    - apps/api/src/modules/catalog/song-json-consistency-validator.ts
    - apps/api/src/test/song-json-consistency-validator.test.ts

key-decisions:
  - "Formal song.json now mirrors durable real-MV Asset fields without adding any database dependency to the writer."
  - "Validator treats playbackProfile.kind=single_file_audio_tracks as a one-asset real-MV contract and skips legacy switch-pair validation for it."
  - "Missing real-MV original/instrumental role refs are review warnings; invalid refs remain hard validation errors."

patterns-established:
  - "SongJsonAsset carries optional compatibility, MediaInfo, trackRoles, playbackProfile, and codec fields for restore/audit."
  - "validateSingleRealMvAsset validates one dual-track-video/dual asset and matches role refs by both audio track id and index."

requirements-completed: [REVIEW-04]

duration: 17min
completed: 2026-05-13
---

# Phase 14 Plan 04: Durable Real-MV song.json Summary

**Formal song.json now stores and validates one real-MV asset with cover path, MediaInfo, track roles, codecs, playback profile, and compatibility facts.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-05-13T02:53:51Z
- **Completed:** 2026-05-13T03:11:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extended `SongJsonDocument` with optional `coverPath` and extended `SongJsonAsset` with the durable real-MV fields already present on formal `Asset`.
- Added type-level coverage proving single real-MV song.json documents can carry compatibility, MediaInfo, track role, playback profile, and codec fields.
- Added a validator branch for `single_file_audio_tracks` assets so one real-MV asset is not rejected as a missing legacy original/instrumental pair.
- Added cover path validation plus role-ref validation against MediaInfo audio tracks by both `id` and `index`.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: SongJsonDocument real-MV contract test** - `a110988` (test)
2. **Task 1 GREEN: Extend song-json real-MV contract** - `94cf4d3` (feat)
3. **Task 2 RED: Single real-MV validator tests** - `5317697` (test)
4. **Task 2 GREEN: Single real-MV validator branch** - `4d97ba2` (feat)

## Files Created/Modified

- `apps/api/src/test/song-json.test.ts` - Type-level coverage for the durable single real-MV song.json contract.
- `apps/api/src/modules/catalog/song-json.ts` - Adds `coverPath` and optional real-MV asset fields while preserving atomic temp-file write and rename behavior.
- `apps/api/src/modules/catalog/song-json-consistency-validator.ts` - Validates cover paths, compatibility status enum values, single real-MV asset shape, missing role warnings, and invalid role errors.
- `apps/api/src/test/song-json-consistency-validator.test.ts` - Covers valid single real-MV documents, missing role warnings, invalid refs, and unsafe cover paths.

## Decisions Made

- Kept `song-json.ts` as a pure file contract module; no database dependency was introduced.
- Treated missing original/instrumental role refs as review-required warnings so admission can preserve incomplete real-MV facts without pretending runtime switching is verified.
- Rejected parent traversal in `coverPath` before file existence checks so formal covers stay local to the song artifact path.

## Verification

- `pnpm -F @home-ktv/api exec vitest run src/test/song-json-consistency-validator.test.ts` passed: 1 file, 6 tests.
- `pnpm -F @home-ktv/api test -- src/test/song-json-consistency-validator.test.ts` passed: 32 files, 192 tests.
- `pnpm -F @home-ktv/api typecheck` passed with exit 0.
- Acceptance greps found all required `song-json.ts`, validator, and test patterns.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- Parallel Phase 14 work briefly left typecheck in a failing state while Plan 14-01 files were mid-update. I did not revert that work; after the other changes settled, this plan's typecheck passed.
- One Task 1 GREEN commit initially picked up unrelated staged parallel-agent files. I immediately rewrote only that newest commit non-destructively, preserving file contents and recommitting only `song-json.ts`.

## Auth Gates

None.

## Known Stubs

None - stub scan found no blocking TODO/FIXME/placeholder or hardcoded empty UI data patterns in this plan's created/modified files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Formal catalog restore/audit and Phase 15 playback work can now consume one durable real-MV asset from `song.json`, including confirmed or missing track-role facts and explicit compatibility state.

## Self-Check: PASSED

- Found summary file: `.planning/phases/14-admin-review-and-catalog-admission/14-04-SUMMARY.md`
- Found created/modified files: `song-json.test.ts`, `song-json.ts`, `song-json-consistency-validator.ts`, `song-json-consistency-validator.test.ts`
- Found task commits: `a110988`, `94cf4d3`, `5317697`, `4d97ba2`

---
*Phase: 14-admin-review-and-catalog-admission*
*Completed: 2026-05-13*
