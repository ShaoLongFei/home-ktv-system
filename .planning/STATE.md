---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: 真实 MV 歌库
status: executing
stopped_at: Completed 13-02-PLAN.md
last_updated: "2026-05-12T11:25:37.484Z"
last_activity: "2026-05-12 -- Phase 13 Plan 13-02 complete; ready for 13-03"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 10
  completed_plans: 8
  percent: 80
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-10)

**Core value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。
**Current focus:** Phase 13 — mediainfo-probe-scanner-and-sidecars

## Current Position

Milestone: v1.2 真实 MV 歌库
Phase: 13 (mediainfo-probe-scanner-and-sidecars) — EXECUTING
Plan: 3 of 4
Status: Ready to execute Plan 13-03
Last activity: 2026-05-12 -- Phase 13 Plan 13-02 complete; ready for 13-03

Progress: [████████░░] 80%

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

### Pending Todos

None.

### Blockers/Concerns

- Browser playback and audio-track switching support must be verified before exposing real MV switching as available.
- v1.2 does not transcode or remux unsupported files; users preprocess those files outside the system.

## Session Continuity

Last session: 2026-05-12T11:25:37.480Z
Stopped at: Completed 13-02-PLAN.md
Resume file: .planning/phases/13-mediainfo-probe-scanner-and-sidecars/13-03-PLAN.md
