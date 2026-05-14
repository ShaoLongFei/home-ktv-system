# Phase 13: MediaInfo Probe, Scanner, and Sidecars - Research

**Researched:** 2026-05-12
**Domain:** Real MV import scanning, MediaInfo enrichment, sidecar metadata, Admin candidate preview
**Confidence:** HIGH

## User Constraints

Phase 13 implements the scanner side of v1.2 real MV library support. The binding user decisions are captured in `13-CONTEXT.md`:

- One physical MKV/MPG/MPEG file is one song candidate input.
- Same-stem cover and `song.json` files sit beside the media file and supplement preview/review data.
- MediaInfo/ffprobe facts are primary for technical metadata.
- Filename and sidecar metadata fill missing identity fields and preserve conflicts for review.
- Scanner work must be lightweight, retryable, and compatible with existing manual/watcher/scheduled scan flows.
- Admin review/admission, Mobile search/queue, TV playback, transcoding, and Android TV are later phases.

Requirements covered by this phase: `SCAN-01`, `SCAN-02`, `SCAN-03`, `SCAN-04`, `SCAN-05`.

## Existing Codebase Facts

### Scanner

`apps/api/src/modules/ingest/import-scanner.ts` already:

- Resolves scan roots from `MEDIA_ROOT`.
- Walks `imports/pending`, `imports/needs-review`, and `songs`.
- Filters supported media via `isSupportedFile`.
- Computes an identity using file size, mtime, and a quick hash.
- Skips probing unchanged files.
- Probes changed files through `probeMediaFile`.
- Persists `ImportFile` rows and sends changed import files to `CandidateBuilder`.

Current media extensions are `.mp4`, `.mkv`, `.mov`, and `.webm`; Phase 13 must add `.mpg` and `.mpeg`.

### Probe And Contracts

`apps/api/src/modules/ingest/media-probe.ts` already wraps `ffprobe` and returns:

- Legacy summary fields such as `durationMs`, `formatName`, `videoCodec`, `audioCodec`, width, and height.
- `mediaInfoSummary`.
- `mediaInfoProvenance`.
- Raw debug payload.

`packages/domain/src/index.ts` already has:

- `MediaInfoSummary`, `MediaInfoProvenance`, `TrackRoles`, `PlaybackProfile`.
- `CompatibilityStatus` with `unknown`, `review_required`, `playable`, `unsupported`.
- `CompatibilityReasonSource` including `scanner`.
- import candidate file detail fields for real-MV metadata.

### Candidate Builder

`apps/api/src/modules/ingest/candidate-builder.ts` currently:

- Groups files by path convention, mainly `artist/title/original.mp4` and `artist/title/instrumental.mp4`.
- Infers identity from path segments.
- Infers `VocalMode` from file name.
- Copies MediaInfo summary/provenance from probe payload into candidate file details.

For Phase 13 real MV files, this grouping must branch: `.mkv`, `.mpg`, and `.mpeg` are single-file candidates keyed by the media relative path or a stable real-MV group key, not grouped as separate original/instrumental files.

### Persistence And API

`PgImportCandidateRepository` already persists the real-MV fields on `import_candidate_files`:

- `compatibility_status`
- `compatibility_reasons`
- `media_info_summary`
- `media_info_provenance`
- `track_roles`
- `playback_profile`

`apps/api/src/routes/admin-imports.ts` currently serializes only basic file fields. It does not expose the real-MV fields to Admin yet, and it has no cover preview route.

### Admin UI

`apps/admin/src/imports/ImportWorkbench.tsx` and `CandidateEditor.tsx` already render:

- Status queues.
- Candidate metadata form.
- File role rows.
- Candidate actions.

`apps/admin/src/imports/types.ts` lacks the real-MV file fields, metadata provenance, conflicts, and cover preview URL needed for Phase 13 preview.

## Recommended Architecture

### 1. Scanner Artifacts

