---
phase: 13-normalization-and-dedupe
plan: 01
subsystem: tooling
tags: [typescript, zod, normalization, variants]

requires:
  - phase: 12-source-contracts-and-fetch-harness
    provides: SourceRow and SourceStatus contracts plus fixture source rows
provides:
  - Candidate evidence, identity, and snapshot contracts
  - Deterministic title and artist key helpers
  - Variant/noise marker detection with stable warning codes
affects: [NORM-01, NORM-03, NORM-04, phase-13]

tech-stack:
  added: []
  patterns:
    - Candidate evidence reuses Phase 12 SourceRowSchema to preserve raw fields
    - Title identity includes canonical title key, base title key, and explicit variant signature
    - Variant markers surface as stable warning codes

key-files:
  created:
    - packages/hot-songs/src/normalize/contracts.ts
    - packages/hot-songs/src/normalize/text.ts
    - packages/hot-songs/src/normalize/variants.ts
    - packages/hot-songs/src/test/normalize.test.ts
  modified: []

key-decisions:
  - "Candidate evidence contracts reuse SourceRowSchema instead of copying or narrowing raw source row fields."
  - "Variant signature is part of identity so variant rows do not merge silently with original versions."
  - "Normalization stays deterministic and conservative: no translation, romanization, fuzzy matching, or alias inference."

patterns-established:
  - "normalizeTitleIdentity() returns canonicalTitleKey, baseTitleKey, variantSignature, and warnings together."
  - "normalizeArtistKeys() deduplicates and sorts canonical artist keys for stable grouping."
  - "detectVariantWarnings() owns warning-code detection while stripVariantMarkers() supports base key generation."

requirements-completed: [NORM-01, NORM-03, NORM-04]

duration: 3m
completed: 2026-05-10
---

# Phase 13 Plan 01: Candidate Contracts and Normalization Summary

**Candidate snapshot contracts plus deterministic title/artist normalization and variant warning detection**

## Performance

- **Duration:** 3m
- **Started:** 2026-05-10T06:40:16Z
- **Completed:** 2026-05-10T06:43:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `CandidateEvidenceSchema`, `CandidateIdentitySchema`, and `CandidateSnapshotSchema` with schema version `hot-songs.candidate-snapshot.v1`.
- Added normalization helpers for search text, artist keys, sorted artist key sets, and title identity parts.
- Added variant detection for Live, DJ, Remix, accompaniment, cover, clip, gender-version, and version markers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add candidate identity contracts** - `8a5346e` (feat)
2. **Task 2: Add text normalization and variant detection** - `2503d4e` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `packages/hot-songs/src/normalize/contracts.ts` - Candidate evidence, identity, and snapshot contracts.
- `packages/hot-songs/src/normalize/text.ts` - Deterministic title/artist normalization helpers.
- `packages/hot-songs/src/normalize/variants.ts` - Variant marker detection and stripping helpers.
- `packages/hot-songs/src/test/normalize.test.ts` - Contract, normalization, artist key, and variant tests.

## Decisions Made

- Reused Phase 12 `SourceRowSchema` for candidate evidence to avoid losing raw source fields.
- Kept `baseTitleKey` separate from `canonicalTitleKey`; the base key supports later review/scoring, but grouping can still include `variantSignature`.
- Used stable warning codes such as `variant-live` rather than localized prose so later scoring/export can consume them.

## Verification

- `pnpm -F @home-ktv/hot-songs test -- src/test/normalize.test.ts` - passed, 6 files / 30 tests.
- `pnpm -F @home-ktv/hot-songs typecheck` - passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TDD RED runs failed as expected before `normalize/contracts.ts`, `normalize/text.ts`, and `normalize/variants.ts` existed.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

13-02 can group Phase 12 source rows with `normalizeTitleIdentity()` and `normalizeArtistKeys()` while preserving raw evidence through the candidate contracts.

## Self-Check: PASSED

- Found candidate contracts: `packages/hot-songs/src/normalize/contracts.ts`
- Found text normalization helpers: `packages/hot-songs/src/normalize/text.ts`
- Found variant detection helpers: `packages/hot-songs/src/normalize/variants.ts`
- Found task commit: `8a5346e`
- Found task commit: `2503d4e`

---
*Phase: 13-normalization-and-dedupe*
*Completed: 2026-05-10*
