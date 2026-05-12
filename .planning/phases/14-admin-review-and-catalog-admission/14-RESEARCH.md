# Phase 14: Admin Review and Catalog Admission - Research

**Researched:** 2026-05-12
**Domain:** Real MV import review, catalog admission, formal `song.json` durability, Admin review UX
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The only hard metadata blockers for approving a real-MV candidate are a non-empty song title and artist name.
- **D-02:** Language, cover, sidecar completeness, full MediaInfo provenance, and manually confirmed audio-track roles should be reviewed and editable, but they must not block approval by themselves.
- **D-03:** If a required system field such as language must exist in the formal database, use the existing scanner/default/admin-selected value and keep it visible for later correction rather than requiring the user to resolve it before approval.
- **D-04:** The system should auto-guess original/accompaniment track roles from scanner/MediaInfo/sidecar hints.
- **D-05:** Admin UI should surface the guessed original and instrumental roles clearly, including raw audio-track facts, but should not force manual mapping for every candidate.
- **D-06:** If guesses are missing, contradictory, or unsafe, the candidate stays visible with a review warning and editable role controls. The planner should decide the least noisy UI pattern for correcting guesses.
- **D-07:** Formal song/asset readiness should be decided from scanner compatibility: `playable` may become `ready`, uncertain values such as `unknown` or `review_required` should stay `review_required`, and `unsupported` must not enter normal ready/queueable flow.
- **D-08:** Phase 14 should not pretend runtime playback/switch verification happened. Phase 15 will validate actual search/queue/playback/switch behavior and may update status based on runtime evidence.
- **D-09:** Approved real-MV songs must write a complete durable `song.json` contract, not a minimal DB-only export.
- **D-10:** The formal `song.json` must include media path, cover path when present, one real-MV asset, `trackRoles`, `mediaInfoSummary`, `mediaInfoProvenance`, `playbackProfile`, `compatibilityStatus`, `compatibilityReasons`, codecs, duration, and related catalog metadata needed for restore/audit.
- **D-11:** The `song.json` consistency validator must understand the single real-MV asset model and must not require the legacy original/instrumental two-asset switch pair for these songs.
- **D-12:** Unsupported or incomplete candidates remain visible in Admin and must not block other candidates from admission.
- **D-13:** Candidates that cannot be approved should show explicit repair or preprocess guidance and provide a practical retry path, such as fixing sidecars/media and running scan again.
- **D-14:** Unsupported candidates are not force-approved in Phase 14. They can be held, fixed, rescanned, or rejected according to existing candidate lifecycle controls.

### Claude's Discretion
- Exact auto-guess heuristics and confidence thresholds are planner discretion, provided raw track facts and warnings remain visible.
- Exact UI layout for guessed track roles, warnings, repair guidance, and retry actions is planner discretion, but it should follow the existing Admin console style and default Chinese UI.
- Exact naming for formal real-MV asset IDs and status transition helpers is planner discretion, provided the single Asset + `trackRoles` contract is preserved.

### Deferred Ideas (OUT OF SCOPE)
- Search, queue, TV playback, and runtime audio-track switching belong to Phase 15.
- Runtime proof of actual browser/TV audio-track switching belongs to Phase 15.
- Automatic transcoding/remuxing remains outside v1.2; user preprocesses unsupported files externally.
- Native Android TV remains a later milestone, not Phase 14.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVIEW-01 | Admin can review title, artist, language, cover, MediaInfo facts, filename-derived fields, sidecar fields, and conflicts before admission. | Existing Admin preview already shows cover/media facts/provenance/conflicts; Phase 14 should expand it into explicit review/edit sections without adding blockers beyond title/artist. |
| REVIEW-02 | Admin can map detected audio tracks to original vocal and accompaniment roles, with raw track facts still preserved. | Candidate files already carry `mediaInfoSummary.audioTracks` and guessed `trackRoles`; add typed PATCH support and compact controls for original/instrumental selection. |
| REVIEW-03 | Admin can approve a real MV candidate into the formal catalog as one song with one real-MV asset that stores original/accompaniment `trackRoles`. | Replace the legacy two-file pair admission branch for `dual-track-video` candidates with a single-file real-MV admission branch. |
| REVIEW-04 | Approved real MV songs write and validate formal `song.json` including media path, cover path, assets, track indexes, codecs, and compatibility status. | Extend `SongJsonAsset` and validator to include durable real-MV fields and branch validation by `playbackProfile.kind`. |
| REVIEW-05 | Unsupported or incomplete candidates remain visible with repair/preprocess guidance and do not block other candidates from admission. | Current status lifecycle already keeps `review_required`, `held`, `conflict`, and `approval_failed` candidates visible; add reason-to-guidance mapping and avoid throwing scan/admission-wide failures. |
</phase_requirements>