Add a small scanner artifact helper under `apps/api/src/modules/ingest/`, for example:

```text
real-mv-sidecars.ts
```

It should expose pure helpers:

- `isRealMvMediaPath(relativePath | absolutePath)`
- `findRealMvSidecars(mediaAbsolutePath)`
- `buildRealMvArtifactSignature(artifacts)`
- `readRealMvSidecarMetadata(artifacts)`

Recommended artifact shape inside `probePayload`:

```ts
{
  realMv: {
    mediaKind: "single_file_real_mv",
    sidecars: {
      cover: { relativePath, absolutePath? not serialized to clients, sizeBytes, mtimeMs, contentType },
      songJson: { relativePath, sizeBytes, mtimeMs, parseStatus }
    },
    sidecarMetadata: { ...validated fields },
    metadataSources: [
      { field: "title", source: "filename" },
      { field: "durationMs", source: "mediainfo" }
    ],
    metadataConflicts: [
      { field: "title", values: [{ source: "filename", value: "..." }, { source: "sidecar", value: "..." }] }
    ],
    scannerReasons: [
      { code: "sidecar-json-invalid", severity: "warning", message: "...", source: "scanner" }
    ]
  }
}
```

Do not expose absolute paths to Admin. If absolute paths are needed internally, keep them ephemeral inside scanner helpers.

### 2. Change Detection Includes Sidecars

Sidecar changes must cause reconciliation. The existing `quickHash` field can include an artifact signature:

```text
media:<size>:<hash>|artifacts:<cover-mtime-size>|<json-mtime-size>
```

This lets a changed cover or fixed `song.json` make the media file appear changed without schema changes.

For unchanged files, preserve existing probe payload. For changed sidecar-only cases, probing the media again is acceptable in Phase 13 because it keeps implementation simple and is triggered by explicit metadata changes.

### 3. Lightweight Stability Check

Before computing the quick hash and probing large media, add a small stability check:

- `stat` the file.
- Wait a short delay, e.g. 500ms.
- `stat` again.
- If size or mtime changed, persist the file with `probeStatus: "pending"`, `durationMs: null`, and a scanner reason `file-unstable`.

This is lightweight and avoids new marker files or lock protocols. Re-running a manual/scheduled scan reconciles the same relative path when copying completes.

### 4. Metadata Precedence

Candidate metadata should be assembled in `CandidateBuilder`, not in route/UI code.

Recommended precedence:

1. MediaInfo technical facts:
   - duration
   - container
   - video codec
   - resolution
   - file size
   - audio tracks
2. MediaInfo tags if present and reliable:
   - title
   - artist
   - language
3. Filename parser:
   - support `artist-title(extra)-language-genre.ext`
   - keep unknown pieces as unknown
4. Sidecar `song.json`:
   - fill missing fields and add supplemental review fields
   - preserve conflicts rather than silently overriding

This order matches the user decision: MediaInfo is primary; filename and `song.json` fill gaps.

### 5. Sidecar Schema

Use a Zod schema for same-stem `song.json`. Start narrow and review-oriented:

```ts
{
  title?: string;
  artistName?: string;
  language?: "mandarin" | "cantonese" | "other";
  genre?: string[];
  tags?: string[];
  aliases?: string[];
  searchHints?: string[];
  releaseYear?: number | null;
  trackRoles?: {
    original?: number | string;
    instrumental?: number | string;
  };
}
```

Invalid JSON or invalid shape should become scanner reasons and candidate metadata warnings. It must not fail the entire scan.

### 6. Track Roles And Playback Profile

For `.mkv`, `.mpg`, and `.mpeg`:

- `proposedAssetKind`: `dual-track-video`
- `proposedVocalMode`: `dual`
- `playbackProfile.kind`: `single_file_audio_tracks`
- `requiresAudioTrackSelection`: true when there are two or more audio tracks
- `audioCodecs`: unique audio codecs from `mediaInfoSummary.audioTracks`

