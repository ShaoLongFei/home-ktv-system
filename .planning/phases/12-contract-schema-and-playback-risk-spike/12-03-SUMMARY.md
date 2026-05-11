---
phase: 12-contract-schema-and-playback-risk-spike
plan: 03
subsystem: api
tags: [ffprobe, real-mv, media-summary, mime, compatibility]

requires:
  - phase: 12-contract-schema-and-playback-risk-spike
    provides: Shared domain contracts from 12-01 and durable schema/repository fields from 12-02
provides:
  - MediaInfo-style ffprobe summary and provenance extraction
  - Candidate probe summaries without raw streams or format payloads
  - MKV/MPG/MPEG content-type inference
  - Pure real-MV compatibility evaluator with structured reasons
affects: [phase-13-scanner, phase-14-review, phase-15-playback, phase-12-risk-spike]

tech-stack:
  added: []
  patterns:
    - Pure compatibility evaluation with locked Phase 12 status values
    - Probe raw payload remains debug storage while candidate summaries expose normalized facts only

key-files:
  created:
    - apps/api/src/modules/media/real-mv-compatibility.ts
    - apps/api/src/test/real-mv-media-contracts.test.ts
  modified:
    - apps/api/src/modules/ingest/media-probe.ts
    - apps/api/src/modules/ingest/candidate-builder.ts
    - apps/api/src/modules/assets/asset-gateway.ts
    - apps/api/src/test/import-scanner.test.ts

key-decisions:
  - "ffprobe facts are normalized into MediaInfoSummary and MediaInfoProvenance before becoming candidate-facing contract data."
  - "Candidate probeSummary no longer spreads raw probePayload, so raw streams and format stay out of durable candidate summaries."
  - "Browser playback support and track-role completeness are evaluated by one pure real-MV compatibility function."

patterns-established:
  - "Track ids use stream.id when available and fall back to stream-${stream.index ?? fallbackIndex}."
  - "Real MV MIME inference is explicit for MKV and MPEG containers while preserving existing webm/m4v/mp4 behavior."

requirements-completed: [MEDIA-02, MEDIA-03]

duration: 10min
completed: 2026-05-11
---

# Phase 12-03: Probe Summary, MIME, and Compatibility Evaluator Summary

**Probe output now becomes normalized media facts and compatibility risk signals instead of leaking raw ffprobe payloads into candidate/player contracts.**

## Performance

- **Duration:** 10 min elapsed
- **Started:** 2026-05-11T08:08:24Z
- **Completed:** 2026-05-11T08:18:21Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `buildMediaInfoSummaryFromFfprobe` to produce `MediaInfoSummary` and `MediaInfoProvenance` from ffprobe format/stream data.
- Updated `probeMediaFile` to include normalized media summary/provenance while keeping raw payload as debug-only data.
- Updated CandidateBuilder so candidate `probeSummary` exposes duration, probe status, normalized media summary, and provenance only.
- Added explicit MKV/MPG/MPEG content-type inference for streaming real MV files.
- Added `evaluateRealMvCompatibility` with structured error/warning reasons and locked status outputs.

## Task Commits

1. **Task 1: Normalize ffprobe facts into standard summary and provenance** - included in `feat(12-03): normalize real MV probe facts`
2. **Task 2: Add container MIME inference and pure compatibility evaluator** - included in `feat(12-03): normalize real MV probe facts`

## Files Created/Modified

- `apps/api/src/modules/ingest/media-probe.ts` - Extracts MediaInfo-style facts and provenance from ffprobe payloads.
- `apps/api/src/modules/ingest/candidate-builder.ts` - Stops spreading raw probe payload into candidate summaries and forwards normalized media fields.
- `apps/api/src/modules/assets/asset-gateway.ts` - Exports MIME inference and maps `.mkv`, `.mpg`, and `.mpeg`.
- `apps/api/src/modules/media/real-mv-compatibility.ts` - Evaluates playback compatibility and review/unsupported reasons.
- `apps/api/src/test/real-mv-media-contracts.test.ts` - Covers probe normalization, MIME mapping, and compatibility status behavior.
- `apps/api/src/test/import-scanner.test.ts` - Verifies candidate summaries exclude raw `streams` and `format`.

## Decisions Made

- Kept raw ffprobe payload only in `import_files.probe_payload`; candidate summaries use normalized durable fields.
- Treated empty browser `canPlayType` as `unsupported`, missing instrumental mapping as `review_required`, and `"probably"` with no reasons as `playable`.
- Did not add ingestable or platform-specific statuses; evaluator returns only the four Phase 12 values.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Typecheck required the test probe mock to include the new `mediaInfoSummary` and `mediaInfoProvenance` fields because `MediaProbeSummary` now includes those fields.
- CandidateBuilder needed typed guards for `mediaInfoSummary` and `mediaInfoProvenance` so repository input types remain explicit instead of passing generic records.

## Verification

- `pnpm --filter @home-ktv/api exec vitest run src/test/real-mv-media-contracts.test.ts src/test/import-scanner.test.ts`
- `pnpm -F @home-ktv/api typecheck`
- Acceptance grep checks for probe summary/provenance contracts, fallback stream ids, CandidateBuilder raw payload exclusion, MIME mappings, evaluator reasons, and absence of platform-specific evaluator terms.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-04 can now attach platform-neutral playback profile and selected track references to PlaybackTarget using normalized asset media facts and compatibility state.

---
*Phase: 12-contract-schema-and-playback-risk-spike*
*Completed: 2026-05-11*