## Summary

Phase 13 delivered real-MV-aware candidates, but formal admission remains legacy pair-oriented. The main Phase 14 task is to bridge that seam: one selected `dual-track-video` candidate file with `playbackProfile.kind = "single_file_audio_tracks"` must approve into one `songs` row and one `assets` row carrying `trackRoles`, MediaInfo, provenance, playback profile, and compatibility data.

The highest-risk area is status semantics. Existing search/queue code tends to trust `songs.status = ready`, `assets.status = ready`, and `switch_quality_status = verified`. For Phase 14, do not mark unknown/review-required/unsupported real MV assets as normal queueable ready. Use scanner compatibility to derive formal song/asset readiness and preserve Phase 15 runtime verification boundaries.

**Primary recommendation:** Plan this as four slices: Admin review/edit surface, API metadata patch for `trackRoles`, real-MV admission/writer branch, and full `song.json`/validator contract update with tests.

## Project Constraints (from CLAUDE.md)

- Preserve the core product value: mobile controls, TV playback, server-authoritative state, stable singing first.
- Do not expand into complex enhancement scope, software DSP, direct online playback, Android TV native work, or mandatory transcoding.
- Keep real MV work local-library-first and review-first.
- Follow existing TypeScript monorepo patterns across API, Admin, and shared domain contracts.
- Follow existing codebase conventions because project conventions are not separately established.
- GSD workflow artifacts must stay in sync; this research file is part of that workflow.
- No project-local `AGENTS.md`, `.claude/skills/`, or `.agents/skills/` were found.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.3 | Shared API/Admin/domain contracts | Existing monorepo contract language; avoids drift for `TrackRoles`, `PlaybackProfile`, and `song.json`. Verified via `npm view`, published metadata modified 2026-04-16. |
| Fastify | 5.8.5 | Admin import routes | Existing API framework; use route handlers and typed parsing patterns already in `admin-imports.ts`. Verified via `npm view`, published metadata modified 2026-04-14. |
| React | 19.2.5 | Admin review UI | Existing Admin UI framework. Verified via `npm view`, published metadata modified 2026-05-08. |
| TanStack Query | 5.100.6 | Admin server-state mutations/cache | Existing `useImportWorkbenchRuntime` mutation/cache pattern. Verified via `npm view`, published metadata modified 2026-05-11. |
| Vitest | 4.1.5 | API/Admin tests | Existing unit and DOM test runner. Verified via `npm view`, published metadata modified 2026-05-11. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg` | 8.20.0 | SQL writer tests and repository integration | Use existing `QueryExecutor` tests; no ORM introduction. |
| Vite | 8.0.10 | Admin build/test environment | Existing Admin app build path. |
| Testing Library React | 16.3.2 | Admin DOM behavior tests | Use for track-role controls, warning/guidance copy, and PATCH payload assertions. |
| happy-dom | 20.9.0 | Admin test DOM | Existing Admin Vitest environment. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing Fastify routes | New review service API namespace | Not needed; `PATCH /admin/import-candidates/:candidateId` and approval routes already exist. |
| Existing React form | New review wizard | Too much UI churn; extend current dense Admin editor and preview panel. |
| JSONB fields on asset rows | New side tables for track roles/media facts | Existing schema already has JSONB columns; side tables would add unnecessary migration and repository complexity. |

**Installation:** No new packages recommended.

## Architecture Patterns

### Recommended Project Structure

```text
apps/api/src/routes/admin-imports.ts
apps/api/src/modules/ingest/repositories/import-candidate-repository.ts
apps/api/src/modules/catalog/admission-service.ts
apps/api/src/modules/catalog/song-json.ts
apps/api/src/modules/catalog/song-json-consistency-validator.ts
apps/admin/src/imports/CandidateEditor.tsx
apps/admin/src/imports/types.ts
apps/admin/src/test/import-workbench.test.tsx
apps/api/src/test/catalog-admission.test.ts
apps/api/src/test/song-json-consistency-validator.test.ts
```

### Pattern 1: Branch By Candidate File Playback Profile

**What:** Keep legacy two-file pair admission for old candidates, but detect real-MV candidates from one selected file where `proposedAssetKind === "dual-track-video"` or `playbackProfile.kind === "single_file_audio_tracks"`.

**When to use:** In `CatalogAdmissionService.approve()` before calling legacy `evaluatePair()`.

**Example:**

```ts
const selected = record.files.filter((file) => file.selected);
const realMvFile = selected.find(
  (file) => file.proposedAssetKind === "dual-track-video" ||
    file.playbackProfile?.kind === "single_file_audio_tracks"
);
if (realMvFile) {
  return this.approveRealMvCandidate(record, realMvFile, resolution);
}
```

### Pattern 2: Scanner Compatibility Drives Formal Status

**What:** Map candidate compatibility to formal status without claiming runtime verification.

**When to use:** During real-MV DB promotion and `song.json` writing.

**Recommended mapping:**

| Candidate `compatibilityStatus` | Song status | Asset status | Switch quality |
|---------------------------------|-------------|--------------|----------------|
| `playable` | `ready` | `ready` | `review_required` |
| `review_required` or `unknown` | `review_required` | `promoted` or `ready` only if deliberately hidden from queue by song status | `review_required` |
| `unsupported` | do not approve into normal catalog | candidate remains visible with guidance | `rejected` |

### Pattern 3: Store Reviewed Track Roles On Candidate File

**What:** Extend metadata patch file input with `trackRoles?: TrackRoles`, validate refs against `mediaInfoSummary.audioTracks`, and update `import_candidate_files.track_roles`.

**When to use:** Admin corrects original/accompaniment guesses.

**Example:**

```ts
files: [{
  candidateFileId,
  selected: true,
  proposedVocalMode: "dual",
  proposedAssetKind: "dual-track-video",
  trackRoles: {
    original: { index: 0, id: "0x1100", label: "Original vocal" },
    instrumental: { index: 1, id: "0x1101", label: "Instrumental" }
  }
}]
```

### Pattern 4: Durable `song.json` Mirrors Formal DB Contract

**What:** `SongJsonAsset` should carry the same real-MV fields already present on `Asset`: `compatibilityStatus`, `compatibilityReasons`, `mediaInfoSummary`, `mediaInfoProvenance`, `trackRoles`, and `playbackProfile`.

**When to use:** In admission before/alongside DB promotion.

### Anti-Patterns to Avoid

- **Treating real MV as original/instrumental file pair:** Violates Phase 12 single-asset decision and blocks all real-MV approval.
- **Making title/artist plus every warning a hard blocker:** User explicitly chose light approval; only title and artist block.
- **Writing a minimal playback stub `song.json`:** Fails REVIEW-04 and weakens restore/audit.
- **Marking real-MV switch quality `verified` in Phase 14:** Runtime switching proof is Phase 15.
- **Hiding unsupported candidates after failed approval:** Violates REVIEW-05; keep visible with guidance.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Track role schema | Ad hoc strings like `"track0"` | Existing `TrackRef` and `TrackRoles` domain types | Stable index/id/label contract already exists. |
| Media fact storage | Raw ffprobe payload in formal contract | Existing `MediaInfoSummary` and `MediaInfoProvenance` | Keeps durable catalog small and stable. |
| API validation | Unstructured body passthrough | Existing `parseMetadataPatch` style with typed guards | Prevents malformed JSONB from reaching repositories. |
| Admin mutations | Manual fetch state in components | Existing `useMutation` + `cacheCandidate` runtime hook pattern | Keeps page component render-focused. |
| `song.json` writes | Direct writes to final path | Existing temp-file + rename `writeSongJson` | Preserves atomic write behavior. |

**Key insight:** The project already has the hard contracts and persistence fields. Phase 14 should connect them, not introduce new media abstractions.

## Common Pitfalls

### Pitfall 1: Legacy Pair Gate Blocks Real MV

**What goes wrong:** `evaluatePair()` rejects one-file real-MV candidates as `missing-original-instrumental-pair`.
**How to avoid:** Add a real-MV branch before legacy pair evaluation and test one selected `dual-track-video` file approval.

### Pitfall 2: PATCH Cannot Persist Reviewed Track Roles

**What goes wrong:** Admin can view guesses but cannot correct them durably; approval writes scanner guesses.
**How to avoid:** Extend Admin/API/repository metadata patch types and SQL update to include `trackRoles`.

### Pitfall 3: `song.json` Validator Still Requires Switch Pair

**What goes wrong:** Single real-MV assets fail validation because no ready original/instrumental asset pair exists.
**How to avoid:** Branch validator by `playbackProfile.kind === "single_file_audio_tracks"` and validate `trackRoles` against `mediaInfoSummary.audioTracks`.

### Pitfall 4: Queueability Leaks Into Phase 14

**What goes wrong:** Approved `review_required` or `unsupported` media becomes visible to normal Mobile queue flows.
**How to avoid:** Keep unsupported out of formal approval; keep unknown/review-required song status out of ready search/queue paths until Phase 15.

### Pitfall 5: Cover Path Is Preview-Only

**What goes wrong:** Formal `song.json` loses cover provenance because Phase 13 only stored cover sidecar metadata for preview.
**How to avoid:** On approval, copy or move the same-stem cover beside formal media when present and write `coverPath` relative to the song directory.

## Code Examples

### Real-MV Asset Promotion Shape

```ts
{
  assetId: `asset-${candidate.id}-real-mv`,
  importFileId: file.importFileId,
  filePath: `songs/${targetRelativeDirectory}/${path.basename(file.relativePath)}`,
  vocalMode: "dual",
  proposedAssetKind: "dual-track-video",
  durationMs: file.mediaInfoSummary?.durationMs ?? file.durationMs ?? file.probeDurationMs ?? 0,
  compatibilityStatus: file.compatibilityStatus ?? "unknown",
  compatibilityReasons: file.compatibilityReasons ?? [],
  mediaInfoSummary: file.mediaInfoSummary,
  mediaInfoProvenance: file.mediaInfoProvenance,
  trackRoles: file.trackRoles ?? { original: null, instrumental: null },
  playbackProfile: file.playbackProfile
}
```

### Validator Branch

```ts
const realMvAssets = assets.filter(
  (asset) => asset.playbackProfile?.kind === "single_file_audio_tracks"
);
for (const asset of realMvAssets) {
  validateRealMvTrackRoles(asset, issues);
}
if (realMvAssets.length === 0) {
  validateSwitchPair(assets, issues);
}
```

### Admin Track Role Control Pattern

```tsx
<select
  value={file.trackRoles?.instrumental?.id ?? ""}
  onChange={(event) => updateTrackRole(file.candidateFileId, "instrumental", event.target.value)}
