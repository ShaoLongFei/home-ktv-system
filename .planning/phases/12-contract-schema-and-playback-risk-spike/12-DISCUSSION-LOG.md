# Phase 12: Contract, Schema, and Playback-Risk Spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 12-contract-schema-and-playback-risk-spike
**Areas discussed:** compatibility status model, real MV asset model, metadata summary, playback target contract, playback risk spike

---

## Gray Areas Selected

User selected: all areas.

| Area | Why It Mattered |
|------|-----------------|
| Compatibility status model | Determines which real MV files can be queued versus kept in review/preprocessing. |
| Audio-track contract semantics | Determines whether real MV uses two logical assets or one asset with track mapping. |
| MediaInfo metadata scope | Determines durable schema size and debuggability. |
| Playback risk validation | Determines how Phase 12 proves playback and switch feasibility. |

---

## Initial Batch

| Decision | Option | Description | Selected |
|----------|--------|-------------|----------|
| Compatibility state | Layered model | `ingestable`, `playable`, `queueable`, `switchable` separately | |
| Compatibility state | Single status | One `compatibilityStatus` for overall usability | ✓ |
| Compatibility state | Conservative gate | No queue before real TV verification | |
| Asset model | Two logical assets | One physical file, two logical assets with `audioTrackIndex` | |
| Asset model | Single asset | One asset stores both track roles; target selects audio track | ✓ |
| Asset model | Record facts only | Phase 12 defers asset model | |
| Metadata scope | Summary + provenance + raw | Keep raw probe payload durably | |
| Metadata scope | Standard summary only | Durable standard summary without raw payload | ✓ |
| Metadata scope | Raw outside catalog | Summary in DB, raw in logs/temp only | |
| Playback validation | Fixtures + real samples | Automated fixtures plus user-provided MV samples | ✓ |
| Playback validation | Fixtures only | Real samples later | |
| Playback validation | Real samples only | Less fixture coverage | |

**User's choice:** `2,2,2,1`

**Notes:** The selected single Asset model conflicts with older roadmap/research wording that assumed two logical assets. User explicitly confirmed this should change.

---

## Asset Model Confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm single Asset model | One physical MV -> one Asset with track mapping | ✓ |
| Return to two logical Assets | Preserve earlier roadmap assumption | |
| Contract supports both | More flexible but more complex | |

**User's choice:** Confirm single Asset model.

---

## Field And Behavior Batch

| Decision | Option | Description | Selected |
|----------|--------|-------------|----------|
| `compatibilityStatus` values | `unknown / review_required / playable / unsupported` | Simple Phase 12 status set | ✓ |
| `compatibilityStatus` values | `unknown / ingestable / playable / switchable / unsupported` | Finer single-field model | |
| `compatibilityStatus` values | `pending_probe / pending_tv_test / playable / unsupported / failed` | More workflow-state oriented | |
| Track mapping fields | `trackRoles` | `{ original: trackRef, instrumental: trackRef }` with index/id/label | ✓ |
| Track mapping fields | `audioTracks[]` with `vocalMode` | Roles attached to each track | |
| Track mapping fields | direct track index fields | `originalTrackIndex` / `instrumentalTrackIndex` only | |
| Switch failure behavior | Keep playing and show unsupported switch message | Non-disruptive fallback | ✓ |
| Switch failure behavior | Mark song needs preprocessing | Hide future switching after failure | |
| Switch failure behavior | Reload same file into target track | More aggressive runtime recovery | |
| Real sample validation | 1 MKV and 1 MPG/MPEG | Prefer both with two tracks | ✓ |
| Real sample validation | One common format only | Narrower initial sample | |
| Real sample validation | No real sample in Phase 12 | Defer acceptance | |

**User's choice:** `1,1,1,1`

---

## Final Contract Batch

| Decision | Option | Description | Selected |
|----------|--------|-------------|----------|
| MediaInfo summary fields | Container, duration, video codec, resolution, audio index/id/label/language/codec/channels | Complete standard summary | ✓ |
| MediaInfo summary fields | Minimal summary | Container, duration, audio index/label only | |
| MediaInfo summary fields | Planner decides | Context only requires enough for review | |
| Playback target fields | `playbackProfile` and `selectedTrackRef` | Explicit platform-neutral target intent | ✓ |
| Playback target fields | `selectedAudioTrackIndex` only | Simpler but less stable | |
| Playback target fields | No target change | Hide selection in asset metadata | |
| Roadmap/requirements wording | Record that planning must replace double-asset wording | Align docs with selected model | ✓ |
| Roadmap/requirements wording | Only note preference in CONTEXT | Leave conflict unresolved | |
| Roadmap/requirements wording | Keep both | Planner weighs later | |
| Android TV reservation | Platform-neutral fields only | No Android-specific schema yet | ✓ |
| Android TV reservation | Add Android compatibility field | `unknown/candidate` now | |
| Android TV reservation | Ignore Android for now | Add later | |

**User's choice:** `1,1,1,1`

---

## the agent's Discretion

- Exact TypeScript names, migration structure, and test organization.
- Whether source track ids map to MediaInfo stream ids, UIDs, or another stable extracted identifier.

## Deferred Ideas

- Android TV native player.
- Automatic transcoding/remuxing.
- Full sidecar scanner, Admin review UI, and playback integration in later phases.
