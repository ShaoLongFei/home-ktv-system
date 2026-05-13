---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: 真实 MV 歌库
status: planning
stopped_at: Phase 15 verification passed
last_updated: "2026-05-13T12:18:53Z"
last_activity: "2026-05-13 -- Phase 16 research and plan docs drafted"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 20
  completed_plans: 20
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-13)

**Core value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。
**Current focus:** Phase 16 — policy-seam-android-reservation-and-hardening

## Current Position

Milestone: v1.2 真实 MV 歌库
Phase: 16 (policy-seam-android-reservation-and-hardening) — PLANNING IN PROGRESS
Plan: 4 plans drafted
Status: Planning in progress
Last activity: 2026-05-13 -- Phase 16 research and plan docs drafted

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 37
- Average duration: See milestone archives
- Total execution time: See milestone archives

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1.0 Phases 1-5 | 25 | archived | archived |
| v1.1 Phases 6-11 | 12 | archived | archived |

**Recent Trend:**

- Last 5 plans: See `.planning/milestones/v1.1-ROADMAP.md`
- Trend: Stable

*Updated after each plan completion*
| Phase 13 P02 | 20 min | 3 tasks | 2 files |
| Phase 13 P03 | 60 min | 4 tasks | 5 files |
| Phase 14 P01 | 14 min | 2 tasks | 3 files |
| Phase 14 P04 | 17 min | 2 tasks | 4 files |
| Phase 14 P03 | 20min | 2 tasks | 2 files |
| Phase 14-admin-review-and-catalog-admission P02 | 15 min | 2 tasks | 5 files |
| Phase 14 P05 | 15 min | 2 tasks | 2 files |
| Phase 15 P01 | 35 min | 2 tasks | 3 files |
| Phase 15 P02 | 19 min | 2 tasks | 4 files |
| Phase 15 P03 | 20 min | 3 tasks | 8 files |
| Phase 15 P04 | 32 min | 4 tasks | 11 files |
| Phase 15 P05 | 89 min | 4 tasks | 4 files |

## Accumulated Context

### Decisions

