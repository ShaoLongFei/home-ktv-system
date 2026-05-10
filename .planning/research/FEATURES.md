# Feature Research: v1.2 真实 MV 歌库

**Researched:** 2026-05-10
**Scope:** Product behavior for real MKV/MPG MV ingestion
**Confidence:** High for product scope, medium for web playback support until real media testing

## Product Shape

v1.2 should extend the existing scan -> review -> formal catalog -> search/queue -> TV playback path. It should not introduce a separate file browser or one-off import tool. A real MV file becomes useful only after it passes the same trust boundary as the existing formal song catalog.

## Table Stakes

### File Discovery

- User can place `.mkv`, `.mpg`, or `.mpeg` files under the media root.
- Each media file is treated as one song candidate.
- Sibling cover image and `song.json` files are associated with the media file by same-stem naming.
- Partial or unstable files are not probed until stable.

### Metadata Prefill

- Candidate title, artist, duration, language, codecs, and stream facts are prefilled from MediaInfo where available.
- Filename parsing fills gaps when MediaInfo lacks usable title/artist.
- Sibling `song.json` can supply or override user-facing song metadata, but conflicts remain visible.
- Admin can edit all user-facing metadata before admission.

### Track Mapping

- Candidates show all detected audio tracks with index, language, label, codec, channel count, and confidence.
- Admin maps detected tracks to original vocal and accompaniment roles.
- The system preserves raw source-track facts separately from reviewed KTV roles.
- One admitted song can produce one real-MV asset with `trackRoles` for original and accompaniment over the same physical file.

### Review And Admission

- Review-first import is the default.
- Unsupported or uncertain files remain candidates with clear reasons and do not enter search/queue.
- Approved candidates write a formal catalog entry and durable `song.json`.
- Auto-admit is only a reserved policy seam, not default behavior.

### Playback Use

- Verified real MV songs appear in mobile search and can be queued.
- Queue defaults to accompaniment when available.
- TV receives explicit playback target information, including profile and audio track.
- Original/accompaniment switching is shown only when the current runtime reports capability.
- Playback failures surface actionable unsupported/preprocess messages.

## Useful Differentiators

- Cover preview in Admin review.
- Track-role confidence labels.
- Batch approval for clean candidates.
- Duplicate detection against existing formal catalog.
- Clear "needs preprocessing" state for files that are ingestable but not playable.

## Anti-Features

- Silent auto-import of every file.
- Treating MKV/MPG extension as enough to mark a song playable.
- Hiding track role decisions in filename conventions only.
- Requiring mandatory transcoding before the rest of the library flow can work.
- Building Android TV native playback inside v1.2.

## Deferred

- Android TV native player.
- Automatic transcoding/remuxing.
- Online file acquisition and OpenList matching.
- OCR metadata extraction from covers or video frames.
- Multi-room policies.

## Requirements Implications

Requirements should be grouped around media contracts, scan/probe/sidecars, admin review/admission, search/queue/playback, and hardening/future policy seams.