>
  <option value="">需要确认</option>
  {file.mediaInfoSummary?.audioTracks.map((track) => (
    <option key={track.id} value={track.id}>
      #{track.index} {track.label} {track.codec ?? ""}
    </option>
  ))}
</select>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two physical assets for original/instrumental | One real-MV asset with `trackRoles` | Phase 12 | Admission and validator must branch by playback profile. |
| Candidate preview only | Candidate review/edit/admission | Phase 14 | Admin must be able to correct metadata and roles before formal write. |
| Minimal `song.json` pair metadata | Full durable real-MV contract | Phase 14 | Writer and validator need real-MV fields, cover path, codecs, compatibility. |
| Switch readiness means verified pair | Real-MV switch readiness is not runtime-verified yet | Phase 15 later | Phase 14 should preserve `review_required` switch status. |

**Deprecated/outdated:**
- Legacy `evaluatePair()` as the only approval gate for all imports.
- `SongJsonAsset` without real-MV compatibility/media/track fields.
- Validator assumption that formal video switchability always means two separate ready assets.

## Open Questions

1. **Should `review_required` real-MV candidates be approvable into formal catalog?**
   - What we know: User wants only title and artist as metadata blockers, but unsupported candidates are not force-approved.
   - What's unclear: Whether compatibility `review_required` should create a formal `review_required` song now or remain an import candidate.
   - Recommendation: Allow `review_required` but not `unsupported`; set formal song status `review_required` and keep it out of normal ready queue flow.

