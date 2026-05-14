---
phase: 12-contract-schema-and-playback-risk-spike
verified: 2026-05-13T23:35:00Z
status: passed
score: 4/4 must-haves verified
requirements:
  - MEDIA-01
  - MEDIA-02
  - MEDIA-03
  - MEDIA-04
source:
  - .planning/phases/12-contract-schema-and-playback-risk-spike/12-01-SUMMARY.md
  - .planning/phases/12-contract-schema-and-playback-risk-spike/12-02-SUMMARY.md
  - .planning/phases/12-contract-schema-and-playback-risk-spike/12-03-SUMMARY.md
  - .planning/phases/12-contract-schema-and-playback-risk-spike/12-04-SUMMARY.md
  - .planning/phases/12-contract-schema-and-playback-risk-spike/12-05-SUMMARY.md
  - .planning/phases/12-contract-schema-and-playback-risk-spike/12-06-SUMMARY.md
---

# Phase 12: Contract, Schema, and Playback-Risk Spike Verification Report

**Phase Goal:** System can represent real MV files and their playback risks with platform-neutral catalog/player contracts before ingestion expands.
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | One physical MKV/MPG/MPEG file is represented as one song candidate / asset identity, without duplicate song records for the same file. | VERIFIED | 12-01 establishes the one-file real-MV domain contract; 12-02 persists the additive schema fields; 12-06 records real samples as valid library inputs rather than split identities. |
| 2 | Real MV files expose playable, review-required, or unsupported outcomes with explicit reasons when not queueable. | VERIFIED | 12-03 introduces the pure compatibility evaluator and 12-05/12-06 record playback-risk evidence with concrete browser capability and switching messages. |
| 3 | Source media facts are preserved with provenance for container, duration, video codec, audio tracks, file size, and metadata source. | VERIFIED | 12-02 maps durable JSONB media fields; 12-03 normalizes ffprobe payloads into `MediaInfoSummary` and `MediaInfoProvenance`; 12-06 records sample facts. |
| 4 | Catalog and player payloads expose platform-neutral playback profile and audio-track fields that the current TV player and a future Android TV player can both reuse. | VERIFIED | 12-04 adds `playbackProfile` and `selectedTrackRef`; 12-05 verifies browser capability inspection without Android-specific contracts; 12-06 preserves the same boundary in user sample evidence. |

### Required Artifacts

| Artifact | Status | Notes |
|---|---|---|
| `12-01-SUMMARY.md` | VERIFIED | Shared real-MV domain contracts and exact status values. |
| `12-02-SUMMARY.md` | VERIFIED | Additive PostgreSQL schema and repository mapping for real-MV fields. |
| `12-03-SUMMARY.md` | VERIFIED | MediaInfo normalization, provenance, MIME inference, and compatibility evaluator. |
| `12-04-SUMMARY.md` | VERIFIED | `PlaybackTarget` profile and selected track ref contract. |
| `12-05-SUMMARY.md` | VERIFIED | Controlled playback-risk spike harness and detached browser capability inspection. |
| `12-06-SUMMARY.md` | VERIFIED | Real sample evidence for one MKV and one MPG/MPEG file. |
| `apps/api/src/modules/media/real-mv-compatibility.ts` | VERIFIED | Produces locked compatibility statuses and reasons. |
| `packages/player-contracts/src/index.ts` | VERIFIED | Exposes platform-neutral playback payload fields. |
| `scripts/real-mv-playback-risk-spike.mjs` | VERIFIED | Records controlled and sample-based playback-risk evidence. |

## Requirement Coverage

| Requirement | Status | Final Evidence |
|---|---|---|
| MEDIA-01 | SATISFIED | One physical file remains one candidate / asset identity across the Phase 12 contract and schema flow. |
| MEDIA-02 | SATISFIED | Compatibility evaluator, browser-capability helper, and sample evidence distinguish playable, review-required, and unsupported outcomes. |
| MEDIA-03 | SATISFIED | MediaInfo summary, provenance, and sample facts persist through the durable contract. |
| MEDIA-04 | SATISFIED | PlaybackTarget carries platform-neutral track selection and playback profile fields without an Android-specific runtime. |

## Verification Checks

- `pnpm --filter @home-ktv/api exec vitest run src/test/real-mv-domain-contracts.test.ts src/test/real-mv-schema.test.ts src/test/catalog-contracts.test.ts src/test/real-mv-media-contracts.test.ts src/test/import-scanner.test.ts src/test/build-playback-target.test.ts` - passed, 6 files / 46 tests.
- `pnpm -F @home-ktv/domain typecheck` - passed.
- `pnpm -F @home-ktv/player-contracts typecheck` - passed.
- `pnpm -F @home-ktv/api typecheck` - passed.
- `pnpm --filter @home-ktv/tv-player exec vitest run src/test/playback-capability.test.ts` - passed, 1 file / 3 tests.
- `node --test scripts/real-mv-playback-risk-spike.test.mjs` - passed, 4 tests.

## Gaps Summary

No gaps remain for MEDIA-01 through MEDIA-04.

## Verdict

Phase 12 is verified and ready to support milestone closure.
