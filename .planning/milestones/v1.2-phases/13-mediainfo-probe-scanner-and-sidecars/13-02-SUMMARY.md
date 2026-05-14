---
phase: 13-mediainfo-probe-scanner-and-sidecars
plan: 02
subsystem: api
tags: [ingest, metadata, real-mv, sidecars, mediainfo]

requires:
  - phase: 13-mediainfo-probe-scanner-and-sidecars
    provides: "Real MV sidecar discovery and scanner-side artifact payloads from Plan 13-01"
provides:
  - "Safe parsing for same-stem song.json sidecars"
  - "Conservative filename fallback metadata for common real MV naming patterns"
  - "Metadata draft assembly with provenance and conflict preservation for Admin review"
affects: [phase-13, import-scanner, candidate-builder, admin-import-review]

tech-stack:
  added: []
  patterns:
    - "Sidecar JSON is parsed with narrow validation and warning reasons instead of hard scan failures"
    - "Real MV identity metadata is assembled from MediaInfo, filename hints, and sidecar metadata with explicit source provenance"
    - "Conflicting identity fields are preserved in metadataConflicts for later review rather than overwritten silently"

key-files:
  created:
    - apps/api/src/modules/ingest/real-mv-metadata.ts
  modified:
    - apps/api/src/test/real-mv-metadata.test.ts

key-decisions:
  - "Invalid sidecar JSON and schema mismatches become scanner warnings with stable reason codes instead of scan failures."
  - "Filename parsing stays conservative: it fills obvious artist/title/language/genre hints but does not guess aliases or translations."
  - "MediaInfo technical facts are always tagged as mediainfo sources, while identity fields retain source provenance and conflicts."

patterns-established:
  - "Real MV metadata helpers are pure and reusable across scanner and candidate-building boundaries."
  - "Filename fallback only accepts familiar `artist-title-language-genre` shapes and returns a title-only fallback when ambiguous."
  - "Metadata assembly records field-by-field source labels so Admin review can reason about provenance."

requirements-completed: [SCAN-03, SCAN-04, SCAN-05]

duration: 20 min
completed: 2026-05-12
---

# Phase 13 Plan 02: Real MV Metadata Draft Summary

**Safe sidecar parsing, conservative filename fallback, and provenance-preserving metadata draft assembly for real MV review**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-12T10:56:57Z
- **Completed:** 2026-05-12T11:16:34Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `parseRealMvSidecarJson` with narrow validation and scanner warning codes for invalid JSON or invalid schema.
- Added conservative `parseRealMvFilename` support for common MV filename shapes without aggressive inference.
- Added `buildRealMvMetadataDraft` to merge MediaInfo, filename, and sidecar metadata while preserving source provenance, conflicts, and scanner reasons.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sidecar song.json schema and parser** - `efd3d6b` (feat)
2. **Task 2: Add conservative filename parser** - `513c989` (feat)
3. **Task 3: Merge metadata with provenance and conflicts** - `d243321` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `apps/api/src/modules/ingest/real-mv-metadata.ts` - Sidecar schema, filename parser, metadata draft assembly, and provenance/conflict helpers.
- `apps/api/src/test/real-mv-metadata.test.ts` - Coverage for sidecar parsing, filename fallback, source precedence, conflicts, and scanner reasons.

## Decisions Made

- Sidecar validation stays warning-only so malformed `song.json` can be retried without blocking scans.
- Filename metadata is intentionally conservative; unknown or ambiguous names fall back to title-only instead of guessed identity.
- Source provenance is recorded field by field so later scanner and Admin stages can show how each value was derived.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Real MV metadata helpers are ready for scanner integration in Plan 13-03. The next step is to feed parsed sidecar data into candidate construction and carry the metadata draft into the Admin-facing candidate state.

---
*Phase: 13-mediainfo-probe-scanner-and-sidecars*
*Completed: 2026-05-12*