2. **Should cover files be copied or moved on approval?**
   - What we know: Media file is moved to formal songs root; cover preview currently reads import sidecar path.
   - What's unclear: Existing code has no formal cover field yet.
   - Recommendation: Copy/move the cover beside the formal media and write `coverPath` in `song.json`; add DB field only if an existing formal UI needs it.

3. **How strict should track role validation be at approval?**
   - What we know: Manual mapping should not be required for every candidate.
   - What's unclear: Whether unmapped instrumental should block formal review-required approval.
   - Recommendation: Do not block except for invalid refs; warn and keep formal status `review_required`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Typecheck/tests | Yes | 25.8.0 | Project expects modern Node; use installed runtime. |
| pnpm | Workspace commands | Yes | 10.33.2 | None needed. |
| ffprobe | Existing scanner/probe tests and real sample checks | Yes | 8.1 | Mock probe data in unit tests where possible. |
| PostgreSQL CLI (`psql`) | Manual DB inspection only | No | - | Existing repository tests use `QueryExecutor` fakes; no blocker for planning. |

**Missing dependencies with no fallback:** None for planning and unit-level implementation.

**Missing dependencies with fallback:** `psql` missing; use existing fake-query tests unless integration DB verification is explicitly required.

## Validation Architecture

Skipped because `.planning/config.json` sets `workflow.nyquist_validation` to `false`.

