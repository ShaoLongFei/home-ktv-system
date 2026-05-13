# Roadmap: 家庭包厢式 KTV 系统

## Milestones

- [x] **v1.0 MVP** - 单房间家庭 KTV 可唱闭环，Phases 1-5，shipped 2026-05-08. Archive: `.planning/milestones/v1.0-ROADMAP.md`
- [x] **v1.1 Polish** - TV 播放体验、产品化 UI、代码结构与逻辑打磨，Phases 6-11，shipped 2026-05-10. Archive: `.planning/milestones/v1.1-ROADMAP.md`
- [ ] **v1.2 真实 MV 歌库** - 真实 MKV/MPG MV 文件接入，Phases 12-16

## Overview

v1.2 将系统从演示歌库推进到真实 MKV/MPG/MPEG MV 歌库。工作沿用既有 `扫描 -> 审核 -> 正式歌库 -> 搜索点歌 -> TV 播放` 链路：一个真实 MV 文件成为一个待审核候选，MediaInfo、文件名、同名 `song.json` 和封面图共同生成可审核元数据，Admin 确认后进入正式歌库，Mobile 和 TV 只使用已验证可排队、可播放、可切换的资源。

Explicitly out of scope for this roadmap: hot-song candidate generation, chart scraping, QQ/Kugou/Netease source ingestion, scoring/ranking, CSV export generation, OpenList matching, download workflows, mandatory transcoding/remuxing, and native Android TV app implementation.

## Phases

**Phase Numbering:**
- v1.0 completed Phases 1-5.
- v1.1 completed Phases 6-11.
- v1.2 continues with Phases 12-16.
- Decimal phases remain reserved for urgent insertions.

- [x] **Phase 12: Contract, Schema, and Playback-Risk Spike** - Define real-MV catalog/player contracts, compatibility states, provenance, and platform-neutral playback boundaries
- [x] **Phase 13: MediaInfo Probe, Scanner, and Sidecars** - Scan stable MKV/MPG/MPEG files with MediaInfo facts, same-stem covers, and same-stem `song.json` metadata (completed 2026-05-12)
- [x] **Phase 14: Admin Review and Catalog Admission** - Let Admin review metadata and track roles, then admit one physical MV as one formal song with a single real-MV asset (completed 2026-05-13)
- [ ] **Phase 15: Search, Queue, Playback, and Switching** - Make approved real MV songs searchable, queueable, playable, and switchable only when runtime capability is verified
- [ ] **Phase 16: Policy Seam, Android Reservation, and Hardening** - Preserve review-first policy, future Android boundaries, regression coverage, and compatibility with existing flows

## Phase Details

### Phase 12: Contract, Schema, and Playback-Risk Spike
**Goal**: System can represent real MV files and their playback risks with platform-neutral catalog/player contracts before ingestion expands.
**Depends on**: Phase 11
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04
**Success Criteria** (what must be TRUE):
  1. User can see one physical MKV/MPG/MPEG file represented as a single song candidate or catalog identity, without duplicate song records for the same file.
  2. User can see whether a real MV file is ingestable, playable, review-required, or unsupported, with explicit reasons when it is not queueable.
  3. Source media facts are preserved with provenance for container, duration, video codec, audio tracks, file size, and metadata source.
  4. Catalog and player payloads expose platform-neutral playback profile and audio-track fields that the current TV player and a future Android TV player can both reuse.
**Plans**: 6 plans
Plans:
- [x] 12-01-PLAN.md - Shared real-MV domain contract types
- [x] 12-02-PLAN.md - Durable schema and repository mapping
- [x] 12-03-PLAN.md - Probe summary, MIME, and compatibility evaluator
- [x] 12-04-PLAN.md - PlaybackTarget profile and selected track ref
- [x] 12-05-PLAN.md - Controlled playback-risk spike harness
- [x] 12-06-PLAN.md - User real-sample playback-risk evidence

### Phase 13: MediaInfo Probe, Scanner, and Sidecars
**Goal**: User can drop real MV files, covers, and sidecar metadata under `MEDIA_ROOT` and get stable, reviewable candidates.
**Depends on**: Phase 12
**Requirements**: SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05
**Success Criteria** (what must be TRUE):
  1. User can place `.mkv`, `.mpg`, or `.mpeg` files under `MEDIA_ROOT` and trigger existing scan flows to produce review candidates.
  2. Candidate preview shows a same-stem cover image when one is present beside the media file.
  3. Candidate metadata is prefilled from MediaInfo first, then missing fields are filled from filename and sibling `song.json` inputs.
  4. Candidates clearly show metadata provenance and can be retried or reconciled after partial or unstable large files become stable.
