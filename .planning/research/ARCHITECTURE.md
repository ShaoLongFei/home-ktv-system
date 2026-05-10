# Architecture Research: v1.2 真实 MV 歌库

**Researched:** 2026-05-10
**Scope:** Integrating real MKV/MPG MV files into the existing Home KTV architecture
**Confidence:** Medium-high

## Recommended Model

Represent one physical MV file as one formal `Song`. When original and accompaniment tracks are confirmed, create two logical `Asset` rows that share the same file path and differ by `vocalMode` and `audioTrackIndex`. This keeps the user-facing song model simple while preserving the existing asset-based queue/playback contract.

## Data Flow

1. Scanner finds `.mkv`, `.mpg`, and `.mpeg` files under the media root.
2. Sidecar resolver attaches same-stem `song.json` and cover image if present.
3. MediaInfo probe extracts container, duration, video stream, audio tracks, language/labels, codec, and raw payload.
4. Candidate builder creates one review candidate per physical file, including metadata provenance and compatibility facts.
5. Admin review resolves title/artist/cover and maps audio tracks to original/accompaniment.
6. Catalog admission writes one `Song`, logical `Asset` rows, source records, and formal `song.json`.
7. Search and queue expose only verified real MV assets.
8. TV playback receives an explicit playback target with `playbackProfile` and selected track information.

## New Or Modified Components

| Component | Change |
|-----------|--------|
| Scanner | Recognize MKV/MPG/MPEG and wait for file stability before probing |
| MediaInfoProbe | New adapter around MediaInfo output with normalized stream summary |
| SidecarResolver | New helper for same-stem cover and `song.json` association |
| CandidateBuilder | Merge MediaInfo, filename, sidecar, and provenance into review candidate |
| Import Review API | Expose track facts, compatibility, cover, and conflict warnings |
| CatalogAdmissionService | Promote one file into one song plus logical assets |
| Song JSON validator | Support real MV media profile, cover path, track indexes, and compatibility |
| Asset gateway | Serve MKV/MPG/MPEG with correct content type and byte ranges |
| Player contracts | Add `playbackProfile`, track selection, and capability/unsupported fields |
| TV Player | Capability-gated track selection and actionable failure reporting |

## Contract Fields

Candidate and catalog records need:

- `mediaProfile`: e.g. `dual_track_video`.
- `container`, `videoCodec`, `durationMs`, `sizeBytes`.
- `audioTracks`: raw source facts with stable identifiers where available.
- `audioTrackIndex` / `audioTrackId` on logical assets.
- `vocalMode`: original or accompaniment.
- `compatibilityStatus`: playable, review_required, unsupported, unknown.
- `unsupportedReasons`: codec/container/track/range/seek/switch issues.
- `metadataProvenance`: MediaInfo, filename, sidecar, admin edit.
- `coverPath` and sidecar path.
- Future `androidCompatibility`: unknown/candidate, not ready.

## Build Order

1. Contract, schema, and playback-risk spike.
2. MediaInfo probe, scanner, and sidecars.
3. Admin review and catalog admission.
4. Search, queue, playback, and switching.
5. Policy seam, Android reservation, and hardening.

## Architectural Boundaries

- Keep review-first admission as the trust boundary.
- Keep direct playback separate from "ingestable" status.
- Keep raw track facts separate from reviewed KTV roles.
- Keep Android TV contract fields platform-neutral until the native player is built.
