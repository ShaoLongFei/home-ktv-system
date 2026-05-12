# Phase 13: MediaInfo Probe, Scanner, and Sidecars - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 13 makes real MKV/MPG/MPEG MV files discoverable as stable review candidates under `MEDIA_ROOT`. It extends the existing import scan flow so one physical MV file becomes one candidate input with MediaInfo facts, same-stem cover discovery, same-stem `song.json` metadata, filename fallback metadata, provenance, and retry/reconcile behavior for unstable files. This phase does not build the full Admin review UX, approve files into the formal catalog, make real MV songs searchable/queueable/playable, implement transcoding/remuxing, or build Android TV playback.

</domain>

<decisions>
## Implementation Decisions

### GSD Phase Directory Hygiene
- **D-01:** The old hot-songs planning directories for `12-source-contracts-and-fetch-harness`, `13-normalization-and-dedupe`, and `13.1-full-chart-coverage` are legacy milestone artifacts and have been moved under `.planning/legacy/hot-songs-phases/`.
- **D-02:** Current v1.2 Phase 13 context and future plans must live under `.planning/phases/13-mediainfo-probe-scanner-and-sidecars/` so `$gsd-plan-phase 13` resolves to the real MV scanner phase.

### Discovery Scope
- **D-03:** Phase 13 scans `.mkv`, `.mpg`, and `.mpeg` as real MV media files in addition to existing supported demo formats.
- **D-04:** One real MV media file is one song candidate input. Do not split original/accompaniment into separate candidate files for real MV; detected audio tracks stay inside the single file's MediaInfo facts and later `trackRoles`.
- **D-05:** Reuse the existing scan roots and manual trigger model: files placed under `MEDIA_ROOT/imports/pending` are discovered by the existing `/admin/imports/scan` flow. The existing watcher/scheduled scan plumbing may reuse the same scanner behavior.

### Sidecar Matching
- **D-06:** Same-stem sidecars live beside the media file. For `歌手-歌名.mkv`, matching sidecars are `歌手-歌名.song.json` or `歌手-歌名.json` if a dedicated suffix is easier to support, and same-stem covers such as `.jpg`, `.jpeg`, `.png`, or `.webp`.
- **D-07:** Sidecars and covers supplement the candidate preview and metadata, but the media file remains the candidate's primary identity. A sidecar or cover alone must not create a standalone song candidate.
- **D-08:** Cover path and sidecar path should be stored as provenance/review metadata on the candidate or candidate file detail, not copied into the formal songs library in this phase.

### Metadata Precedence And Provenance
- **D-09:** MediaInfo/ffprobe facts are the primary source for technical metadata: duration, container, video codec, resolution, file size, and audio tracks.
- **D-10:** Song identity metadata should be prefilled conservatively from available sources with provenance: MediaInfo tags when available, then filename parsing, then sidecar `song.json` for missing or supplemental fields. If two sources conflict, preserve the conflict for Admin review instead of silently overwriting.
- **D-11:** Filename parsing should support common local MV names such as `歌手-歌名(...)-语言-风格.mkv`, but must be conservative. Unknown pieces should remain review-required rather than guessed aggressively.
- **D-12:** Same-stem `song.json` may provide title, artist, language, genre, tags, aliases, search hints, release year, and optional track-role hints. Exact schema details are planner discretion, but invalid JSON must not crash the whole scan.

### Stability And Retry
- **D-13:** Scanner must avoid probing obviously unstable files. A lightweight stability check is enough for v1.2: compare size/mtime over a short delay or skip/retry when the file changed during scan.
- **D-14:** Unstable, unreadable, invalid-sidecar, or probe-failed files should remain visible as review/retry candidates with explicit scanner/probe reasons. They must not block other files in the same scan.
- **D-15:** Re-running scan after the file stabilizes or sidecar is fixed should reconcile the existing candidate by media relative path/group key rather than creating duplicates.

### Compatibility Surface
- **D-16:** Phase 13 should populate the Phase 12 real-MV fields already available on import candidate file details where possible: `mediaInfoSummary`, `mediaInfoProvenance`, `compatibilityStatus`, `compatibilityReasons`, `trackRoles`, and `playbackProfile`.
- **D-17:** Browser playback support and real audio-track switching are not decided by scanner alone. Initial scanner compatibility should be `review_required` when track roles or runtime support are uncertain, and `unsupported` only for clear probe/container/codec failures.

### the agent's Discretion
- Exact file names for sidecar metadata helpers, repository column additions, and candidate metadata shape are left to the planner.
- Planner may decide whether `stem.song.json` or `stem.json` is the canonical sidecar pattern, but the final behavior must be clear and documented.
- Planner may decide the exact stability-check interval and whether to make it configurable, as long as it stays lightweight and does not slow ordinary scans noticeably.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope
- `.planning/PROJECT.md` — v1.2 goal, real MV file model, sidecar expectations, and Android/transcoding exclusions.
- `.planning/REQUIREMENTS.md` — SCAN-01 through SCAN-05 and out-of-scope boundaries.
- `.planning/ROADMAP.md` — Phase 13 success criteria and dependency on Phase 12.
- `.planning/STATE.md` — Phase 12 completion state and milestone decisions.

