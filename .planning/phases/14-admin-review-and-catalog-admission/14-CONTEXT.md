# Phase 14: Admin Review and Catalog Admission - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 14 turns Phase 13 real-MV import candidates into reviewed formal catalog entries. Admin must be able to inspect and edit metadata, see MediaInfo/filename/sidecar provenance and conflicts, accept or correct scanner audio-track guesses, and approve one physical MKV/MPG/MPEG MV as one formal song with one real-MV asset. Approved songs must write and validate durable `song.json` with track-role and compatibility facts. Unsupported or incomplete candidates must remain visible with repair/preprocess guidance. This phase does not implement mobile search, queueing, TV playback, audio-track switching at runtime, automatic transcoding/remuxing, or native Android TV.

</domain>

<decisions>
## Implementation Decisions

### Approval Gate
- **D-01:** The only hard metadata blockers for approving a real-MV candidate are a non-empty song title and artist name.
- **D-02:** Language, cover, sidecar completeness, full MediaInfo provenance, and manually confirmed audio-track roles should be reviewed and editable, but they must not block approval by themselves.
- **D-03:** If a required system field such as language must exist in the formal database, use the existing scanner/default/admin-selected value and keep it visible for later correction rather than requiring the user to resolve it before approval.

### Audio-Track Role Mapping
- **D-04:** The system should auto-guess original/accompaniment track roles from scanner/MediaInfo/sidecar hints.
- **D-05:** Admin UI should surface the guessed original and instrumental roles clearly, including raw audio-track facts, but should not force manual mapping for every candidate.
- **D-06:** If guesses are missing, contradictory, or unsafe, the candidate stays visible with a review warning and editable role controls. The planner should decide the least noisy UI pattern for correcting guesses.

### Post-Approval Status
- **D-07:** Formal song/asset readiness should be decided from scanner compatibility: `playable` may become `ready`, uncertain values such as `unknown` or `review_required` should stay `review_required`, and `unsupported` must not enter normal ready/queueable flow.
- **D-08:** Phase 14 should not pretend runtime playback/switch verification happened. Phase 15 will validate actual search/queue/playback/switch behavior and may update status based on runtime evidence.

### Formal `song.json`
- **D-09:** Approved real-MV songs must write a complete durable `song.json` contract, not a minimal DB-only export.
- **D-10:** The formal `song.json` must include media path, cover path when present, one real-MV asset, `trackRoles`, `mediaInfoSummary`, `mediaInfoProvenance`, `playbackProfile`, `compatibilityStatus`, `compatibilityReasons`, codecs, duration, and related catalog metadata needed for restore/audit.
- **D-11:** The `song.json` consistency validator must understand the single real-MV asset model and must not require the legacy original/instrumental two-asset switch pair for these songs.

### Unsupported And Incomplete Candidates
- **D-12:** Unsupported or incomplete candidates remain visible in Admin and must not block other candidates from admission.
- **D-13:** Candidates that cannot be approved should show explicit repair or preprocess guidance and provide a practical retry path, such as fixing sidecars/media and running scan again.
- **D-14:** Unsupported candidates are not force-approved in Phase 14. They can be held, fixed, rescanned, or rejected according to existing candidate lifecycle controls.

### the agent's Discretion
- Exact auto-guess heuristics and confidence thresholds are planner discretion, provided raw track facts and warnings remain visible.
- Exact UI layout for guessed track roles, warnings, repair guidance, and retry actions is planner discretion, but it should follow the existing Admin console style and default Chinese UI.
- Exact naming for formal real-MV asset IDs and status transition helpers is planner discretion, provided the single Asset + `trackRoles` contract is preserved.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope
- `.planning/PROJECT.md` — v1.2 goal, single-file real MV library model, sidecar expectations, no forced transcoding, and Android TV deferral.
- `.planning/REQUIREMENTS.md` — REVIEW-01 through REVIEW-05 and v1.2 exclusions.
- `.planning/ROADMAP.md` — Phase 14 boundary, dependency on Phase 13, success criteria, and UI hint.
- `.planning/STATE.md` — current milestone decisions and Phase 14 focus.

