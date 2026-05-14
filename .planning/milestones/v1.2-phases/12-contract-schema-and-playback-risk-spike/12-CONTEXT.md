# Phase 12: Contract, Schema, and Playback-Risk Spike - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 defines the real-MV catalog/player contracts before ingestion expands. It must let the system represent one MKV/MPG/MPEG file, its media facts, its compatibility status, and selected audio-track playback intent. This phase does not build full scanner sidecar behavior, Admin review UI, search/queue playback completion, automatic transcoding, or native Android TV playback.

</domain>

<decisions>
## Implementation Decisions

### Compatibility Status
- **D-01:** Use a single `compatibilityStatus` field for the Phase 12 contract, not separate layered booleans.
- **D-02:** The allowed status set is `unknown`, `review_required`, `playable`, and `unsupported`.
- **D-03:** `compatibilityStatus` represents overall queue/playback readiness at the current stage; detailed causes should live in structured unsupported/review reasons rather than as extra top-level states.

### Real MV Asset Model
- **D-04:** Use a single real-MV `Asset` for one physical MV file. Do not model original and accompaniment as two logical Asset rows.
- **D-05:** Store original/accompaniment mapping inside the asset as `trackRoles: { original: trackRef, instrumental: trackRef }`.
- **D-06:** Each `trackRef` should carry at least index/id/label so the system can preserve both stable references and human-readable source labels.
- **D-07:** Phase 12 planning must treat older "two logical Asset" wording as superseded by this single Asset + `trackRoles` decision.

### MediaInfo Summary
- **D-08:** Persist a standard MediaInfo summary, provenance, and reviewed metadata fields; do not persist raw probe payload in the Phase 12 catalog contract.
- **D-09:** The standard summary should include container, duration, video codec, resolution, and audio track index/id/label/language/codec/channels.
- **D-10:** Raw probe output can remain an implementation/debug concern outside the durable domain contract unless a later phase proves it is needed.

### Playback Target Contract
- **D-11:** Extend `PlaybackTarget` with `playbackProfile` and `selectedTrackRef`.
- **D-12:** Do not hide audio-track selection inside asset metadata only; the TV runtime must receive the selected track explicitly.
- **D-13:** Keep Android TV preparation platform-neutral. Do not add Android-specific fields in Phase 12.

### Playback Risk Spike
- **D-14:** Validate playback risk with both controlled fixtures and user-provided real samples.
- **D-15:** User should provide at least one MKV and one MPG/MPEG sample, preferably both with two audio tracks.
- **D-16:** If track switching fails at runtime, keep current playback unchanged and show a clear message such as "current device does not support audio-track switching." Do not reload aggressively or mark the whole song permanently unusable from one switch failure in Phase 12.

### the agent's Discretion
- Exact TypeScript type names, table/column names, migration shape, and test file organization are left to the planner, as long as the public contract follows the decisions above.
- The planner may choose whether `trackRef.id` maps to source track UID, stream id, or another stable extracted identifier, provided `index` remains available for runtime selection.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope
- `.planning/PROJECT.md` — v1.2 milestone goal, constraints, and out-of-scope boundaries.
- `.planning/REQUIREMENTS.md` — v1.2 requirements and traceability.
- `.planning/ROADMAP.md` — Phase 12 boundary and success criteria.
- `.planning/research/SUMMARY.md` — v1.2 research summary and risk framing.

### Existing Contracts
- `packages/domain/src/index.ts` — existing `Song`, `Asset`, `AssetKind`, `VocalMode`, `SwitchQualityStatus`, and related domain types.
- `packages/player-contracts/src/index.ts` — existing `PlaybackTarget`, `SwitchTarget`, and room snapshot contracts.
- `apps/api/src/db/schema.ts` — existing song/asset/playback tables and enum constraints.

### Existing Runtime And Media Flow
- `apps/api/src/modules/playback/build-playback-target.ts` — current backend-authored playback target construction.
- `apps/api/src/modules/playback/build-switch-target.ts` — current switch target construction using counterpart assets.
- `apps/api/src/modules/assets/asset-gateway.ts` — controlled playback URL generation and content-type inference.
- `apps/api/src/routes/media.ts` — byte-range media serving route.
- `apps/api/src/modules/ingest/media-probe.ts` — current ffprobe summary wrapper.
- `apps/api/src/modules/ingest/import-scanner.ts` — current supported media discovery and probing flow.
- `apps/api/src/modules/ingest/candidate-builder.ts` — current path-derived candidate grouping and role inference.
- `apps/tv-player/src/runtime/video-pool.ts` — current dual-video playback/switch runtime.
- `apps/tv-player/src/runtime/switch-controller.ts` — current switch command and rollback behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AssetKind` already includes `dual-track-video`; planner can either reuse that value for real-MV assets or introduce a more specific profile if needed.
- `SwitchQualityStatus` already models `verified`, `review_required`, `rejected`, and `unknown`; it can inform compatibility reasoning but should not replace the new `compatibilityStatus`.
- `AssetGateway` and `/media/:assetId` already provide controlled URLs and byte-range streaming; Phase 12 should extend MIME/contract behavior rather than creating a new media route.
- `probeMediaFile` already wraps `ffprobe`; Phase 12 can define the MediaInfo summary contract and let Phase 13 wire the actual probe implementation.

### Established Patterns
- Backend authors playback targets. TV runtime consumes snapshots and should not infer business state from local asset metadata.
- Existing switching assumes a counterpart asset and dual-video swap. The single Asset + `selectedTrackRef` model intentionally changes that contract for real MV files.
- Existing catalog admission validates switch readiness before marking formal songs ready. Phase 12 should preserve that trust boundary with `compatibilityStatus`.
- Existing `song.json` validation treats assets as durable catalog facts. New track role refs must be represented in a way Phase 14 can write and validate.

### Integration Points
- Domain types: add real-MV media facts, `compatibilityStatus`, track summary, `trackRoles`, and playback profile types.
- Database schema: add fields or side tables for media summary, compatibility status/reasons, and asset track-role mapping.
- Player contracts: add `playbackProfile` and `selectedTrackRef` to `PlaybackTarget`; switching may later need a same-asset track switch target.
- TV runtime: later phases should capability-gate in-file audio-track switching rather than assuming `HTMLMediaElement.audioTracks` is available.

</code_context>

<specifics>
## Specific Ideas

- User explicitly chose the single Asset model over the earlier two-logical-Asset model.
- User wants one MKV and one MPG/MPEG real sample included in validation when available.
- User prefers lightweight durable metadata: standard summary and provenance, not raw probe payload.
- User wants Android TV reserved as a future target but not represented with Android-specific fields yet.

</specifics>

<deferred>
## Deferred Ideas

- Native Android TV player implementation belongs to a later milestone.
- Automatic transcoding/remuxing remains out of scope; user will preprocess unsupported files outside the system.
- Full scanner sidecar behavior belongs to Phase 13.
- Admin review UX and catalog admission behavior belong to Phase 14.
- Mobile search/queue and TV playback switching integration belong to Phase 15.

</deferred>

---

*Phase: 12-contract-schema-and-playback-risk-spike*
*Context gathered: 2026-05-10*
