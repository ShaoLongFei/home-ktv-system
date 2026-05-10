# Roadmap: 家庭包厢式 KTV 系统

## Milestones

- [x] **v1.0 MVP** - 单房间家庭 KTV 可唱闭环，Phases 1-5，shipped 2026-05-08. Archive: `.planning/milestones/v1.0-ROADMAP.md`
- [x] **v1.1 Polish** - TV 播放体验、产品化 UI、代码结构与逻辑打磨，Phases 6-11，shipped 2026-05-10. Archive: `.planning/milestones/v1.1-ROADMAP.md`
- [ ] **v1.2 热门歌曲候选名单** - 单次运行生成热门补歌候选名单，Phases 12-14.

## Overview

v1.2 delivers a single-run hot-song candidate list generator. The milestone starts from configured public chart/list sources and manual snapshot files, normalizes and deduplicates candidate songs conservatively, then produces deterministic ranked review artifacts in Markdown, CSV, and JSON. It does not include OpenList matching, automatic downloads, scheduling, weekly comparison/history diffing, Admin UI, OCR, database/catalog mutation, or private/login scraping.

## Archived Milestones

<details>
<summary>v1.0 MVP (Phases 1-5) - SHIPPED 2026-05-08</summary>

- Archive: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

Completed phases:

- [x] Phase 01: Media Contract & TV Runtime (3/3 plans)
- [x] Phase 02: Library Ingest & Catalog Admin (6/6 plans)
- [x] Phase 03: Room Sessions & Queue Control (8/8 plans)
- [x] Phase 04: Search & Song Selection (3/3 plans)
- [x] Phase 05: Online Supplement & Recovery (5/5 plans)

</details>

<details>
<summary>v1.1 Polish (Phases 6-11) - SHIPPED 2026-05-10</summary>

- Archive: `.planning/milestones/v1.1-ROADMAP.md`
- Requirements: `.planning/milestones/v1.1-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1.1-MILESTONE-AUDIT.md`

Completed phases:

- [x] Phase 06: TV Playback Experience Polish (3/3 plans)
- [x] Phase 07: Productized UI Polish (3/3 plans)
- [x] Phase 08: Code Structure & Logic Hardening (1/1 summary-backed phase)
- [x] Phase 09: Verification & Traceability Closure (1/1 plan)
- [x] Phase 10: Paired Mobile Visual Verification (1/1 plan)
- [x] Phase 11: Admin Runtime Boundary Completion (3/3 plans)

</details>

## Phases

- [x] **Phase 12: Source Contracts and Fetch Harness** - Load configured public/manual sources, classify them, and report source health for a single run.
- [ ] **Phase 13: Normalization and Dedupe** - Preserve source evidence while producing stable, conservative candidate identities.
- [ ] **Phase 14: Scoring, Exports, and CLI Verification** - Rank candidates deterministically and write review artifacts without mutating the KTV system.

## Phase Details

### Phase 12: Source Contracts and Fetch Harness
**Goal**: User can run a single source collection command that loads configured public/manual chart sources and reports usable source health without hiding failures.
**Depends on**: Phase 11
**Requirements**: SRC-01, SRC-02, SRC-03, SRC-04, SRC-05
**Success Criteria** (what must be TRUE):
  1. User can run one command that loads a source manifest containing public chart/list sources and manual snapshot files.
  2. User can include KTV-first sources such as QQ 音乐 `K歌金曲榜` and manual CAVCA 金麦榜 rows ahead of general streaming charts.
  3. User can include support sources such as QQ, 酷狗, and 网易云 public charts when available, with every source classified by source type and weight.
  4. User receives a source health report showing succeeded, failed, stale, and skipped sources with row counts and warnings.
  5. Partial source failures remain visible while the run continues if at least one usable source remains, and the command fails only for no usable source or invalid required configuration.
**Plans**: 5 plans

Plans:
- [x] 12-01: Add hot-songs package and source contracts
- [x] 12-02: Load manifests and manual CAVCA snapshots
- [x] 12-03: Wire runner, source health report, and manual-source CLI
- [x] 12-04: Add QQ Music K歌金曲榜 public adapter
- [x] 12-05: Add Kugou/NetEase support adapters and full fixture run

### Phase 13: Normalization and Dedupe
**Goal**: User receives a conservative candidate identity layer that preserves source evidence, merges only same-song rows, flags noisy variants, and emits stable keys for later workflows.
**Depends on**: Phase 12
**Requirements**: NORM-01, NORM-02, NORM-03, NORM-04
**Success Criteria** (what must be TRUE):
  1. User can inspect each candidate's raw source title/artist values, readable display values, canonical keys, and all contributing source evidence.
  2. Same-song rows from multiple sources merge by normalized title and artist identity, while same-title different-artist songs remain separate.
  3. Variant markers such as Live, DJ, Remix, 伴奏, 翻唱, 片段, 女声版, 男声版, and similar descriptors surface as warnings or penalties instead of being silently discarded.
  4. The generator produces stable candidate IDs and canonical song keys suitable for future weekly comparison or OpenList matching without implementing those workflows.
**Plans**: TBD

### Phase 14: Scoring, Exports, and CLI Verification
**Goal**: User can run the single-run generator live or offline and receive deterministic ranked artifacts without changing the KTV runtime, catalog, or storage state.
**Depends on**: Phase 13
**Requirements**: RANK-01, RANK-02, RANK-03, RANK-04, OUT-01, OUT-02, OUT-03, OUT-04, OUT-05
**Success Criteria** (what must be TRUE):
  1. User receives deterministic 0-100 candidate scores and ordering from identical inputs, with visible score breakdowns for KTV evidence, cross-source consensus, freshness, metadata confidence, and variant/noise penalties.
  2. KTV/K歌 evidence contributes more than generic streaming heat, and candidates are grouped into `A-优先补歌`, `B-可考虑`, `C-观察`, and `D-不建议/排除` tiers.
  3. User receives Markdown, CSV, and JSON outputs containing source health, ranked candidates, warnings, run metadata, source statuses, canonical keys, source evidence, and recommended actions.
  4. User can run the generator in fixture/offline mode for repeatable verification without live network access.
  5. Running the command does not modify the KTV database, media library, OpenList storage, import candidates, or playback state.
**Plans**: TBD

## Coverage

| Requirement | Phase |
|-------------|-------|
| SRC-01 | Phase 12 |
| SRC-02 | Phase 12 |
| SRC-03 | Phase 12 |
| SRC-04 | Phase 12 |
| SRC-05 | Phase 12 |
| NORM-01 | Phase 13 |
| NORM-02 | Phase 13 |
| NORM-03 | Phase 13 |
| NORM-04 | Phase 13 |
| RANK-01 | Phase 14 |
| RANK-02 | Phase 14 |
| RANK-03 | Phase 14 |
| RANK-04 | Phase 14 |
| OUT-01 | Phase 14 |
| OUT-02 | Phase 14 |
| OUT-03 | Phase 14 |
| OUT-04 | Phase 14 |
| OUT-05 | Phase 14 |

Coverage: 18/18 v1.2 requirements mapped exactly once.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 12. Source Contracts and Fetch Harness | v1.2 | 5/5 | Complete | 2026-05-10 |
| 13. Normalization and Dedupe | v1.2 | 0/TBD | Not started | - |
| 14. Scoring, Exports, and CLI Verification | v1.2 | 0/TBD | Not started | - |
