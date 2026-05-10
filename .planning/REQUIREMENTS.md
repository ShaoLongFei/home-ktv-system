# Requirements: 家庭包厢式 KTV 系统 v1.2 热门歌曲候选名单

**Defined:** 2026-05-10
**Core Value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

## v1.2 Requirements

### Source Ingestion

- [x] **SRC-01**: User can run one command that loads a configured source manifest for public chart/list sources and manual snapshot files.
- [x] **SRC-02**: User can include KTV-first sources, including QQ 音乐 `K歌金曲榜` and manual CAVCA 金麦榜 rows, before general streaming charts.
- [x] **SRC-03**: User can include support sources such as QQ/酷狗/网易云 public charts when available, with each source classified by source type and weight.
- [x] **SRC-04**: User receives a source health report that shows which sources succeeded, failed, were stale, or were skipped, including row counts and warnings.
- [x] **SRC-05**: The command handles partial source failures without hiding them; it fails only when no usable source remains or required configuration is invalid.

### Normalization And Deduplication

- [ ] **NORM-01**: User can review output that preserves raw source title/artist values, readable display values, canonical keys, and all contributing source evidence.
- [ ] **NORM-02**: Same-song rows from multiple sources are merged conservatively using normalized title and artist identity, while same-title different-artist songs remain separate.
- [ ] **NORM-03**: Variant markers such as Live, DJ, Remix, 伴奏, 翻唱, 片段, 女声版, 男声版, and similar descriptors are detected and surfaced as warnings or penalties instead of being silently discarded.
- [ ] **NORM-04**: The generator produces stable candidate IDs and canonical song keys suitable for later weekly comparison or OpenList matching, without implementing those workflows.

### Scoring And Ranking

- [ ] **RANK-01**: User receives a deterministic 0-100 score for each candidate, with the same inputs producing the same ordering and scores.
- [ ] **RANK-02**: KTV/K歌 evidence contributes more than generic streaming heat, so KTV-specific rows can outrank streaming-only hits.
- [ ] **RANK-03**: Cross-source consensus, freshness, metadata confidence, and variant/noise penalties are visible in each candidate's score breakdown.
- [ ] **RANK-04**: Candidates are grouped into review tiers such as `A-优先补歌`, `B-可考虑`, `C-观察`, and `D-不建议/排除`.

### Exports And CLI

- [ ] **OUT-01**: User receives a Markdown report summarizing source health, top candidates, warnings, and manual review guidance.
- [ ] **OUT-02**: User receives a CSV file suitable for spreadsheet review, with columns including rank, score, tier, title, artist, source summary, warnings, and recommended action.
- [ ] **OUT-03**: User receives a JSON snapshot with schema version, run metadata, source statuses, candidates, score breakdowns, canonical keys, and source evidence.
- [ ] **OUT-04**: User can run the generator in fixture/offline mode for repeatable verification without live network access.
- [ ] **OUT-05**: Running the command does not modify the KTV database, media library, OpenList storage, import candidates, or playback state.

## Future Requirements

### Weekly Comparison

- **TREND-01**: User can run the generator weekly and compare against a previous run to identify newly emerging songs.
- **TREND-02**: User can retain historical snapshots and view added, removed, rising, and falling candidates.

### OpenList Matching And Acquisition

- **DL-01**: User can match ranked candidates against OpenList/Baidu Netdisk files.
- **DL-02**: User can select matched candidates and trigger downloads into the KTV import directory.
- **DL-03**: User can view download progress, speed, failures, and completed local paths.

### Review UI And Automation

- **UI-01**: User can review candidate lists in the Admin UI.
- **OCR-01**: User can automatically extract rows from image-only KTV charts such as CAVCA 金麦榜 images.

## Out of Scope

| Feature | Reason |
|---------|--------|
| OpenList file matching | v1.2 first validates source quality, ranking, and review artifacts. |
| Automatic downloads | Download orchestration has separate reliability and compliance concerns. |
| Weekly comparison/history diffing | User requested first step to support single-run only. |
| Background scheduler/cron management | Scheduling depends on future history comparison semantics. |
| Admin UI review surface | CLI output is enough to validate ranking quality first. |
| OCR for image-only charts | Manual CAVCA snapshots are simpler and more reliable for the first milestone. |
| Login scraping, copied cookies, private APIs, CAPTCHA bypass | Public metadata-only access keeps the tool maintainable and within scope. |
| Catalog/database mutation or auto-import | The output is a planning artifact, not a media-library write operation. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRC-01 | Phase 12 | Complete |
| SRC-02 | Phase 12 | Complete |
| SRC-03 | Phase 12 | Complete |
| SRC-04 | Phase 12 | Complete |
| SRC-05 | Phase 12 | Complete |
| NORM-01 | Phase 13 | Pending |
| NORM-02 | Phase 13 | Pending |
| NORM-03 | Phase 13 | Pending |
| NORM-04 | Phase 13 | Pending |
| RANK-01 | Phase 14 | Pending |
| RANK-02 | Phase 14 | Pending |
| RANK-03 | Phase 14 | Pending |
| RANK-04 | Phase 14 | Pending |
| OUT-01 | Phase 14 | Pending |
| OUT-02 | Phase 14 | Pending |
| OUT-03 | Phase 14 | Pending |
| OUT-04 | Phase 14 | Pending |
| OUT-05 | Phase 14 | Pending |

**Coverage:**

- v1.2 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-05-10*
*Last updated: 2026-05-10 after Phase 12 completion*
