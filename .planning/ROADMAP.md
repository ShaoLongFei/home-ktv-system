# Roadmap: 家庭包厢式 KTV 系统

## Milestones

- [x] **v1.0 MVP** - 单房间家庭 KTV 可唱闭环，Phases 1-5，shipped 2026-05-08. Archive: `.planning/milestones/v1.0-ROADMAP.md`
- [x] **v1.1 Polish** - TV 播放体验、产品化 UI、代码结构与逻辑打磨，Phases 6-11，shipped 2026-05-10. Archive: `.planning/milestones/v1.1-ROADMAP.md`
- [x] **v1.2 真实 MV 歌库** - 真实 MKV/MPG MV 文件接入，Phases 12-17，shipped 2026-05-14. Archive: `.planning/milestones/v1.2-ROADMAP.md`
- [ ] **v1.3 真实场景接入、部署和验证** - 真实 `ktv_*` 索引和 NAS 歌库接入产品 runtime，Phases 18-22

## Overview

v1.3 把已经建立好的真实 KTV 索引和 NAS 媒体库接入实际产品运行链路。目标不是再证明真实 MV 文件如何建模，而是让用户在真实部署中用手机搜索到 `ktv_*` 索引中的歌曲，点歌时安全同步到现有 `songs/assets` 正式运行表，复用队列、TV 播放、切歌和恢复逻辑，并通过一套可重复部署和 UAT 流程验证真实场景可用。

Explicitly out of scope for this roadmap: native Android TV app, mandatory transcoding/remuxing, bulk import of the whole indexed library, multi-room library partitioning, online provider acquisition/downloads, hot-song ranking, user accounts, and scoring/DSP features.

## Current Milestone: v1.3 真实场景接入、部署和验证

**Goal:** 让手机搜索、点歌、后台诊断和 TV 播放实际使用已建立的 `ktv_*` 索引与 `/mnt/nas/KTV歌曲` 真实媒体库，并形成可重复部署与真实场景验证流程。

**Phase Numbering:**
- v1.0 completed Phases 1-5.
- v1.1 completed Phases 6-11.
- v1.2 completed Phases 12-17.
- v1.3 continues with Phases 18-22.
- Decimal phases remain reserved for urgent insertions.

## Phases

- [ ] **Phase 18: KTV Index Read Model and Diagnostics** - Make the real index queryable, bounded, observable, and visible to Admin/operators.
- [ ] **Phase 19: Search and Queue-Time Catalog Sync** - Let Mobile queue indexed songs by syncing selected assets into canonical `songs/assets`.
- [ ] **Phase 20: Real Media Path, Streaming, and Playback Target Verification** - Prove synced real assets can resolve paths, stream, and reach TV playback safely.
- [ ] **Phase 21: Real Deployment Profile and Operator Workflow** - Provide one clear real-mode deployment path with logs, env, health checks, and index refresh commands.
- [ ] **Phase 22: Real-Scene UAT, Failure States, and Milestone Hardening** - Validate real search-to-playback flows and close failure/recovery evidence.

## Phase Details

### Phase 18: KTV Index Read Model and Diagnostics

**Goal**: Product and operators can safely inspect and search the real `ktv_*` index without touching queue/playback yet.
**Depends on**: Phase 17
**Requirements**: INDEX-01, INDEX-02, INDEX-03, INDEX-04
**Success Criteria** (what must be TRUE):
  1. API has a read-only repository for `ktv_index_runs`, `ktv_songs`, `ktv_artists`, `ktv_song_artists`, and active `ktv_song_assets`.
  2. Search queries use indexed normalized fields and active-asset filters, with bounded limits and no whole-library in-memory scans.
  3. Admin/operator diagnostics can show latest run, active/missing counts, indexed source root, and query health.
  4. Product search response can distinguish formal catalog results from KTV indexed results without exposing unsafe queue actions yet.
**Plans**: 3 plans
Plans:
- [ ] 18-01-PLAN.md - KTV index repository, query contracts, and stats model
- [ ] 18-02-PLAN.md - API/Admin diagnostics and bounded search preview
- [ ] 18-03-PLAN.md - Search response source labeling and regression coverage

### Phase 19: Search and Queue-Time Catalog Sync

**Goal**: User can queue a KTV indexed song from Mobile while existing queue/playback continues using canonical `songs/assets` IDs.
**Depends on**: Phase 18
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04
**Success Criteria** (what must be TRUE):
  1. Mobile search renders queueable indexed song versions with clear source/version labels.
  2. Queueing an indexed asset creates or reuses one canonical Song and one canonical Asset idempotently.
  3. Synced canonical rows preserve source index identity, file path, title, artist, category, extension, size, and parse confidence.
  4. Existing queue commands and realtime snapshots work for synced real songs with no second ID universe in `queue_entries`.
