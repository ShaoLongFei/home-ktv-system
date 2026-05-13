# Phase 16: Policy Seam, Android Reservation, and Hardening - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 16 hardens the real-MV rollout without adding new product surface. It must keep review-first admission as the default, preserve compatibility for demo/local songs, online supplement tasks, queue controls, and admin maintenance after real-MV schema changes, and retain only platform-neutral catalog/player boundaries for a future Android TV milestone. This phase does not build Android TV, new acquisition flows, or new playback capability.

</domain>

<decisions>
## Implementation Decisions

### Admission Policy Seam
- **D-01:** Review-first admission remains the default policy for real MV files.
- **D-02:** Any auto-admit eligibility stays as a reserved internal capability only; it must not trigger silent admission or a visible enable switch in v1.2.
- **D-03:** Phase 16 should keep the policy seam inert from a user-flow perspective. The system may remember eligibility, but Admin and Mobile should continue to behave as review-first.

### Hardening With Real Media
- **D-04:** Phase 16 validation should use the user's already-built local media library and existing index as the primary real-world verification source.
- **D-05:** The local sample media under `songs-sample/` is a private machine-local validation asset, not a repository fixture.
- **D-06:** Repository tests should stay portable and not require committed binary media files; synthetic fixtures can cover unit-level behavior, while real local samples handle meaningful validation and verification.
- **D-07:** Real-media hardening should cover representative cases from the local library: playable two-track files, unsupported files, missing-track or preprocess-required files, and legacy demo/local/online compatibility paths.

### Compatibility Preservation
- **D-08:** Existing demo/local songs, online supplement tasks, queue controls, and admin maintenance must remain compatible after any Phase 16 schema or policy hardening.
- **D-09:** Phase 16 may add regression coverage, guards, or compatibility checks, but it must not require migration of older flows into a new policy model.

### Android TV Boundary
- **D-10:** Android TV remains contract-only in v1.2. Phase 16 keeps platform-neutral catalog/player fields and documentation, but does not add an Android-specific adapter seam.
- **D-11:** No Android-only runtime fields, no Android package boundary, and no native player implementation are added in this phase.

### the agent's Discretion
- Exact field names for any reserved policy capability are left to planning, as long as the capability stays non-operational in v1.2.
- Exact split between portable test fixtures and local real-media verification scripts is planning discretion, as long as the local media library is used for meaningful hardening.

</decisions>

<specifics>
## Specific Ideas

- User already built the media library and its index, so Phase 16 should lean on that existing local corpus instead of synthetic-only validation.
- User wants real media samples, not just contrived fixtures, because the songs and index already exist locally.
- The local sample files are `songs-sample/关喆-想你的夜(MTV)-国语-流行.mkv` and `songs-sample/蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg`.
- User wants future Android TV to remain a later milestone, with no Android-specific fields added now.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope
- `.planning/PROJECT.md` — v1.2 milestone goal, current state, constraints, and Android TV deferral.
- `.planning/REQUIREMENTS.md` — MEDIA/REVIEW/PLAY/HARD requirements and v1.2 exclusions.
- `.planning/ROADMAP.md` — Phase 16 goal, dependencies, and success criteria.
- `.planning/STATE.md` — current milestone state and Phase 16 focus.

### Prior Phase Contracts
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-CONTEXT.md` — single real-MV asset, playback profile, compatibility status, and Android-neutral contract.
- `.planning/phases/13-mediainfo-probe-scanner-and-sidecars/13-CONTEXT.md` — scanner provenance, same-stem media organization, and candidate compatibility surface.
- `.planning/phases/14-admin-review-and-catalog-admission/14-CONTEXT.md` — review-first admission, reviewed track roles, durable song.json, and admin repair guidance.
- `.planning/phases/15-search-queue-playback-and-switching/15-CONTEXT.md` — search/queue/playback/switch contracts and verified runtime behavior that Phase 16 must preserve.
- `.planning/phases/15-search-queue-playback-and-switching/15-VERIFICATION.md` — automated evidence for search, queue, playback, switch, and failure handling.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/modules/catalog/admission-service.ts` already centralizes review/approval/promotion logic and is the main place where policy hardening will be expressed.
- `apps/api/src/modules/media/real-mv-compatibility.ts` already evaluates compatibility and infers track roles.
- `apps/api/src/modules/catalog/song-json.ts` and `apps/api/src/modules/catalog/song-json-consistency-validator.ts` already define the durable song contract and validation path.
- `apps/api/src/test/real-mv-admission-regression.test.ts`, `apps/api/src/test/real-mv-media-contracts.test.ts`, and `apps/api/src/test/real-mv-playback-flow.test.ts` already cover real-MV contract behavior.
- `apps/api/src/test/online-candidate-task.test.ts` and `apps/admin/src/test/song-catalog.test.tsx` already cover adjacent compatibility-sensitive flows.

### Established Patterns
- The project already treats review-first admission as the normal path and uses structured compatibility status rather than ad hoc booleans.
- Formal catalog changes are expected to stay backward compatible with older demo/local/online flows.
- Existing validation prefers durable `song.json` and explicit compatibility signals over hidden heuristics.

### Integration Points
- Admin admission and catalog maintenance must remain stable while policy hardening is added.
- Queue/search/playback regressions need to stay green for legacy songs while real-MV policy is tightened.
- Local real-media verification should plug into existing scan/admission/search scripts rather than inventing a separate media pipeline.

</code_context>

<deferred>
## Deferred Ideas

- Native Android TV player implementation.
- Any Android-specific adapter seam or Android-only runtime fields.
- Media acquisition, OpenList matching, download workflows, and transcoding/remuxing.

</deferred>

---

*Phase: 16-policy-seam-android-reservation-and-hardening*
*Context gathered: 2026-05-13*
