---
phase: 12-contract-schema-and-playback-risk-spike
plan: 06
subsystem: testing
tags: [real-mv, playback-risk, samples, ffprobe, browser-capability]

requires:
  - phase: 12-contract-schema-and-playback-risk-spike
    provides: Controlled playback-risk harness from 12-05
provides:
  - User sample playback-risk evidence for one MKV and one MPG/MPEG file
affects: [phase-13-scanner, phase-15-playback]

tech-stack:
  added: []
  patterns:
    - User-provided sample evidence recorded as Markdown under .planning

key-files:
  created:
    - .planning/phases/12-contract-schema-and-playback-risk-spike/12-PLAYBACK-RISK-SAMPLES.md
  modified: []

key-decisions:
  - "Real MV sample evidence uses the user-provided MKV and MPG/MPEG files under songs-sample."
  - "The samples are valid library inputs, but current browser playback remains unsupported in this spike run."

patterns-established:
  - "Evidence records probe summary, browser capability, compatibility decision, and switching risk message."

requirements-completed: [MEDIA-02, MEDIA-04]

duration: 6min
completed: 2026-05-12
---

# Phase 12-06: User Real-Sample Playback-Risk Evidence Summary

**User-provided MKV and MPG/MPEG samples now have recorded probe facts and playback-risk evidence for Phase 12.**

## Performance

- **Duration:** 6 min elapsed
- **Started:** 2026-05-12T04:12:57Z
- **Completed:** 2026-05-12T04:18:57Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Recorded Phase 12 sample evidence for one MKV and one MPG/MPEG file from `songs-sample/`.
- Captured container, duration, video codec, resolution, file size, and audio-track details for both samples.
- Captured browser capability state and the exact switching-risk message when audio-track switching could not be verified.
- Classified both samples as `unsupported` for the current browser spike run while keeping them valid as real-library inputs.

## Task Commits

1. **Task 1: Record real MKV and MPG/MPEG playback-risk sample evidence** - not committed separately; recorded in `.planning/phases/12-contract-schema-and-playback-risk-spike/12-PLAYBACK-RISK-SAMPLES.md`

## Files Created/Modified

- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-PLAYBACK-RISK-SAMPLES.md` - Final real-sample playback-risk evidence.

## Decisions Made

- Kept the evidence file focused on probe facts, browser capability, compatibility decision, and switching risk rather than adding implementation code.
- Treated the samples as correct real MV inputs even though current browser probing did not confirm playable support.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Browser capability probing in this local run did not return usable `canPlayType` JSON, so the report records `unsupported` evidence with the exact switching-risk message.

## Verification

Verified the two sample files with ffprobe and validated the evidence file with rg checks for headings, probe fields, browser capability fields, compatibility status, and the switching-risk message.

## User Setup Required

None - the user already provided the sample files in `songs-sample/`.

## Next Phase Readiness

Phase 12 is complete. The next milestone phase can now use these contracts, schema fields, playback target fields, and sample evidence as its base context.

---
*Phase: 12-contract-schema-and-playback-risk-spike*
*Completed: 2026-05-12*
