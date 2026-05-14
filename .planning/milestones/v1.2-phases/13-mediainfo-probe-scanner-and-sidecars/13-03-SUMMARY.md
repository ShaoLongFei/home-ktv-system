---
phase: 13-mediainfo-probe-scanner-and-sidecars
plan: 03
subsystem: api
tags: [ingest, candidates, real-mv, sidecars, mediainfo]

requires:
  - phase: 13-mediainfo-probe-scanner-and-sidecars
    provides: "Real MV sidecar discovery and metadata draft helpers from Plans 13-01 and 13-02"
provides:
  - "Scanner-side song.json metadata is carried into real MV import files"
  - "One real MV media file creates one reviewable import candidate"
  - "Real MV candidate files preserve dual-track playback intent, track-role guesses, compatibility status, and retry evidence"
  - "Candidate metadata preserves sidecar data, provenance, conflicts, scanner reasons, and cover sidecar references"
affects: [phase-13, admin-import-review, media-compatibility, import-scanner]

tech-stack:
  added: []
  patterns:
    - "Real MV candidate construction branches from demo original/instrumental grouping and treats one media file as one candidate"
    - "Scanner uncertainty is represented as review_required compatibility instead of silently blocking candidate creation"
    - "Admin-facing candidateMeta retains evidence instead of flattening away provenance, conflicts, or retry reasons"

key-files:
  created: []
  modified:
    - apps/api/src/modules/ingest/import-scanner.ts
    - apps/api/src/modules/ingest/candidate-builder.ts
    - apps/api/src/modules/media/real-mv-compatibility.ts
    - apps/api/src/test/import-scanner.test.ts
    - apps/api/src/test/real-mv-media-contracts.test.ts

key-decisions:
  - "Real MV imports always produce a visible review candidate when scanner facts are present, even when the file is pending or has warning reasons."
  - "Scanner-time browser support remains unknown, so real MV compatibility stays review_required unless later runtime evidence proves playability."
  - "Scanner reasons are copied both into candidateMeta and file compatibilityReasons so Admin can show retry/review context at both levels."

patterns-established:
  - "CandidateBuilder consumes `probePayload.realMv` as the typed boundary between scanner discovery and Admin import review."
  - "Single-file real MV assets use `dual-track-video`, `proposedVocalMode: dual`, and a `single_file_audio_tracks` playback profile."
  - "Metadata provenance and conflicts stay inside `candidateMeta.realMv` for later review UI and admission workflows."

requirements-completed: [SCAN-01, SCAN-03, SCAN-04, SCAN-05]

duration: 60 min
completed: 2026-05-12
---

# Phase 13 Plan 03: Real MV Candidate Integration Summary

**Scanner-enriched real MV files now become one reviewable dual-track import candidate with metadata evidence preserved**

## Performance

- **Duration:** 60 min
- **Started:** 2026-05-12T19:25:37+08:00
- **Completed:** 2026-05-12T20:25:51+08:00
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- Wired adjacent `song.json` parsing into scanner probe payloads with safe invalid/read-failure scanner reasons.
- Added single-file real MV candidate creation that fills title, artist, language, genre, tags, aliases, search hints, and release year from the merged metadata draft.
- Added dual-track playback intent, audio track-role inference, and conservative review-required compatibility when runtime support or track roles are uncertain.
- Preserved metadata sources, conflicts, sidecar metadata, scanner reasons, and cover sidecar references in `candidateMeta.realMv`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire discovered song.json into real MV probe payloads** - `3cd7c1a` (feat)
2. **Task 2: Build one candidate per real MV media file** - `da94fdc` (feat)
3. **Task 3: Populate playback profile, track roles, and compatibility** - `2289785` (feat)
4. **Task 4: Preserve provenance, conflicts, sidecar data, and retry reasons in candidateMeta** - `68083ff` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `apps/api/src/modules/ingest/import-scanner.ts` - Reads same-stem `song.json` sidecars and attaches parsed metadata or scanner reasons to real MV probe payloads.
- `apps/api/src/modules/ingest/candidate-builder.ts` - Builds one candidate per real MV file and carries playback, compatibility, provenance, conflicts, and sidecar evidence forward.
- `apps/api/src/modules/media/real-mv-compatibility.ts` - Adds track role inference and single-file audio-track playback profile helpers.
- `apps/api/src/test/import-scanner.test.ts` - Covers scanner sidecars, real MV candidate construction, review evidence, and visible pending candidates.
- `apps/api/src/test/real-mv-media-contracts.test.ts` - Covers real MV playback intent and conservative compatibility behavior.

## Decisions Made

- Pending or warning-bearing real MV files remain visible as `review_required` candidates so Admin can inspect and retry them.
- Scanner compatibility does not claim browser playability; it records unknown runtime support and waits for a later evidence source.
- File-level compatibility reasons mirror scanner reasons so review UI does not need to parse candidate metadata just to show warnings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/import-scanner.test.ts src/test/real-mv-media-contracts.test.ts` - passed, 31 test files / 181 tests.
- `pnpm -F @home-ktv/api typecheck` - passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Real MV candidate state now contains enough scanner, metadata, sidecar, and playback evidence for Plan 13-04 to expose it through the Admin API and render a compact Import Workbench preview.

---
*Phase: 13-mediainfo-probe-scanner-and-sidecars*
*Completed: 2026-05-12*