- [Milestone v1.2]: Real MV library work uses one MKV/MPG/MPEG file as one song, with optional sibling cover image and `song.json` metadata.
- [Milestone v1.2]: MediaInfo is the primary metadata source; filename and sibling `song.json` fill gaps before Admin review.
- [Milestone v1.2]: v1.2 preserves Android TV playback boundaries but does not build a native Android TV app.
- [Milestone v1.2]: Review-first admission remains the default; auto-admit is only a reserved capability.
- [Milestone v1.2]: Unsupported or uncertain files must be marked clearly and kept out of normal queueable user flows.
- [Phase 13-01]: Real MV scanner identity combines media quick hash with artifact signatures so sidecar changes trigger reconciliation.
- [Phase 13-01]: Unstable real MV files are persisted as pending with file-unstable scannerReasons instead of being probed or silently skipped.
- [Phase 06] TV display copy, first-play prompt, and fallback notice text are centralized in `tv-display-model.ts`.
- [Phase 06] First-play autoplay block is tracked in local TV state and cleared on successful playback.
- [Phase 06] The first-play loading banner stays suppressed so the central prompt is not duplicated.
- [Phase 08] Admin, Mobile, and TV runtime orchestration now lives behind app-local hooks instead of page components.
- [Phase 08] No shared runtime package was introduced; boundaries stay local until duplication or cross-app coupling justifies extraction.
- [Milestone audit] v1.1 audit passed after Phase 9 verification closure, Phase 10 paired Mobile visual coverage, and Phase 11 Admin runtime boundary completion.
- [Gap planning] Phase 9 closes verification/traceability gaps, Phase 10 closes paired Mobile visual-check coverage, Phase 11 closes remaining Admin runtime boundary debt.
- [Phase 10-paired-mobile-visual-verification]: Default paired Mobile capture now resolves a fresh controller URL through POST /admin/rooms/:room/pairing-token/refresh.
- [Phase 10-paired-mobile-visual-verification]: MOBILE_VISUAL_URL remains a full override and bypasses pairing refresh when explicitly set.
- [Phase 10-paired-mobile-visual-verification]: Chrome capture is time-bounded so visual checks complete deterministically even if headless Chrome lingers after writing a screenshot.
- [Phase 11-admin-runtime-boundary-completion]: Song Catalog runtime orchestration stays app-local in apps/admin/src/songs/use-song-catalog-runtime.ts.
- [Phase 11-admin-runtime-boundary-completion]: SongCatalogView.tsx remains responsible for rendering existing markup, labels, and editor wiring only.
- [Phase 11-admin-runtime-boundary-completion]: Import Workbench runtime orchestration stays app-local in apps/admin/src/imports/use-import-workbench-runtime.ts.
- [Phase 11-admin-runtime-boundary-completion]: ImportWorkbench.tsx now renders returned state and callbacks while TanStack Query orchestration stays inside the runtime hook.
- [Phase 11-admin-runtime-boundary-completion]: QUAL-01 closure is scoped to the audited Admin Import/Songs runtime boundary and does not add product capability.
- [Phase 11-admin-runtime-boundary-completion]: Final evidence combines runtime hook tests, page behavior tests, structure grep checks, Admin typecheck, and workspace typecheck.
- [Milestone v1.1]: TV playback polish, productized Chinese UI, paired Mobile visual coverage, runtime boundaries, and traceability audit are archived.
- [Phase 13]: Invalid real MV sidecar JSON and schema mismatches become scanner warnings with stable reason codes instead of scan failures. — Plan 13-02 keeps malformed song.json retryable and visible for later Admin review.
- [Phase 13]: Real MV filename fallback stays conservative and records provenance/conflicts for Admin review. — Plan 13-02 avoids aggressive identity guesses while preserving MediaInfo, filename, and sidecar source labels.
- [Phase 14-01]: Reviewed trackRoles are accepted only as a complete original/instrumental object whose slots are TrackRef or null.
- [Phase 14-01]: Candidate metadata updates validate reviewed trackRoles against current candidate file MediaInfo audioTracks inside the update transaction.
- [Phase 14-01]: Invalid reviewed track refs return INVALID_TRACK_ROLE_REF from the Admin metadata PATCH route.
- [Phase 14-04]: Formal song.json now mirrors durable real-MV Asset fields without adding any database dependency to the writer.
- [Phase 14-04]: Validator treats playbackProfile.kind=single_file_audio_tracks as a one-asset real-MV contract and skips legacy switch-pair validation for it.
- [Phase 14-04]: Missing real-MV original/instrumental role refs are review warnings; invalid refs remain hard validation errors.
- [Phase 14-03]: Real-MV admission bypasses legacy pair evaluation and creates exactly one dual-track-video Asset.
- [Phase 14-03]: Scanner compatibility controls formal readiness, while real-MV switchQualityStatus remains review_required until runtime switching is verified later.
- [Phase 14-03]: Unsupported real-MV candidates stay review_required with repair metadata instead of being force-promoted or hidden.
- [Phase 14-02]: Admin real-MV track-role review stores full TrackRef refs from raw MediaInfo audio tracks in files[].trackRoles.
- [Phase 14-02]: Approval blockers remain limited to non-empty title and artist; compatibility and track-role issues are review guidance.
- [Phase 14-02]: Real-MV review evidence stays inside the existing dense Admin CandidateEditor instead of a separate review wizard.
- [Phase 14-05]: API and Admin regression coverage now prove reviewed real-MV admission, song.json validation, and UI review guidance without Phase 15 runtime assertions.
- [Phase 14-05]: Optional exact typing in regression helpers is satisfied by supplying explicit real-MV defaults rather than undefined placeholders.
- [Phase 14-05]: Test-only source guards keep excluded mobile, queue, TV playback, switching, transcode, and Android TV concerns out of Phase 14 regression coverage.
- [Phase 15-03]: Real-MV switching stays on switch-vocal-mode and uses SwitchTarget.switchKind=audio_track. — Reuses existing transition, snapshot, rollback, and telemetry semantics without creating a separate real-MV command path.
- [Phase 15-03]: TV switch_committed telemetry is the only server-side commit point for real-MV preferredVocalMode. — Failed switch attempts must not change queue playbackOptions, so server state advances only after TV confirms playback.
- [Phase 15-04]: TV runtime derives TrackRef from PlaybackTarget instead of importing @home-ktv/domain directly. — Keeps tv-player package boundaries clean while preserving the shared player-contract payload shape.
- [Phase 15-04]: Audio-track playback capability failures send failed telemetry with stage=playback_capability_blocked. — Unsupported real-MV playback should reuse backend failure recovery and show preprocessing copy instead of the autoplay prompt.
- [Phase 15-05]: Mobile real-MV search queueability is server-authoritative through canQueue/disabledLabel, while nonqueueable candidates stay visible with Chinese disabled labels.
- [Phase 15-05]: Mobile add-queue payload remains songId/assetId only; vocal mode intent is resolved by the server from current room playback state.
- [Phase 15-05]: Phase 15 verification passed with automated evidence across Mobile search UI, API queue/playback/switch contracts, TV audio-track runtime, and unsupported failure states.

### Pending Todos

None.

### Blockers/Concerns

- Browser playback and audio-track switching support must be verified before exposing real MV switching as available.
- v1.2 does not transcode or remux unsupported files; users preprocess those files outside the system.

## Session Continuity

Last session: 2026-05-13T11:21:59Z
Stopped at: Phase 15 verification passed
Resume file: None
