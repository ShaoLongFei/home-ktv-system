# Requirements: 家庭包厢式 KTV 系统 v1.2 真实 MV 歌库

**Defined:** 2026-05-10
**Core Value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

## v1.2 Requirements

### Media Contracts

- [ ] **MEDIA-01**: User can store one MKV/MPG/MPEG MV file as one song candidate, without creating duplicate song records for the same physical file.
- [ ] **MEDIA-02**: User can see whether a real MV file is ingestable, playable, review-required, or unsupported, with explicit reasons when it is not queueable.
- [ ] **MEDIA-03**: User can preserve source media facts including container, duration, video codec, audio tracks, file size, and metadata provenance.
- [ ] **MEDIA-04**: Future Android TV playback can reuse platform-neutral catalog/player fields without v1.2 implementing an Android TV app.

### Scan And Metadata

- [x] **SCAN-01**: User can place `.mkv`, `.mpg`, or `.mpeg` files under `MEDIA_ROOT` and trigger existing scan flows to produce review candidates.
- [x] **SCAN-02**: User can place same-stem cover images beside a media file and have the candidate show that cover for preview.
- [x] **SCAN-03**: User can place same-stem `song.json` beside a media file and have its metadata used as a review input.
- [x] **SCAN-04**: Candidate metadata is prefilled from MediaInfo first, then filename and sibling `song.json` fallback where fields are missing.
- [x] **SCAN-05**: Scanner avoids probing partial or unstable large files and can retry/reconcile candidates after files become stable.

### Admin Review And Admission

- [x] **REVIEW-01**: Admin can review title, artist, language, cover, MediaInfo facts, filename-derived fields, sidecar fields, and conflicts before admission.
- [x] **REVIEW-02**: Admin can map detected audio tracks to original vocal and accompaniment roles, with raw track facts still preserved.
- [x] **REVIEW-03**: Admin can approve a real MV candidate into the formal catalog as one song with one real-MV asset that stores original/accompaniment `trackRoles`.
- [x] **REVIEW-04**: Approved real MV songs write and validate formal `song.json` including media path, cover path, assets, track indexes, codecs, and compatibility status.
- [x] **REVIEW-05**: Unsupported or incomplete candidates remain visible with repair/preprocess guidance and do not block other candidates from admission.

### Search Queue Playback

- [x] **PLAY-01**: User can search and queue approved real MV songs from the mobile controller using the existing Chinese-first search behavior.
- [x] **PLAY-02**: Queueing a dual-track real MV defaults to accompaniment when an accompaniment track is confirmed.
- [x] **PLAY-03**: TV receives an explicit playback profile and `selectedTrackRef` for real MV assets.
- [x] **PLAY-04**: User can switch original/accompaniment during playback only when the TV runtime has verified track-switch capability.
- [x] **PLAY-05**: User sees a clear unsupported or needs-preprocessing state when a real MV cannot load, seek, resume, or switch as advertised.

### Policy And Hardening

- [x] **HARD-01**: Review-first admission remains the default policy, while auto-admit eligibility is stored only as a reserved capability.
- [x] **HARD-02**: Real MV import, playback, and switch behavior is covered by fixtures or tests using representative two-track and unsupported media cases.
- [x] **HARD-03**: Existing demo/local songs, online supplement tasks, queue controls, and admin maintenance remain compatible after real MV schema changes.

## Future Requirements

### Android TV Native Playback

- **ATV-01**: User can install an Android TV player that binds to the room and plays catalog assets natively.
- **ATV-02**: Android TV player can select and switch source audio tracks using native media APIs.
- **ATV-03**: Android TV compatibility can be validated against device-specific container and codec support.

### Media Processing

- **PROC-01**: User can manually or automatically transcode/remux unsupported real MV files into a supported playback profile.
- **PROC-02**: User can batch-normalize media paths, covers, and sidecars before admission.

### Acquisition

- **ACQ-01**: User can match missing songs against OpenList or online storage sources.
- **ACQ-02**: User can download matched MV files into the import directory.

## Out of Scope

Explicitly excluded for v1.2.

| Feature | Reason |
|---------|--------|
| Android TV native app | v1.2 focuses on media contracts and real MV library admission first. |
| Mandatory transcoding/remuxing | User will preprocess unsupported files on the server side when needed. |
| Auto-admit enabled by default | Real MV metadata and audio-track roles need review before trust. |
| Online provider/OpenList acquisition | v1.2 is about using files already available under `MEDIA_ROOT`. |
| Hot-song charts or recommendation generation | Not part of real media ingestion/playback readiness. |
| OCR metadata extraction | Sidecar `song.json`, filename, MediaInfo, and Admin edits are enough for this milestone. |
| AI vocal separation or software DSP | Audio processing remains outside the software playback path. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MEDIA-01 | Phase 12 | Pending |
| MEDIA-02 | Phase 12 | Pending |
| MEDIA-03 | Phase 12 | Pending |
| MEDIA-04 | Phase 12 | Pending |
| SCAN-01 | Phase 13 | Complete |
| SCAN-02 | Phase 13 | Complete |
| SCAN-03 | Phase 13 | Complete |
| SCAN-04 | Phase 13 | Complete |
| SCAN-05 | Phase 13 | Complete |
| REVIEW-01 | Phase 14 | Complete |
| REVIEW-02 | Phase 14 | Complete |
| REVIEW-03 | Phase 14 | Complete |
| REVIEW-04 | Phase 14 | Complete |
| REVIEW-05 | Phase 14 | Complete |
| PLAY-01 | Phase 15 | Complete |
| PLAY-02 | Phase 15 | Complete |
| PLAY-03 | Phase 15 | Complete |
| PLAY-04 | Phase 15 | Complete |
| PLAY-05 | Phase 15 | Complete |
| HARD-01 | Phase 16 | Complete |
| HARD-02 | Phase 16 | Complete |
| HARD-03 | Phase 16 | Complete |

**Coverage:**

- v1.2 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-05-10*
*Last updated: 2026-05-13 after Phase 16 completion*