### Prior Phase Contracts
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-CONTEXT.md` — single Asset model, MediaInfo summary, track roles, playback profile, and deferred scanner behavior.
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-03-SUMMARY.md` — ffprobe to MediaInfo summary/provenance extraction.
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-04-SUMMARY.md` — playback target/profile and selected track boundaries.
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-06-SUMMARY.md` — real sample playback-risk evidence.

### Existing Scanner And Import Code
- `apps/api/src/modules/ingest/import-scanner.ts` — current root walking, quick hash, probe, path hint, and candidate-builder handoff.
- `apps/api/src/modules/ingest/candidate-builder.ts` — current candidate grouping, path-derived identity, MediaInfo field propagation, and vocal-mode inference.
- `apps/api/src/modules/ingest/media-probe.ts` — ffprobe wrapper and MediaInfo summary/provenance builder.
- `apps/api/src/modules/ingest/library-paths.ts` — canonical `MEDIA_ROOT` roots and relative-path behavior.
- `apps/api/src/modules/ingest/repositories/import-file-repository.ts` — import file persistence and changed/unchanged file identity.
- `apps/api/src/modules/ingest/repositories/import-candidate-repository.ts` — candidate/file detail persistence for MediaInfo and real-MV contract fields.
- `apps/api/src/routes/admin-imports.ts` — manual scan route and candidate serialization.
- `apps/api/src/db/migrations/0007_real_mv_contracts.sql` — existing real-MV fields on assets and import candidate files.
- `packages/domain/src/index.ts` — domain contracts for import files, candidate details, MediaInfo, compatibility, track roles, and playback profile.

### Existing Tests
- `apps/api/src/test/import-scanner.test.ts` — scanner, candidate builder, and MediaInfo summary behavior.
- `apps/api/src/test/real-mv-media-contracts.test.ts` — ffprobe summary and compatibility evaluator coverage.
- `apps/api/src/test/catalog-contracts.test.ts` — repository mapping for real-MV JSONB fields.
- `apps/api/src/test/admin-imports-routes.test.ts` — admin import scan and candidate route behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ImportScanner` already walks import roots, detects changed files with size/mtime/quick hash, probes changed files, and sends changed import files into `CandidateBuilder`.
- `probeMediaFile` already produces `MediaInfoSummary` and `MediaInfoProvenance` from ffprobe output.
- `CandidateBuilder` already creates grouped import candidates and copies MediaInfo facts into candidate file details.
- `PgImportCandidateRepository` already persists `compatibilityStatus`, `compatibilityReasons`, `mediaInfoSummary`, `mediaInfoProvenance`, `trackRoles`, and `playbackProfile` for candidate files.
- `/admin/imports/scan` already gives the user a manual trigger path for Phase 13 validation.

### Established Patterns
- Scanning is server-side and rooted under `MEDIA_ROOT`; absolute paths should not leak to clients.
- Existing scan flow treats unchanged files as `skipped`, preserving prior probe payload.
- Candidate identity is currently path-derived. Phase 13 should extend this conservatively for single-file real MV while preserving reconciliation by relative path/group key.
- The backend stores rich probe facts in candidate file details, while Admin later decides admission and corrections.

### Integration Points
- Extend supported file detection in `ImportScanner` to include `.mpg` and `.mpeg`.
- Add sidecar/cover discovery near scanner or candidate-builder boundaries without turning sidecar files into standalone candidate media.
- Extend candidate metadata (`candidateMeta` or file detail metadata) to preserve sidecar facts, filename facts, source precedence, conflicts, and scanner reasons.
- Extend tests with temporary real-MV-like file names and fake probe data; avoid needing large binary fixtures.

</code_context>

<specifics>
## Specific Ideas

- User has placed one MKV and one MPG sample under `songs-sample/`; these are local samples and should not be committed.
- User expects future music organization to be single media file per song, with cover and `song.json` beside the media file for easy preview/loading.
- User wants direct playback where possible and will preprocess unsupported files server-side outside this system.
- Android TV is intentionally deferred to the next version; Phase 13 should only preserve platform-neutral fields.

</specifics>

<deferred>
## Deferred Ideas

- Admin review UI for conflict resolution, audio-track role mapping, and final admission belongs to Phase 14.
- Mobile search/queue and TV playback/switching integration belongs to Phase 15.
- Review-first policy hardening, Android reservation checks, and broad regression compatibility belong to Phase 16.
- Mandatory transcoding/remuxing and native Android TV playback are outside v1.2 Phase 13.

</deferred>

---

*Phase: 13-mediainfo-probe-scanner-and-sidecars*
*Context gathered: 2026-05-12*
