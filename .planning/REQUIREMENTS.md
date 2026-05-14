# Requirements: 家庭包厢式 KTV 系统 v1.3 真实场景接入、部署和验证

**Defined:** 2026-05-14
**Core Value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

## v1.3 Requirements

### KTV Index Read Model

- [ ] **INDEX-01**: Admin or operator can see whether PostgreSQL has the required `ktv_*` tables, latest index run, active asset count, missing asset count, and indexed library root.
- [ ] **INDEX-02**: Mobile search can query active `ktv_song_assets` only, filtering out rows where `missing_at is not null`.
- [ ] **INDEX-03**: Mobile search can find indexed songs by title, artist, pinyin, initials, and category/version metadata without loading the whole library into memory.
- [ ] **INDEX-04**: Search results clearly distinguish existing formal catalog songs from KTV indexed results.

### Runtime Catalog Sync

- [ ] **SYNC-01**: User can queue a selected KTV indexed asset from Mobile without manually importing or approving it first.
- [ ] **SYNC-02**: Queueing a KTV indexed asset idempotently creates or reuses one canonical `songs` row and one canonical `assets` row.
- [ ] **SYNC-03**: Canonical records created from the KTV index preserve source index identity, file path, title, primary artist, category, extension, size, and parse confidence.
- [ ] **SYNC-04**: Existing queue operations continue to work for synced real songs: add, duplicate confirmation, promote, delete, undo delete, skip current, and room snapshot refresh.

### Real Media Path And Playback

- [ ] **MEDIA-01**: API can resolve a stored KTV index `file_path` such as `/mnt/nas/KTV歌曲/...` to a path readable by the running API process.
- [ ] **MEDIA-02**: API preflight reports unreadable, missing, or unmapped real media paths before the user depends on playback.
- [ ] **MEDIA-03**: Synced real media assets stream through the existing asset gateway with byte-range support and correct MIME handling for MKV/MPG/MPEG candidates.
- [ ] **MEDIA-04**: TV receives a normal existing `PlaybackTarget` for synced real assets, including explicit compatibility/preprocess state when browser playback is not proven.
- [ ] **MEDIA-05**: Original/accompaniment switching remains capability-gated; if a real asset cannot switch tracks, controls stay safe and the user gets a clear message.

### Deployment And Operations

- [ ] **DEPLOY-01**: User can start API, Admin, TV, and Mobile in a real-library mode with one documented command/profile and per-service logs.
- [ ] **DEPLOY-02**: Real-library deployment config includes `DATABASE_URL`, `PUBLIC_BASE_URL`, controller/TV URLs, KTV index source root, and media path mapping.
- [ ] **DEPLOY-03**: Deployment startup or a companion health command verifies PostgreSQL, `ktv_*` counts, NAS path mapping, sample file readability, API health, and TV/Mobile URLs.
- [ ] **DEPLOY-04**: Operator can refresh the full KTV index or run a safe limited smoke index command without accidentally marking missing assets.

### Real-World Verification

- [ ] **VERIFY-01**: A repeatable smoke check proves database counts, search, queue-time sync, queue insertion, TV snapshot target, and asset stream reachability.
- [ ] **VERIFY-02**: User can follow a UAT checklist to verify real search -> queue -> TV playback -> skip/promote/delete -> recovery using real indexed songs.
- [ ] **VERIFY-03**: Verification distinguishes four states: indexed, file-readable, browser-playable, and audio-track-switchable.
- [ ] **VERIFY-04**: Failure cases for missing path, unreadable path, unsupported browser playback, and stale index row show actionable Chinese messages in Mobile/Admin/TV where relevant.

## Future Requirements

### Android TV Native Playback

- **ATV-01**: User can install an Android TV native player for more reliable real MV decoding and audio-track selection.
- **ATV-02**: Android TV native player can report codec, container, and audio-track capability back to the server.

### Media Processing

- **PROC-01**: User can batch remux or transcode unsupported real MV files into a browser/Android-supported profile.
- **PROC-02**: User can run preprocessing jobs from Admin with progress, logs, and retry controls.

### Bulk Catalog Management

- **BULK-01**: Operator can bulk sync selected categories or artists from `ktv_*` into canonical `songs/assets`.
- **BULK-02**: Operator can reconcile canonical rows against updated `ktv_*` index runs.

### Discovery And Ranking

- **RANK-01**: Search can use hot-song or local usage signals to rank real indexed songs beyond text match quality.

## Out of Scope

Explicitly excluded for v1.3.

| Feature | Reason |
|---------|--------|
| Android TV native app | v1.3 focuses on real runtime integration and deployment using the current TV player. |
| Mandatory transcoding/remuxing | v1.3 must first expose whether real files are reachable/playable; preprocessing is a later capability. |
| Bulk import of all 34k+ indexed assets into canonical catalog | Queue-time sync is safer and avoids bloating runtime tables before real usage is proven. |
| Multi-room media partitioning | Current product remains single-room home KTV. |
| Online provider acquisition or download workflows | v1.3 uses the real local/NAS library already indexed. |
| Hot-song ranking as search behavior | Ranking can improve later; v1.3 prioritizes correctness and real playback. |
| User accounts and permissions | Not needed for the single-family deployment model. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INDEX-01 | Phase 18 | Pending |
| INDEX-02 | Phase 18 | Pending |
| INDEX-03 | Phase 18 | Pending |
| INDEX-04 | Phase 18 | Pending |
| SYNC-01 | Phase 19 | Pending |
| SYNC-02 | Phase 19 | Pending |
| SYNC-03 | Phase 19 | Pending |
| SYNC-04 | Phase 19 | Pending |
| MEDIA-01 | Phase 20 | Pending |
| MEDIA-02 | Phase 20 | Pending |
| MEDIA-03 | Phase 20 | Pending |
| MEDIA-04 | Phase 20 | Pending |
| MEDIA-05 | Phase 20 | Pending |
| DEPLOY-01 | Phase 21 | Pending |
| DEPLOY-02 | Phase 21 | Pending |
| DEPLOY-03 | Phase 21 | Pending |
| DEPLOY-04 | Phase 21 | Pending |
| VERIFY-01 | Phase 22 | Pending |
| VERIFY-02 | Phase 22 | Pending |
| VERIFY-03 | Phase 22 | Pending |
| VERIFY-04 | Phase 22 | Pending |

**Coverage:**

- v1.3 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-05-14*
*Last updated: 2026-05-14 after defining v1.3 requirements*