### Prior Phase Contracts
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-CONTEXT.md` — single real-MV Asset, `trackRoles`, `playbackProfile`, compatibility status, and Android-neutral contract.
- `.planning/phases/13-mediainfo-probe-scanner-and-sidecars/13-CONTEXT.md` — scanner/sidecar/provenance decisions, same-stem media organization, and candidate visibility behavior.
- `.planning/phases/13-mediainfo-probe-scanner-and-sidecars/13-VERIFICATION.md` — verified Phase 13 scanner, MediaInfo, sidecar, and Admin preview behavior.

### Existing Admin Review And Admission Code
- `apps/api/src/modules/catalog/admission-service.ts` — current approve/hold/reject/conflict flow; still contains legacy two-file original/instrumental pair assumptions that Phase 14 must revise for single real-MV assets.
- `apps/api/src/routes/admin-imports.ts` — Admin import candidate list/detail/cover/metadata/scan/approve routes and candidate serialization; metadata patch currently does not expose full `trackRoles` editing.
- `apps/admin/src/imports/CandidateEditor.tsx` — existing Admin candidate editor, metadata form, file role controls, real-MV preview panel, and approve/hold/delete actions.
- `apps/admin/src/imports/types.ts` — Admin-side candidate, MediaInfo, compatibility, `TrackRoles`, and `PlaybackProfile` types already available to UI code.

### Formal Catalog And `song.json`
- `apps/api/src/modules/catalog/song-json.ts` — current formal `song.json` read/write types; needs real-MV asset fields for durable contract output.
- `apps/api/src/modules/catalog/song-json-consistency-validator.ts` — current formal validator; still validates legacy switch-pair assumptions that must be adapted for single real-MV assets.
- `apps/api/src/modules/catalog/repositories/asset-repository.ts` — formal asset repository already maps real-MV fields such as compatibility, MediaInfo, `trackRoles`, and `playbackProfile`.
- `packages/domain/src/index.ts` — domain contract for `CompatibilityStatus`, `TrackRef`, `TrackRoles`, `MediaInfoSummary`, `MediaInfoProvenance`, `PlaybackProfile`, `Song`, and `Asset`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CandidateEditor` already gives Admin a metadata form, approval actions, conflict resolution UI, expandable file details, and `RealMvPreviewPanel`.
- `RealMvPreviewPanel` already shows cover preview, container, duration, video codec, resolution, audio-track count, metadata sources, and warning chips.
- `/admin/import-candidates/:candidateId/files/:candidateFileId/cover` already serves same-stem cover sidecars safely from the configured media roots.
- `PgAssetRepository` already persists and reads `compatibilityStatus`, `compatibilityReasons`, `mediaInfoSummary`, `mediaInfoProvenance`, `trackRoles`, and `playbackProfile` for formal assets.

### Established Patterns
- Admin metadata updates go through `PATCH /admin/import-candidates/:candidateId` and return the serialized candidate with files.
- Approval failures currently keep the candidate visible as `approval_failed` or `review_required` with review notes and repair metadata.
- Formal catalog admission writes `song.json` first, promotes assets, and then updates candidate status.
- Existing formal catalog trust is status-driven: ready songs/assets are what downstream user flows should consume.

### Integration Points
- Replace `CatalogAdmissionService.evaluatePair` and approval promotion logic for real-MV candidates so one selected file creates one formal song and one real-MV asset with `trackRoles`.
- Extend Admin metadata patch and candidate editor state to accept reviewed/overridden `trackRoles` on the selected real-MV file.
- Extend formal `SongJsonAsset` and `FormalSongJsonAsset` shapes with real-MV fields and make validator branch by `playbackProfile.kind` or asset kind.
- Add Admin UI affordances for auto-guessed track roles, unsafe/unsupported reasons, repair guidance, and scan retry.
- Preserve legacy demo/two-asset behavior where still needed, but real-MV admission must follow the single Asset model locked in Phase 12.

</code_context>

<specifics>
## Specific Ideas

- User wants Phase 14 approval to be light: only song title and artist name are mandatory.
- User chose system auto-guessing for original/accompaniment tracks, with Admin correction only when needed.
- User wants readiness to follow scanner compatibility instead of defaulting everything to `review_required` or `ready`.
- User wants `song.json` to be the full durable contract beside the formal song, not a minimal playback stub.
- User wants unavailable candidates to stay visible with clear guidance instead of disappearing or blocking the rest of the library.

</specifics>

<deferred>
## Deferred Ideas

- Search, queue, TV playback, and runtime audio-track switching belong to Phase 15.
- Runtime proof of actual browser/TV audio-track switching belongs to Phase 15.
- Automatic transcoding/remuxing remains outside v1.2; user preprocesses unsupported files externally.
- Native Android TV remains a later milestone, not Phase 14.

</deferred>

---

*Phase: 14-admin-review-and-catalog-admission*
*Context gathered: 2026-05-12*
