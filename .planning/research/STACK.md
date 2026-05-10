# Stack Research: v1.2 真实 MV 歌库

**Researched:** 2026-05-10
**Scope:** MKV/MPG real MV ingestion for the existing Home KTV system
**Confidence:** Medium-high

## Recommendation

Keep the existing TypeScript monorepo, Fastify API, PostgreSQL catalog, React Admin/Mobile/TV apps, shared domain/player-contract packages, and controlled asset gateway. v1.2 should add media probing, sidecar discovery, compatibility marking, and explicit audio-track contracts. It should not add transcoding workers, online providers, Android TV native code, or a parallel media pipeline.

## Stack Additions

| Area | Recommendation | Why |
|------|----------------|-----|
| Media probing | Add a MediaInfo CLI wrapper and keep existing ffprobe behavior as fallback/cross-check | MediaInfo exposes container, stream, codec, language, duration, and track metadata that Admin needs for review |
| File formats | Extend scanner recognition to `.mkv`, `.mpg`, and `.mpeg` | User's real MV library uses these formats |
| Sidecars | Add deterministic sibling `song.json` and cover resolver | Single-file-per-song stays simple while allowing rich preview and manual metadata |
| Compatibility | Store direct-play compatibility status and unsupported reasons | File extension alone does not prove browser playback |
| Player contract | Add `playbackProfile`, `audioTrackIndex`, source track facts, and capability flags | The TV player and future Android TV need explicit instructions instead of implicit URL tricks |
| Gateway | Ensure MKV/MPG MIME and byte-range behavior are preserved | Large real MV files need seek/resume and browser media loading support |
| Test fixtures | Add representative two-track MKV and unsupported/uncertain MPG fixtures | Requirements must be verified against real media characteristics, not demo MP4 assumptions |

## What Not To Add

- Mandatory transcoding/remuxing.
- Android TV native app or Media3 integration.
- Online MV discovery, OpenList matching, provider downloads, or chart scraping.
- New background worker architecture unless the existing scanner/probe flow proves insufficient.
- Auto-admit enabled by default.
- AI vocal separation, OCR, scoring, DSP, or multi-room expansion.

## Integration Points

- `packages/domain`: media profile, asset kind, track metadata, compatibility status, provenance fields.
- `packages/player-contracts`: playback target profile and selected audio track.
- `apps/api`: scanner, candidate builder, MediaInfo probe, sidecar resolver, catalog admission, asset gateway MIME/range serving.
- `apps/admin`: import review UI for metadata provenance, cover preview, compatibility, and track-role mapping.
- `apps/tv-player`: direct-play smoke, load/seek checks, and capability-gated audio-track switching.

## Open Technical Risk

Browser support for MKV/MPG playback and `HTMLMediaElement.audioTracks` is inconsistent. v1.2 must test capability on the actual web TV runtime and store results explicitly. Android Media3 is a good future target, but v1.2 should only reserve platform-neutral fields.

## Sources

- MediaInfo official site: https://mediaarea.net/en/MediaInfo
- MDN `canPlayType()`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType
- MDN `audioTracks`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks
- Android Media3 supported formats: https://developer.android.com/media/media3/exoplayer/supported-formats