Track roles should be populated only when confident:

- Sidecar role hints by index/id are explicit.
- Audio labels containing original/vocal/原唱 can map original.
- Audio labels containing instrumental/karaoke/accompaniment/伴奏/伴唱 can map instrumental.
- If not confident, leave roles null and set `compatibilityStatus: "review_required"` with a review reason.

Scanner should not claim full runtime playability. Browser support and actual track switching are Phase 15.

### 7. Cover Preview

Phase 13 needs a minimal Admin preview, not full review UX.

Recommended API additions:

- Include real-MV metadata fields in `serializeCandidateFileDetail`.
- Include `coverPreviewUrl` when a same-stem cover exists.
- Add an admin cover route that resolves the candidate file, verifies the stored cover path stays under the same import root, and streams the image with correct content type.

Recommended Admin UI additions:

- In `CandidateEditor`, show a compact cover thumbnail when `coverPreviewUrl` exists.
- Show MediaInfo facts and metadata provenance/conflicts as compact rows or chips.
- Keep existing form layout and actions. Do not redesign the whole import workbench.

## Validation Strategy

Automated verification should include:

- `apps/api/src/test/import-scanner.test.ts`
  - `.mpg` and `.mpeg` are discovered.
  - same-stem sidecar and cover are captured.
  - sidecar changes alter the persisted quick hash/signature.
  - unstable file is persisted as pending/review-required without throwing.
- `apps/api/src/test/real-mv-sidecars.test.ts` or similar
  - sidecar file matching.
  - filename metadata parsing.
  - invalid JSON produces scanner reasons.
- `apps/api/src/test/admin-imports-routes.test.ts`
  - serialized candidate file contains MediaInfo, compatibility, track roles, playback profile, cover preview URL, and provenance.
  - cover route rejects unsafe paths and serves a safe cover.
- `apps/admin/src/test/import-workbench.test.tsx`
  - candidate preview renders cover, media facts, and provenance/conflict notices.
- `pnpm -F @home-ktv/api test`
- `pnpm -F @home-ktv/admin test`
- `pnpm -F @home-ktv/api typecheck`
- `pnpm -F @home-ktv/admin typecheck`

Manual UAT after execution:

1. Put one MKV and one MPG/MPEG under `MEDIA_ROOT/imports/pending`.
2. Put same-stem cover and `song.json` next to at least one file.
3. Run or click existing scan.
4. Verify Admin import candidates show one candidate per media file, cover preview, MediaInfo facts, sidecar/filename provenance, and retry/reconcile behavior.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Sidecar file creates duplicate candidate | Do not add sidecars to supported media discovery. Attach them to the media file by stem. |
| Sidecar changes are ignored | Include artifact signature in media quick hash/change identity. |
| Partial large files get bad probe payload | Add lightweight stability check and persist retryable scanner reason. |
| Scanner overclaims playability | Default uncertain real MV files to `review_required`; leave runtime verification to Phase 15. |
| Admin UI becomes Phase 14 review rewrite | Keep UI to preview-only facts: cover, provenance, conflicts, MediaInfo. |
| Absolute filesystem paths leak | Store/serialize root-kind and relative paths only; resolve absolute paths server-side. |

## Plan Recommendation

Use four execution plans:

1. **13-01:** Scanner real-MV discovery, sidecar artifact detection, quick-hash signature, and file stability guard.
2. **13-02:** Sidecar schema, filename parser, metadata provenance/conflict helpers.
3. **13-03:** Scanner `song.json` sidecar payload wiring plus CandidateBuilder integration for single-file real MV candidates, track-role hints, playback profile, and compatibility status.
4. **13-04:** Admin import API serialization, cover preview route, and minimal Admin preview UI.

---
*Phase: 13-mediainfo-probe-scanner-and-sidecars*
*Research completed: 2026-05-12*