## Recommended Plan Slices

1. **API review patch slice:** Extend import candidate metadata PATCH types/parsing/repository update for `trackRoles`; validate refs against raw audio tracks.
2. **Admin review UI slice:** Show raw audio track table, guessed original/accompaniment roles, warnings, guidance, and editable role selectors in the existing `CandidateEditor`.
3. **Admission slice:** Add real-MV approval branch, status mapping, media/cover move handling, and one-asset DB promotion with real-MV JSONB fields.
4. **Durable contract slice:** Extend `song-json.ts` and consistency validator for full real-MV asset contract and single-asset validation.
5. **Regression slice:** Cover legacy pair admission remains intact, real-MV approval writes one asset, unsupported stays visible, and Admin PATCH payload includes track roles.

## Sources

### Primary (HIGH confidence)
- `apps/api/src/modules/catalog/admission-service.ts` - Current legacy pair approval and formal writer seam.
- `apps/api/src/routes/admin-imports.ts` - Current Admin candidate serialization, cover preview route, metadata PATCH route.
- `apps/admin/src/imports/CandidateEditor.tsx` - Existing Admin metadata form, preview panel, file role UI, conflict UI.
- `apps/api/src/modules/catalog/song-json.ts` - Current formal `song.json` writer shape.
- `apps/api/src/modules/catalog/song-json-consistency-validator.ts` - Current validator and legacy switch-pair assumption.
- `apps/api/src/modules/catalog/repositories/asset-repository.ts` - Existing formal asset real-MV JSONB mapping.
- `apps/api/src/modules/ingest/repositories/import-candidate-repository.ts` - Existing candidate real-MV fields and missing metadata patch support.
- `packages/domain/src/index.ts` - Canonical domain types for compatibility, media info, playback profile, and track roles.
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-CONTEXT.md` and `.planning/phases/13-mediainfo-probe-scanner-and-sidecars/13-VERIFICATION.md` - Prior locked contracts and verified scanner behavior.

### Secondary (MEDIUM confidence)
- https://fastify.dev/docs/latest/Reference/Routes/ - Route handler conventions match existing API style.
- https://tanstack.com/query/latest/docs/framework/react/guides/mutations - Mutation/cache pattern aligns with existing Admin runtime hook.
- https://vitest.dev/guide/ - Test runner behavior aligns with existing API/Admin tests.
- npm registry metadata checked 2026-05-12 for `typescript`, `fastify`, `react`, `@tanstack/react-query`, `vitest`, `pg`, `vite`, `@testing-library/react`, `happy-dom`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Versions verified from local package files and npm metadata.
- Architecture: HIGH - Existing code has clear seams and prior phase contracts lock the model.
- Pitfalls: HIGH - Pitfalls are grounded in current code mismatches and Phase 14 requirements.
- UI details: MEDIUM - Exact layout remains planner discretion, but controls and data needs are clear.

**Research date:** 2026-05-12
**Valid until:** 2026-06-11 for local architecture; re-check package versions before dependency changes.
