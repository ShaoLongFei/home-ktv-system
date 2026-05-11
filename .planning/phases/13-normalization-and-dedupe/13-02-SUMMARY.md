---
phase: 13-normalization-and-dedupe
plan: 02
subsystem: tooling
tags: [typescript, normalization, dedupe, candidates]

requires:
  - phase: 13-normalization-and-dedupe
    provides: Candidate contracts, text normalization, and variant warning helpers from 13-01
  - phase: 12-source-contracts-and-fetch-harness
    provides: SourceRow fixture output and source status contracts
provides:
  - Evidence-preserving candidate snapshot builder
  - Conservative source row grouping by title, artist key set, and variant signature
  - Stable song keys and candidate IDs
  - Dedupe edge-case regression tests
affects: [NORM-01, NORM-02, NORM-03, NORM-04, phase-13, phase-14]

tech-stack:
  added: []
  patterns:
    - Candidate grouping uses canonical title key plus sorted canonical artist keys plus variant signature
    - Candidate IDs are deterministic SHA-256-derived `song_<16 hex>` values
    - Evidence display chooses KTV-first rows before support rows, then lower rank and source id

key-files:
  created:
    - packages/hot-songs/src/normalize/candidates.ts
    - packages/hot-songs/src/test/candidates.test.ts
  modified:
    - packages/hot-songs/src/test/candidates.test.ts

key-decisions:
  - "Grouping remains conservative: no fuzzy matching, alias inference, romanization, scoring, or ranking."
  - "Variant signature remains part of the song key so Live/DJ/Remix/etc. rows do not silently merge with originals."
  - "Candidate evidence stores the full raw SourceRow array so later scoring/export can explain every source contribution."

patterns-established:
  - "buildCandidateSnapshot() is the stable entrypoint for converting SourceRow arrays into candidate snapshots."
  - "buildSongKey() creates human-readable deterministic keys before buildCandidateId() hashes them."
  - "Candidate warnings combine title variant warnings with row-level source warnings."

requirements-completed: [NORM-01, NORM-02, NORM-03, NORM-04]

duration: 5m
completed: 2026-05-10
---

# Phase 13 Plan 02: Candidate Grouping Summary

**Conservative source-row grouping into stable, evidence-preserving candidate identities**

## Performance

- **Duration:** 5m
- **Started:** 2026-05-10T06:43:01Z
- **Completed:** 2026-05-10T06:47:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `buildCandidateSnapshot()`, `buildCandidateIdentity()`, `buildSongKey()`, and `buildCandidateId()`.
- Grouped Phase 12 fixture rows into six candidates while preserving all 15 raw evidence rows.
- Added edge-case tests for same-title different-artist separation, Live variant warnings, row-level warnings, and stable IDs when rows are reversed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Group source rows into conservative candidates** - `7917ed5` (feat)
2. **Task 2: Prove conservative dedupe edge cases** - `ab24722` (test)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `packages/hot-songs/src/normalize/candidates.ts` - Candidate snapshot builder, grouping, display evidence selection, stable song keys, and hashed candidate IDs.
- `packages/hot-songs/src/test/candidates.test.ts` - Fixture grouping and conservative dedupe stability tests.

## Decisions Made

- Used the full `canonicalTitleKey`, sorted `canonicalArtistKeys`, and `variantSignature` as the only merge identity.
- Sorted output candidates by `songKey` so candidate order stays stable across input row order.
- Kept row-level warnings on evidence and lifted them to candidate warnings for later review/export.

## Verification

- `pnpm -F @home-ktv/hot-songs test -- src/test/candidates.test.ts` - passed, 7 files / 35 tests.
- `pnpm -F @home-ktv/hot-songs typecheck` - passed.
- Acceptance checks found `same title different artist`, `variant-live`, and `reversed`; `candidates.ts` does not contain `score`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first typecheck after Task 1 exposed a missing `SourceType` export. Fixed by deriving the type from `SourceDefinition["sourceType"]` before the Task 1 commit.
- Task 2 tests passed against the existing implementation, so no production-code change was needed for that task.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

13-03 can expose `buildCandidateSnapshot()` through a normalize CLI and generate a committed fixture candidate snapshot for downstream ranking/export planning.

## Self-Check: PASSED

- Found candidate builder: `packages/hot-songs/src/normalize/candidates.ts`
- Found candidate tests: `packages/hot-songs/src/test/candidates.test.ts`
- Found task commit: `7917ed5`
- Found task commit: `ab24722`

---
*Phase: 13-normalization-and-dedupe*
*Completed: 2026-05-10*
