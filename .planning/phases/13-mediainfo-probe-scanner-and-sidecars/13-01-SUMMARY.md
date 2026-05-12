---
phase: 13-mediainfo-probe-scanner-and-sidecars
plan: 01
subsystem: api
tags: [ingest, scanner, real-mv, sidecars, ffprobe]

requires:
  - phase: 12-real-mv-media-contracts
    provides: "Single-asset real MV import direction and MediaInfo-backed contract expectations"
provides:
  - "Scanner discovery for .mkv, .mpg, and .mpeg real MV files"
  - "Same-stem cover and song.json sidecar discovery with artifact-aware change signatures"
  - "Retryable pending scanner records for unstable real MV files"
affects: [phase-13, import-scanner, candidate-builder, admin-import-review]

tech-stack:
  added: []
  patterns:
    - "Pure real MV sidecar helper separated from scanner orchestration"
    - "Scanner probe payloads carry realMv sidecars and scannerReasons for later candidate review"
    - "Injectable file stability check keeps unstable-file tests deterministic"

key-files:
  created:
    - apps/api/src/modules/ingest/real-mv-sidecars.ts
  modified:
    - apps/api/src/modules/ingest/import-scanner.ts
    - apps/api/src/test/import-scanner.test.ts

key-decisions:
  - "Real MV scanner identity combines media quick hash with artifact signatures so sidecar changes trigger reconciliation."
  - "Unstable real MV files are persisted as pending with scannerReasons instead of being probed or silently skipped."

patterns-established:
  - "Real MV sidecar artifacts are root-relative serialized facts, never absolute paths."
  - "Generic song.json is treated as a real MV sidecar only when its directory has exactly one real MV media file."
  - "Unstable real MV quickHash uses stat data plus artifact signature to avoid reading partially written media content."

requirements-completed: [SCAN-01, SCAN-02, SCAN-03, SCAN-05]

duration: 37 min
completed: 2026-05-12
---

# Phase 13 Plan 01: Scanner Real MV Discovery Summary

**Real MV import scanner support for MKV/MPG/MPEG media, adjacent sidecars, artifact-aware rescans, and pending unstable files**

## Performance

- **Duration:** 37 min
- **Started:** 2026-05-12T10:01:54Z
- **Completed:** 2026-05-12T10:38:17Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `real-mv-sidecars.ts` to discover same-stem cover images and `song.json` metadata without exposing absolute paths.
- Extended import discovery to treat `.mpg` and `.mpeg` as real MV media while keeping sidecars out of standalone candidate inputs.
- Added artifact signatures to real MV quick hashes so cover or sidecar changes trigger scanner reconciliation.
- Added an injectable stability check and pending persistence path for unstable real MV files with `file-unstable` scanner reasons.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add real MV sidecar discovery helpers** - `e156ea3` (feat)
2. **Task 2: Extend scanner discovery and change signatures** - `4b76d7a` (feat)
3. **Task 3: Add lightweight unstable-file guard** - `fb80049` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `apps/api/src/modules/ingest/real-mv-sidecars.ts` - Real MV media extension detection, sibling sidecar discovery, and artifact signature generation.
- `apps/api/src/modules/ingest/import-scanner.ts` - Scanner integration for real MV extensions, sidecars, artifact-aware quick hashes, and unstable-file pending records.
- `apps/api/src/test/import-scanner.test.ts` - Coverage for sidecar discovery, MPG/MPEG scanning, artifact quickHash changes, sidecar filtering, and unstable pending behavior.

## Decisions Made

- Real MV artifact changes are part of the persisted `quickHash` so rescans detect cover and `song.json` updates without needing separate watcher logic.
- Unstable files bypass ffprobe and content quick hashing, then persist as pending records with `realMv.scannerReasons` so review flows can surface retryable import problems.
- Stability checking is injectable for tests, with the production helper comparing two stat snapshots separated by a short delay.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Typecheck caught that using `ReturnType<typeof stat>` widened `Stats.size` to `number | bigint` in the unstable quick hash helper. The helper was narrowed to the fields actually used: `{ size: number; mtimeMs: number }`.

## Verification

- `pnpm -F @home-ktv/api test -- src/test/import-scanner.test.ts` — 30 files passed, 161 tests passed.
- `pnpm -F @home-ktv/api typecheck` — exited 0.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Scanner-level real MV file and sidecar facts are now available for metadata normalization in Plan 13-02. Candidate integration still needs the metadata helpers and CandidateBuilder wiring from later plans before Admin review can show all real MV context.

---
*Phase: 13-mediainfo-probe-scanner-and-sidecars*
*Completed: 2026-05-12*