**Plans**: 4 plans
Plans:
- [x] 13-01-PLAN.md - Scanner extension, sidecar/cover discovery, artifact-aware quick hash, and unstable-file guard
- [x] 13-02-PLAN.md - Sidecar schema, filename parser, metadata draft, provenance, and conflict preservation
- [x] 13-03-PLAN.md - Sidecar metadata wiring, single-file real MV candidate integration, track roles, playback profile, and compatibility status
- [ ] 13-04-PLAN.md - Admin import serialization, safe cover preview route, and minimal real MV preview UI
**UI hint**: yes

### Phase 14: Admin Review and Catalog Admission
**Goal**: Admin can resolve metadata, conflicts, compatibility, and audio-track roles before admitting real MV candidates into the formal catalog.
**Depends on**: Phase 13
**Requirements**: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05
**Success Criteria** (what must be TRUE):
  1. Admin can review title, artist, language, cover, MediaInfo facts, filename-derived fields, sidecar fields, and conflicts before admission.
  2. Admin can map detected audio tracks to original vocal and accompaniment roles while raw track facts remain visible.
  3. Approved real MV candidate becomes one formal song with one real-MV asset that stores original/accompaniment `trackRoles`.
  4. Approved real MV songs write and validate formal `song.json` with media path, cover path, one asset, track role refs, codecs, and compatibility status.
  5. Unsupported or incomplete candidates remain visible with repair or preprocessing guidance and do not block other candidates from admission.
**Plans**:
- [x] 14-01-PLAN.md - API contract for reviewed real-MV track role persistence
- [x] 14-02-PLAN.md - Admin review UI for metadata, media facts, track roles, and repair guidance
- [x] 14-03-PLAN.md - Real-MV formal admission branch, compatibility readiness, and cover sidecar promotion
- [x] 14-04-PLAN.md - Durable real-MV `song.json` writing and consistency validation
- [x] 14-05-PLAN.md - Cross-surface real-MV admission and review regression coverage
**UI hint**: yes

### Phase 15: Search, Queue, Playback, and Switching
**Goal**: Mobile and TV users can use approved real MV songs in the existing singing flow with capability-gated playback and switching.
**Depends on**: Phase 14
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05
**Success Criteria** (what must be TRUE):
  1. User can search approved real MV songs with the existing Chinese-first behavior and queue them from the mobile controller.
  2. Queueing a dual-track real MV defaults to accompaniment when an accompaniment track is confirmed.
  3. TV receives an explicit playback profile and `selectedTrackRef` for real MV assets.
  4. User can switch original/accompaniment during playback only when the TV runtime has verified track-switch capability.
  5. User sees a clear unsupported or needs-preprocessing state when a real MV cannot load, seek, resume, or switch as advertised.
**Plans**:
- [x] 15-01-PLAN.md - Search visibility and queueability metadata for real-MV songs
- [ ] 15-02-PLAN.md - Queue-time vocal-mode resolution and playback target selected track intent
- [ ] 15-03-PLAN.md - Same-asset switch target contract and switch commit persistence
- [ ] 15-04-PLAN.md - TV runtime audio-track selection, capability gating, and Chinese failure notices
- [ ] 15-05-PLAN.md - Mobile disabled-state UI and cross-surface real-MV playback regression coverage
**UI hint**: yes

### Phase 16: Policy Seam, Android Reservation, and Hardening
**Goal**: Real MV library support remains compatible with existing songs and tasks while reserved policy and platform fields are tested and safe.
**Depends on**: Phase 15
**Requirements**: HARD-01, HARD-02, HARD-03
**Success Criteria** (what must be TRUE):
  1. Review-first admission remains the default policy, while auto-admit eligibility is stored only as a reserved capability and does not silently admit real MV files.
  2. Real MV import, playback, and switch behavior is covered by fixtures or tests using representative two-track and unsupported media cases.
  3. Existing demo/local songs, online supplement tasks, queue controls, and admin maintenance remain compatible after real MV schema changes.
  4. Future Android TV expectations remain captured as catalog/player boundaries only, with no native Android TV app entering v1.2.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 12 -> 13 -> 14 -> 15 -> 16

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 12. Contract, Schema, and Playback-Risk Spike | 6/6 | Completed | 2026-05-12 |
| 13. MediaInfo Probe, Scanner, and Sidecars | 3/4 | Complete    | 2026-05-12 |
| 14. Admin Review and Catalog Admission | 5/5 | Complete    | 2026-05-13 |
| 15. Search, Queue, Playback, and Switching | 1/5 | In Progress|  |
| 16. Policy Seam, Android Reservation, and Hardening | 0/TBD | Not started | - |