**Plans**: 4 plans
Plans:
- [ ] 19-01-PLAN.md - Indexed result contract and Mobile search UI
- [ ] 19-02-PLAN.md - Idempotent indexed-asset catalog sync service
- [ ] 19-03-PLAN.md - Queue command integration and duplicate handling
- [ ] 19-04-PLAN.md - Queue/realtime regression coverage for synced real songs
**UI hint**: yes

### Phase 20: Real Media Path, Streaming, and Playback Target Verification

**Goal**: Synced real songs can be resolved from NAS-indexed paths, streamed through the API, and delivered to TV as safe playback targets.
**Depends on**: Phase 19
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, MEDIA-05
**Success Criteria** (what must be TRUE):
  1. API can map indexed `/mnt/nas/KTV歌曲/...` file paths to readable runtime paths through explicit configuration.
  2. Unmapped, missing, or unreadable real media paths are reported before or during queue/playback with clear Chinese guidance.
  3. Asset gateway serves synced MKV/MPG/MPEG files with byte-range support and appropriate MIME behavior.
  4. TV receives normal existing PlaybackTarget payloads for synced real assets and does not need to understand `ktv_*` IDs.
  5. Original/accompaniment switching remains runtime capability-gated and never claims support before TV proves it.
**Plans**: 4 plans
Plans:
- [ ] 20-01-PLAN.md - Media path resolver and preflight status model
- [ ] 20-02-PLAN.md - Asset gateway streaming for synced real media
- [ ] 20-03-PLAN.md - PlaybackTarget and TV failure-state verification
- [ ] 20-04-PLAN.md - Capability-gated switching and media-path regression coverage

### Phase 21: Real Deployment Profile and Operator Workflow

**Goal**: User can deploy all four local services against the real database and NAS library with one clear command path and useful logs/health checks.
**Depends on**: Phase 20
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04
**Success Criteria** (what must be TRUE):
  1. Real-library mode starts API, Admin, TV, and Mobile with consistent `DATABASE_URL`, `PUBLIC_BASE_URL`, controller URLs, KTV index root, and media path mapping.
  2. Per-service logs remain available and tail-able through existing local deployment tooling.
  3. A health/preflight command verifies PostgreSQL, index counts, NAS mapping, sample file readability, API health, and service URLs.
  4. Operator documentation explains full index refresh, safe limited smoke index runs, and how to avoid marking assets missing accidentally.
**Plans**: 3 plans
Plans:
- [ ] 21-01-PLAN.md - Real-mode deployment profile and env contract
- [ ] 21-02-PLAN.md - Health/preflight command and per-service log workflow
- [ ] 21-03-PLAN.md - Index refresh documentation and operator safeguards

### Phase 22: Real-Scene UAT, Failure States, and Milestone Hardening

**Goal**: The milestone is verified end-to-end against the real indexed library, with clear failure boundaries and regression evidence.
**Depends on**: Phase 21
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04
**Success Criteria** (what must be TRUE):
  1. Automated smoke check proves database counts, search, queue-time sync, queue insertion, TV snapshot target, and asset stream reachability.
  2. Human UAT checklist verifies real search -> queue -> TV playback -> skip/promote/delete -> recovery using actual indexed songs.
  3. Verification reports separately track indexed, file-readable, browser-playable, and audio-track-switchable states.
  4. Missing path, unreadable path, unsupported playback, and stale index failures show actionable Chinese messages in the relevant surface.
  5. Milestone audit can prove all v1.3 requirements are mapped, tested, and ready to archive.
**Plans**: 3 plans
Plans:
- [ ] 22-01-PLAN.md - Real-scene smoke script and verification report
- [ ] 22-02-PLAN.md - Manual UAT guide and failure-state polish
- [ ] 22-03-PLAN.md - Milestone hardening, traceability, and audit readiness
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 18 -> 19 -> 20 -> 21 -> 22

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 18. KTV Index Read Model and Diagnostics | 0/3 | Not Started | — |
| 19. Search and Queue-Time Catalog Sync | 0/4 | Blocked on Phase 18 | — |
| 20. Real Media Path, Streaming, and Playback Target Verification | 0/4 | Blocked on Phase 19 | — |
| 21. Real Deployment Profile and Operator Workflow | 0/3 | Blocked on Phase 20 | — |
| 22. Real-Scene UAT, Failure States, and Milestone Hardening | 0/3 | Blocked on Phase 21 | — |

## Archived Phase Details

- v1.0 phases: `.planning/milestones/v1.0-phases/`
- v1.1 phases: `.planning/milestones/v1.1-phases/`
- v1.2 phases: `.planning/milestones/v1.2-phases/`

