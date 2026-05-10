# Project Research Summary

**Project:** 家庭包厢式 KTV 系统
**Domain:** v1.2 真实 MKV/MPG MV 歌库接入
**Researched:** 2026-05-10
**Confidence:** Medium-high

## Executive Summary

v1.2 should extend the existing scan -> review -> formal catalog -> search/queue -> TV playback flow. A real MKV/MPG file becomes one song candidate. Optional same-stem cover image and `song.json` enrich the candidate. MediaInfo supplies primary technical metadata, filename parsing fills gaps, and Admin review remains the default trust boundary.

The recommended model is one physical MV file -> one formal `Song` -> two logical `Asset` rows over the same file path when original/accompaniment tracks are confirmed. Each logical asset carries `vocalMode` and explicit track information. Playback targets should gain a platform-neutral `playbackProfile` so the current web TV and future Android TV can both understand the intent.

The hard risks are playback compatibility and track semantics. MKV/MPG extension support does not guarantee browser playback, and browser audio-track switching is not reliable enough to assume. v1.2 should mark compatibility explicitly, keep unsupported files out of search/queue, and only show switching where runtime capability is verified.

## Stack Additions

- MediaInfo probe wrapper for container, duration, codecs, and audio-track metadata.
- Scanner support for `.mkv`, `.mpg`, and `.mpeg`.
- Same-stem sidecar resolver for cover image and `song.json`.
- Compatibility evaluator with explicit unsupported reasons.
- Domain/catalog/player-contract fields for media profile, audio-track selection, provenance, cover path, and compatibility.
- Asset gateway MIME/range handling for large real MV files.
- Representative real-media fixtures and TV runtime smoke tests.

## Table Stakes

- Scan real MV files as reviewable candidates.
- Preserve metadata provenance from MediaInfo, filename, sidecar, and Admin edits.
- Show detected audio tracks and require reviewable original/accompaniment mapping.
- Promote approved candidate into one song plus logical assets.
- Write/validate formal `song.json` with media, cover, track, and compatibility information.
- Search, queue, play, and switch only verified/queueable real MV assets.
- Mark unsupported or uncertain files clearly and keep them out of normal user flows.

## Architecture Approach

Extend the existing architecture:

1. Scanner discovers real MV files.
2. Sidecar resolver attaches cover and `song.json`.
3. MediaInfo probe extracts technical facts.
4. Candidate builder merges metadata and provenance.
5. Admin review confirms user-facing metadata and track roles.
6. Catalog admission writes one song plus logical assets.
7. Search/queue selects verified assets.
8. TV playback receives an explicit profile and track selection.

## Key Risks

- Extension is not playback proof.
- Web TV may not expose usable audio-track switching.
- Track index and vocal role can be confused.
- Sidecar, filename, MediaInfo, and Admin edits can conflict.
- Large file copy/scanning can race.
- Android TV assumptions can leak into v1.2.

## v1.2 Scope

- MKV/MPG/MPEG discovery.
- Optional sibling cover and `song.json`.
- MediaInfo-first metadata and track extraction.
- Filename and sidecar fallback metadata.
- Review-first import.
- One physical MV represented as logical original/accompaniment assets.
- Direct playback only with explicit compatibility marking.
- Web TV contract updates and capability-gated track switching.
- Android TV contract reservation only.

## Out Of Scope

- Automatic transcoding/remuxing.
- Android TV native player.
- Auto-admit enabled by default.
- Online provider/OpenList acquisition and downloads.
- Hot-song charts or recommendation generation.
- OCR, scoring, DSP, AI separation, and multi-room expansion.

## Roadmap Implications

1. Contract, schema, and playback-risk spike.
2. MediaInfo probe, scanner, and sidecars.
3. Admin review and catalog admission.
4. Search, queue, playback, and switching.
5. Policy seam, Android reservation, and hardening.

## Sources

- [PROJECT.md](../PROJECT.md)
- [STACK.md](./STACK.md)
- [FEATURES.md](./FEATURES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PITFALLS.md](./PITFALLS.md)
- MediaInfo: https://mediaarea.net/en/MediaInfo
- MDN `canPlayType()`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType
- MDN `audioTracks`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks
- Android Media3 supported formats: https://developer.android.com/media/media3/exoplayer/supported-formats

---
*Research completed: 2026-05-10*
*Ready for requirements: yes*
