# Phase 14: Admin Review and Catalog Admission - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 14-admin-review-and-catalog-admission
**Areas discussed:** Approval gate, audio-track role mapping, post-approval status, formal song.json, unsupported/incomplete candidates

---

## Approval Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Title/artist/language plus confirmed dual roles | Require title, artist, language, optional cover, confirmed original and instrumental roles, and non-unsupported compatibility before approval. | |
| Core metadata plus at least one playable track | Allow approval with core metadata and at least one playable track, keeping unresolved items as review-required. | |
| Strict complete package | Require cover, complete sidecar, confirmed dual tracks, and playable compatibility. | |
| User-defined light gate | Only song title and artist name are hard approval blockers. | ✓ |

**User's choice:** Only song title and artist name are required.
**Notes:** Language, cover, full sidecar, and manual track-role confirmation should stay visible/editable but not block approval by themselves.

---

## Audio-Track Role Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Full track table | Show all audio tracks and let Admin choose original/instrumental/ignore for each. | |
| Two dropdowns | Admin selects original and instrumental from two dropdowns. | |
| System auto-guessing | Scanner/system guesses default original and instrumental track roles; Admin corrects when needed. | ✓ |

**User's choice:** System auto-guesses audio-track roles.
**Notes:** Raw audio-track facts should remain visible. Planner should add review warnings and correction controls for ambiguous or unsafe guesses.

---

## Post-Approval Status

| Option | Description | Selected |
|--------|-------------|----------|
| Always review_required first | Approved songs/assets stay review_required until Phase 15 runtime validation. | |
| Direct ready unless unsupported | Approved songs/assets become ready whenever they are not unsupported. | |
| Scanner compatibility decides | Use scanner compatibility to decide ready versus review_required; unsupported stays out of ready flow. | ✓ |

**User's choice:** Decide ready/review_required based on scanner compatibility.
**Notes:** Phase 14 still must not claim runtime playback or switching verification. Phase 15 will handle runtime validation.

---

## Formal `song.json`

| Option | Description | Selected |
|--------|-------------|----------|
| Full durable contract | Write media path, cover path, single asset, track roles, MediaInfo, provenance, playback profile, compatibility, and catalog metadata. | ✓ |
| Minimal playback fields | Write only playback-required fields and leave rich metadata in DB. | |
| DB-primary export | Treat DB as source of truth and song.json mainly as export/restore metadata. | |

**User's choice:** Write the full durable contract.
**Notes:** Validator must understand single real-MV asset shape and stop requiring the legacy two-asset switch pair for real-MV songs.

---

## Unsupported And Incomplete Candidates

| Option | Description | Selected |
|--------|-------------|----------|
| Visible with guidance | Keep candidates visible, block approve when truly unsupported, show repair/preprocess guidance and retry scan. | ✓ |
| Force unavailable admission | Allow force-admission as unavailable/review_required. | |
| Hold/reject only | Only allow hold or reject; never admit incomplete candidates. | |

**User's choice:** Keep candidates visible, do not allow approve, and show clear repair/preprocess guidance plus retry path.
**Notes:** Unsupported/incomplete candidates must not block other candidates.

---

## the agent's Discretion

- Exact auto-guessing heuristics and UI pattern for track-role correction.
- Exact repair guidance copy and layout.
- Exact helper/type names for the single real-MV admission path.

## Deferred Ideas

- Search, queue, TV playback, and runtime switching are Phase 15.
- Automatic transcoding/remuxing is outside v1.2.
- Native Android TV is a later milestone.
