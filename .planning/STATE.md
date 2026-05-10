---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: 热门歌曲候选名单
status: ready_to_plan
stopped_at: phase_14_ready_to_plan
last_updated: "2026-05-11T01:20:00+08:00"
last_activity: 2026-05-11
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
  percent: 75
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-10)

**Core value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。
**Current focus:** v1.2 热门歌曲候选名单

## Current Position

Milestone: v1.2 热门歌曲候选名单
Phase: 14 of 14 (Scoring, Exports, and CLI Verification)
Plan: Phase 14 ready to plan
Status: Phase 13.1 completed and verified; Phase 14 ready to plan
Last activity: 2026-05-11 -- Phase 13.1 completed with 1/1 plan, expanded chart manifest, per-source artifacts, and live full-chart source report

Progress: [████████░░] 75%

## Performance Metrics

**Velocity:**

- Total plans completed: 42
- Average duration: See milestone archives
- Total execution time: See milestone archives

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1.0 Phases 1-5 | 25 | archived | archived |
| v1.1 Phases 6-11 | 12 | archived | archived |
| v1.2 Phase 12 | 5/5 | completed | see plan summaries |
| v1.2 Phase 13 | 3/3 | completed | see plan summaries |
| v1.2 Phase 14 | 0/TBD | pending | pending |

**Recent Trend:**

- Last 5 plans: See `.planning/milestones/v1.1-ROADMAP.md`
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Milestone v1.2]: Scope is a single-run hot-song candidate list generator.
- [Milestone v1.2]: No OpenList matching, automatic downloads, scheduler, weekly comparison/history diff, Admin UI, OCR, database/catalog mutation, or private/login scraping.
- [Milestone v1.2]: KTV-first sources such as QQ 音乐 `K歌金曲榜` and manual CAVCA 金麦榜 rows should outrank generic streaming evidence.
- [Milestone v1.2]: Outputs are review artifacts: Markdown, CSV, and JSON snapshot files.
- [Phase 12]: Source collection planning is split into five execution plans: package/contracts, manifest/manual snapshots, runner/health CLI, QQ K歌 adapter, and Kugou/NetEase fixture support.
- [Phase 12]: Source collection is now executable via `pnpm hot-songs:sources`, supports fixture mode, and writes source health plus raw source rows for KTV-first/support sources.
- [Phase 13]: Normalization planning is split into three execution plans: candidate contracts/text variants, conservative dedupe/stable identities, and normalization CLI fixture snapshot.
- [Phase 13]: Normalization is executable via `pnpm hot-songs:normalize` and writes `.planning/reports/hot-songs/phase-13-fixture-candidates/candidate-snapshot.json`.
- [Phase 13]: Candidate identity stays conservative: normalized title key, sorted artist key set, and variant signature are the merge identity; no scoring/ranking/export/OpenList/download workflows were added.
- [Phase 13.1]: Source coverage was corrected from toy samples to 22 requested logical chart sources with targetRows 500, minRows 400, platform-cap reporting, and per-source JSON artifacts.
- [Phase 13.1]: Live collection generated `.planning/reports/hot-songs/phase-13.1-live-full-chart-coverage/source-report.json` with 2557 rows, 21 usable sources, 1 succeeded source, 20 platform-cap sources, and 1 failed_below_min_rows source.

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-05-11T01:20:00+08:00
Stopped at: Phase 13.1 complete and verified; next action is `$gsd-plan-phase 14`
Resume file: None
