# Phase 12: Contract, Schema, and Playback-Risk Spike - Research

**Researched:** 2026-05-11
**Domain:** TypeScript catalog/player contracts, PostgreSQL schema migration, media probing, web/Android playback compatibility
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Compatibility Status
- **D-01:** Use a single `compatibilityStatus` field for the Phase 12 contract, not separate layered booleans.
- **D-02:** The allowed status set is `unknown`, `review_required`, `playable`, and `unsupported`.
- **D-03:** `compatibilityStatus` represents overall queue/playback readiness at the current stage; detailed causes should live in structured unsupported/review reasons rather than as extra top-level states.

### Real MV Asset Model
- **D-04:** Use a single real-MV `Asset` for one physical MV file. Do not model original and accompaniment as two logical Asset rows.
- **D-05:** Store original/accompaniment mapping inside the asset as `trackRoles: { original: trackRef, instrumental: trackRef }`.
- **D-06:** Each `trackRef` should carry at least index/id/label so the system can preserve both stable references and human-readable source labels.
- **D-07:** Phase 12 planning must treat older "two logical Asset" wording as superseded by this single Asset + `trackRoles` decision.

### MediaInfo Summary
- **D-08:** Persist a standard MediaInfo summary, provenance, and reviewed metadata fields; do not persist raw probe payload in the Phase 12 catalog contract.
- **D-09:** The standard summary should include container, duration, video codec, resolution, and audio track index/id/label/language/codec/channels.
- **D-10:** Raw probe output can remain an implementation/debug concern outside the durable domain contract unless a later phase proves it is needed.

### Playback Target Contract
- **D-11:** Extend `PlaybackTarget` with `playbackProfile` and `selectedTrackRef`.
- **D-12:** Do not hide audio-track selection inside asset metadata only; the TV runtime must receive the selected track explicitly.
- **D-13:** Keep Android TV preparation platform-neutral. Do not add Android-specific fields in Phase 12.

### Playback Risk Spike
- **D-14:** Validate playback risk with both controlled fixtures and user-provided real samples.
- **D-15:** User should provide at least one MKV and one MPG/MPEG sample, preferably both with two audio tracks.
- **D-16:** If track switching fails at runtime, keep current playback unchanged and show a clear message such as "current device does not support audio-track switching." Do not reload aggressively or mark the whole song permanently unusable from one switch failure in Phase 12.

### the agent's Discretion
- Exact TypeScript type names, table/column names, migration shape, and test file organization are left to the planner, as long as the public contract follows the decisions above.
- The planner may choose whether `trackRef.id` maps to source track UID, stream id, or another stable extracted identifier, provided `index` remains available for runtime selection.

### Deferred Ideas (OUT OF SCOPE)
- Native Android TV player implementation belongs to a later milestone.
- Automatic transcoding/remuxing remains out of scope; user will preprocess unsupported files outside the system.
- Full scanner sidecar behavior belongs to Phase 13.
- Admin review UX and catalog admission behavior belong to Phase 14.
- Mobile search/queue and TV playback switching integration belong to Phase 15.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEDIA-01 | User can store one MKV/MPG/MPEG MV file as one song candidate, without creating duplicate song records for the same physical file. | Use one `Asset`/candidate-file identity per physical file and move original/instrumental roles into `trackRoles`. Do not reuse the current two-row switch-pair model for real MV assets. |
| MEDIA-02 | User can see whether a real MV file is ingestable, playable, review-required, or unsupported, with explicit reasons when it is not queueable. | Add `compatibilityStatus` plus structured reason arrays. Keep "ingestable" as candidate/probe visibility derived from scan/probe state, not as a fifth compatibility enum value. |
| MEDIA-03 | User can preserve source media facts including container, duration, video codec, audio tracks, file size, and metadata provenance. | Persist a durable standard summary and provenance object. Keep raw `ffprobe`/MediaInfo payload out of formal catalog contracts. |
| MEDIA-04 | Future Android TV playback can reuse platform-neutral catalog/player fields without v1.2 implementing an Android TV app. | Add `playbackProfile` and `selectedTrackRef` using neutral track refs. Do not add Android package/API names to schema. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Preserve the core value: phone controls, TV plays, server owns playback state, and the system must prioritize a stable singing flow.
- Phone remains the only complex control surface. TV must stay playback/status focused.
- Playback state must be decided by the server state machine, not by client-local inference.
- Do not add real-time vocal DSP, scoring, AI separation, online direct playback, Android TV native app work, or automatic transcoding in this phase.
- Local media remains primary; online sources remain supplemental and cached before playback.
- Keep the `room` model intact even though v1.x targets one room.
- Use existing monorepo/package boundaries and app-local runtime hooks unless a real contract boundary exists.
- Before changing repo files, stay inside GSD workflow artifacts. This research file is part of the requested GSD research workflow.

## Summary

Phase 12 should define contracts and schema, not complete ingestion or playback. The key planning fact is that the existing system assumes vocal switching means two verified assets in the same `switchFamily`, while the new real-MV model is one physical file, one `Asset`, and role mapping inside that asset. The planner should treat this as a new platform-neutral media profile, not as a minor extension of the current pair-switch schema.

The durable contract should be small and structured: one `compatibilityStatus`, structured reasons, a standard MediaInfo-style summary, provenance, `trackRoles`, `playbackProfile`, and `selectedTrackRef`. Raw probe payloads can stay in import/debug storage such as the existing `import_files.probe_payload`, but formal catalog and player contracts should expose only normalized facts.

**Primary recommendation:** Add additive domain, player-contract, and SQL migration surfaces for one real-MV asset with `trackRoles`, durable media summary/provenance, compatibility status/reasons, `playbackProfile`, and explicit `selectedTrackRef`; validate playback risk with browser APIs plus real MKV/MPG samples, but gate switching as review-required until capability is proven.

## Standard Stack

### Core

| Library/Tool | Project Version | Verified Current/Installed | Purpose | Why Standard |
|--------------|-----------------|----------------------------|---------|--------------|
| TypeScript | 6.0.3 | npm latest 6.0.3, modified 2026-04-16 | Shared domain/player contracts | Existing monorepo contract language. No new schema generator needed. |
| PostgreSQL + raw SQL migrations | current project runner | PostgreSQL docs current v18; live DB not configured locally | Catalog/import schema | Existing `apps/api/src/db/migrations/*.sql` and `schemaSql` pattern is SQL-first and explicit. |
| `pg` | `^8.20.0` | npm latest 8.20.0, modified 2026-03-04 | Migration/runtime DB client | Already used by `apply-migrations.mjs` and repositories. |
| Fastify | 5.8.5 | npm latest 5.8.5, modified 2026-04-14 | API routes and route tests | Existing API transport. Phase 12 should extend existing routes/contracts, not add a server. |
| ffprobe / FFmpeg | installed 8.1 | installed 8.1 | Probe summary and fixture generation | Existing `probeMediaFile` wrapper already uses `ffprobe`; official docs support JSON, format, and stream output. |
| Vitest | `^4.1.5` | npm latest 4.1.5, modified 2026-05-05 | Contract/migration/runtime unit tests | Existing API and TV test framework. |

### Supporting

| Library/Tool | Project Version | Verified Current/Installed | Purpose | When to Use |
|--------------|-----------------|----------------------------|---------|-------------|
| React | 19.2.5 | npm latest 19.2.6, modified 2026-05-08 | TV/Admin consumers | Use existing pinned version. Do not upgrade for Phase 12. |
| Vite | 8.0.10 | npm latest 8.0.11, modified 2026-05-07 | TV/Admin builds | Use existing pinned version. Do not upgrade for Phase 12. |
| happy-dom | `^20.9.0` | npm latest 20.9.0, modified 2026-04-13 | TV runtime unit tests | Useful for contract tests, but real media playback still needs Chrome/manual samples. |
| Google Chrome | app installed | `/Applications/Google Chrome.app` | Playback-risk spike | Use for real MKV/MPG playback smoke checks if automated browser checks are planned. |
| MediaInfo CLI | not installed | unavailable locally | Optional external probe source | Do not require it in Phase 12; retain `ffprobe` fallback and name durable summary by facts, not tool output. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing `ffprobe` wrapper | MediaInfo CLI or `mediainfo.js` | MediaInfo is a good metadata tool, but it is not installed and adding it is unnecessary for contract/schema work. Keep the durable summary tool-neutral. |
| JSONB columns for summary/reasons/profile | Fully normalized media-track tables | Normalized tables improve querying later, but Phase 12 mostly needs stable contracts and additive migration. Use JSONB plus TypeScript types now; normalize later only if queries require it. |
| Existing dual-video switch model | New same-file audio-track switch model | Existing model is correct for two physical files. Real MV files need a profile and selected track ref so Phase 15 can implement capability-gated switching. |

**Installation:**

```bash
# No new npm packages are recommended for Phase 12.
pnpm install

# If ffprobe is missing on another machine:
brew install ffmpeg
```

**Version verification:** npm registry checks were run on 2026-05-11 with `npm view <package> version time.modified`. Local tool checks found Node.js v25.8.0, pnpm 10.33.2, npm 11.11.0, ffprobe 8.1, and ffmpeg 8.1.

## Architecture Patterns

### Recommended Project Structure

```text
packages/domain/src/index.ts
  # CompatibilityStatus, TrackRef, MediaInfoSummary, TrackRoles, PlaybackProfile
packages/player-contracts/src/index.ts
  # PlaybackTarget.playbackProfile and PlaybackTarget.selectedTrackRef
apps/api/src/db/migrations/0007_real_mv_contracts.sql
  # Additive schema for compatibility, media summary, track roles, playback profile
apps/api/src/db/schema.ts
  # Mirror row interfaces, enumValues, and schemaSql
apps/api/src/modules/ingest/media-probe.ts
  # Normalize probe facts into durable summary shape
apps/api/src/modules/playback/build-playback-target.ts
  # Attach selectedTrackRef and playbackProfile from asset state
apps/api/src/modules/assets/asset-gateway.ts
  # Correct MKV/MPG/MPEG content-type inference
apps/tv-player/src/runtime/*
  # Spike capability checks only; full switching belongs to Phase 15
apps/api/src/test/*
apps/tv-player/src/test/*
  # Contract, migration, and runtime-risk tests
```

### Pattern 1: Single Real-MV Asset Identity

**What:** Represent one physical MKV/MPG/MPEG as one asset, ideally using existing `asset_kind = 'dual-track-video'` unless the planner has a stronger reason to add a new enum. Store original/accompaniment as `trackRoles`, not as two rows.

**When to use:** Every real MV file in Phase 12 and later real-MV phases.

**Example:**

```typescript
// Source: Phase 12 locked decisions and current packages/domain/src/index.ts pattern.
export type CompatibilityStatus = "unknown" | "review_required" | "playable" | "unsupported";

export interface TrackRef {
  index: number;
  id: string | null;
  label: string;
}

export interface TrackRoles {
  original: TrackRef | null;
  instrumental: TrackRef | null;
}

export interface AudioTrackSummary extends TrackRef {
  language: string | null;
  codec: string | null;
  channels: number | null;
}

export interface MediaInfoSummary {
  container: string | null;
  durationMs: number | null;
  videoCodec: string | null;
  resolution: { width: number; height: number } | null;
  fileSizeBytes: number;
  audioTracks: readonly AudioTrackSummary[];
}
```

### Pattern 2: Additive SQL Migration Plus `schemaSql` Mirror

**What:** Add columns with defaults and checks in a new migration, then mirror them in `apps/api/src/db/schema.ts` row interfaces and `schemaSql`. Existing tests read migration text directly, so drift is visible.

**When to use:** All Phase 12 schema work.

**Example:**

```sql
-- Source: existing migrations + PostgreSQL jsonb docs.
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS compatibility_status text NOT NULL DEFAULT 'unknown'
    CHECK (compatibility_status IN ('unknown', 'review_required', 'playable', 'unsupported')),
  ADD COLUMN IF NOT EXISTS compatibility_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_info_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS media_info_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS track_roles jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS playback_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE import_candidate_files
  ADD COLUMN IF NOT EXISTS compatibility_status text NOT NULL DEFAULT 'unknown'
    CHECK (compatibility_status IN ('unknown', 'review_required', 'playable', 'unsupported')),
  ADD COLUMN IF NOT EXISTS compatibility_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS track_roles jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS playback_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
```

### Pattern 3: Tool-Neutral Probe Summary

**What:** Let `ffprobe` or later MediaInfo produce raw facts, then normalize into a durable summary. `ffprobe` officially supports machine-readable JSON plus format and stream sections; use those fields, but do not expose the whole raw object as the formal contract.

**When to use:** `probeMediaFile`, import candidate mapping, formal asset mapping, and `song.json` validation.

**Example:**

```typescript
// Source: ffprobe docs for -show_format, -show_streams, and JSON writer.
export function summarizeProbe(input: {
  fileSizeBytes: number;
  formatName?: string;
  durationMs?: number | null;
  streams?: readonly {
    index?: number;
    id?: string;
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    channels?: number;
    tags?: Record<string, string>;
  }[];
}): MediaInfoSummary {
  const video = input.streams?.find((stream) => stream.codec_type === "video");
  return {
    container: input.formatName ?? null,
    durationMs: input.durationMs ?? null,
    videoCodec: video?.codec_name ?? null,
    resolution: video?.width && video.height ? { width: video.width, height: video.height } : null,
    fileSizeBytes: input.fileSizeBytes,
    audioTracks: (input.streams ?? [])
      .filter((stream) => stream.codec_type === "audio")
      .map((stream, fallbackIndex) => ({
        index: stream.index ?? fallbackIndex,
        id: stream.id ?? null,
        label: stream.tags?.title ?? `Audio ${fallbackIndex + 1}`,
        language: stream.tags?.language ?? null,
        codec: stream.codec_name ?? null,
        channels: stream.channels ?? null
      }))
  };
}
```

### Pattern 4: Backend-Authored Playback Intent

**What:** Build `PlaybackTarget` from persisted asset fields. The TV should receive both the profile and the selected track; it should not infer which audio track means accompaniment.

**When to use:** `buildPlaybackTarget`, room snapshots, recovery targets, switch transition follow-up planning.

**Example:**

```typescript
// Source: current buildPlaybackTarget pattern + Phase 12 locked decision D-11/D-12.
export interface PlaybackProfile {
  kind: "separate_asset_pair" | "single_file_audio_tracks";
  container: string | null;
  videoCodec: string | null;
  audioCodecs: readonly string[];
  requiresAudioTrackSelection: boolean;
}

export interface PlaybackTarget {
  assetId: string;
  playbackUrl: string;
  vocalMode: "original" | "instrumental" | "dual" | "unknown";
  playbackProfile: PlaybackProfile;
  selectedTrackRef: TrackRef | null;
}
```

### Pattern 5: Compatibility Evaluator as Pure Data Derivation

**What:** Derive `compatibilityStatus` and reasons from probe facts, role mapping, known current web playback support, and sample-spike results. Do not scatter status logic across Admin, Mobile, and TV.

**When to use:** Contract tests now, ingestion and review phases later.

**Example:**

```typescript
// Source: MDN canPlayType/MediaCapabilities docs and Phase 12 status lock.
export interface CompatibilityReason {
  code: string;
  severity: "warning" | "error";
  message: string;
  source: "probe" | "runtime_spike" | "review";
}

export function evaluateMediaCompatibility(input: {
  summary: MediaInfoSummary;
  trackRoles: TrackRoles;
  currentWebCanPlayType: "" | "maybe" | "probably" | "unknown";
}): { status: CompatibilityStatus; reasons: CompatibilityReason[] } {
  const reasons: CompatibilityReason[] = [];
  if (!input.summary.videoCodec) {
    reasons.push({ code: "missing-video-codec", severity: "error", message: "Video codec is missing", source: "probe" });
  }
  if (input.summary.audioTracks.length === 0) {
    reasons.push({ code: "missing-audio-tracks", severity: "error", message: "No audio tracks were detected", source: "probe" });
  }
  if (!input.trackRoles.instrumental) {
    reasons.push({ code: "instrumental-track-unmapped", severity: "warning", message: "Instrumental track needs review", source: "review" });
  }
  if (input.currentWebCanPlayType === "") {
    reasons.push({ code: "browser-cannot-play-type", severity: "error", message: "Current TV browser reports the media type unsupported", source: "runtime_spike" });
  }
  if (reasons.some((reason) => reason.severity === "error")) return { status: "unsupported", reasons };
  if (reasons.length > 0 || input.currentWebCanPlayType !== "probably") return { status: "review_required", reasons };
  return { status: "playable", reasons: [] };
}
```

### Anti-Patterns to Avoid

- **Two logical assets for one real MV file:** Breaks MEDIA-01 and fights the locked `trackRoles` model.
- **Treating `unknown` as queueable:** `unknown` means not evaluated. Queueability should require `playable` or a later explicit reviewed allowance.
- **Adding Android-specific schema fields:** Use neutral profile and track refs; Android Media3 details belong to a future app.
- **Storing raw probe output as formal catalog contract:** Raw output is volatile and tool-specific. Keep it in import/debug storage only.
- **Assuming file extension proves playback:** Use MIME/codec probes, browser APIs, and real playback attempts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Media container/codec parsing | Custom MKV/MPG parser | Existing `ffprobe` wrapper now; optional MediaInfo later | Containers and stream metadata are deep edge-case domains. |
| Browser codec support matrix | Hard-coded browser table | `HTMLMediaElement.canPlayType()`, `MediaCapabilities.decodingInfo()`, and real samples | Browser/device support varies and `maybe` still requires playback attempt. |
| Android future compatibility logic | Android-specific DB fields | Neutral `playbackProfile` and `TrackRef` | Android Media3 can map neutral track refs to `TrackSelectionOverride` later. |
| Large media HTTP serving | New media server route | Existing `/media/:assetId` with byte ranges | The route already handles range requests; extend MIME inference only. |
| SQL migration framework | New ORM or migration runner | Existing `apps/api/scripts/apply-migrations.mjs` | Project already has raw SQL migrations and schema drift tests. |
| Audio-track switching workaround | Muting/mixing duplicate elements for one file | Native track APIs when available, otherwise capability-gated unsupported message | `audioTracks` is not reliable enough across browsers. |

**Key insight:** The deceptively hard part is not storing another JSON blob. It is keeping a single physical file identity while exposing enough normalized media facts for queueability, current web playback, and future Android track selection without letting runtime-specific assumptions leak into the catalog.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | PostgreSQL tables in migrations: `songs`, `assets`, `import_files`, `import_candidate_files`, `source_records`, `queue_entries`, `playback_sessions`. No live DB was reachable because `DATABASE_URL` is unset and no local `.db`/`.sqlite` files exist. | Add an additive migration. Backfill existing ready/verified assets so current demo/local songs remain playable when later queue code checks compatibility. Requires data migration for existing rows plus code edits for new rows. |
| Live service config | `.env.example` exposes `DATABASE_URL`, `MEDIA_ROOT`, `PUBLIC_BASE_URL`, `CONTROLLER_BASE_URL`, and `TV_ROOM_SLUG`. No tracked Docker/system service config found. | No key rename. Migration application requires a real `DATABASE_URL` outside this repo. |
| OS-registered state | None verified in repo: no systemd units, launchd plists, pm2 config, or docker compose files found. | None. |
| Secrets/env vars | No tracked secret values. Current shell has `DATABASE_URL=unset`. Existing env var names are unaffected by Phase 12 schema names. | None for Phase 12. If a real deployment has untracked `.env`, keep names unchanged. |
| Build artifacts | `node_modules`, `.turbo`, and `dist` outputs exist for apps/packages. | After implementation, run relevant `pnpm` checks/builds so generated `dist` does not mislead manual smoke testing. Do not edit built output. |

**Nothing found in category:** OS-registered state is none, verified by file search for service/plist/pm2/docker compose artifacts.

## Common Pitfalls

### Pitfall 1: Reusing Pair-Asset Queue Eligibility

**What goes wrong:** Real MV songs get rejected because current search/queue code requires a verified counterpart asset in the same `switchFamily`.

**Why it happens:** Existing `findVerifiedSwitchCounterparts`, `searchFormalSongs`, and `addQueueEntry` are designed for two physical assets.

**How to avoid:** Phase 12 should define the profile and schema but clearly mark downstream Phase 15 work to add a single-file-audio-track eligibility path.

**Warning signs:** Tests create `asset-original` and `asset-instrumental` for an MKV sample.

### Pitfall 2: Raw Probe Payload Becomes the Contract

**What goes wrong:** Later scanner changes or a MediaInfo tool switch break API consumers because they relied on raw `ffprobe` keys.

**Why it happens:** Existing `probe_payload` and `probe_summary` are generic JSONB and easy to expose.

**How to avoid:** Add typed summary/provenance fields and tests that assert only normalized facts are returned from catalog/player payloads.

**Warning signs:** Public payloads contain `streams`, `format`, or whole tool-specific raw objects.

### Pitfall 3: Track Index and Track Identity Are Confused

**What goes wrong:** The TV selects the wrong audio track after files are remuxed or streams are reordered.

**Why it happens:** Index is useful for runtime selection but may not be stable enough as a durable identity.

**How to avoid:** Store `trackRef.index`, `trackRef.id`, and `trackRef.label`. Use index for runtime where required, but preserve id/label for review and validation.

**Warning signs:** `trackRoles` stores only `0` and `1`.

### Pitfall 4: Browser Track Switching Is Assumed Available

**What goes wrong:** UI exposes switching on Chrome/TV devices where `audioTracks` is missing or unusable.

**Why it happens:** MDN marks `HTMLMediaElement.audioTracks` as limited availability. It is not Baseline.

**How to avoid:** Treat in-file audio-track switching as `review_required` until the runtime verifies the capability against a real sample.

**Warning signs:** Code calls `video.audioTracks[0].enabled = true` without feature detection and rollback.

### Pitfall 5: MIME Type Stays `video/mp4`

**What goes wrong:** MKV/MPG/MPEG media is served with the wrong content type and browser support checks become misleading.

**Why it happens:** `AssetGateway.inferVideoContentType` currently returns `video/mp4` for unknown extensions.

**How to avoid:** Extend MIME inference for `.mkv`, `.mpg`, and `.mpeg`; keep `canPlayType()` checks based on container/codecs, not extension alone.

**Warning signs:** `/media/:assetId` returns `video/mp4` for `*.mkv`.

### Pitfall 6: Migration Drift Between SQL Files and `schemaSql`

**What goes wrong:** Tests or in-memory setup use a different schema than production migrations.

**Why it happens:** The project keeps standalone migration files and a `schemaSql` string.

**How to avoid:** Update both, and add tests that look for the new check constraints and JSONB columns in the migration.

**Warning signs:** New columns exist in `0007_*.sql` but not `apps/api/src/db/schema.ts`.

## Code Examples

### Player Contract Extension

```typescript
// Source: current packages/player-contracts/src/index.ts and Phase 12 D-11.
export interface PlaybackTarget {
  roomId: RoomId;
  sessionVersion: number;
  queueEntryId: QueueEntryId;
  assetId: AssetId;
  playbackUrl: string;
  resumePositionMs: number;
  vocalMode: VocalMode;
  switchFamily: SwitchFamily | null;
  playbackProfile: PlaybackProfile;
  selectedTrackRef: TrackRef | null;
  currentQueueEntryPreview: QueueEntryPreview;
  nextQueueEntryPreview: QueueEntryPreview | null;
}
```

### Database Backfill Guard

```sql
-- Preserve current ready/verified assets when later code starts checking compatibility_status.
UPDATE assets
SET compatibility_status = 'playable',
    compatibility_reasons = '[]'::jsonb
WHERE status = 'ready'
  AND switch_quality_status = 'verified'
  AND compatibility_status = 'unknown';
```

### Media MIME Mapping

```typescript
// Source: current AssetGateway inference pattern.
function inferVideoContentType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".mkv")) return "video/x-matroska";
  if (lowerPath.endsWith(".mpg") || lowerPath.endsWith(".mpeg")) return "video/mpeg";
  if (lowerPath.endsWith(".webm")) return "video/webm";
  if (lowerPath.endsWith(".m4v")) return "video/x-m4v";
  return "video/mp4";
}
```

### Runtime Capability Probe Shape

```typescript
// Source: MDN canPlayType, MediaCapabilities, and audioTracks docs.
export async function inspectCurrentWebPlaybackProfile(input: {
  contentType: string;
  video?: MediaDecodingConfiguration["video"];
  audio?: MediaDecodingConfiguration["audio"];
}): Promise<{
  canPlayType: "" | "maybe" | "probably";
  mediaCapabilitiesSupported: boolean | "unavailable";
  hasAudioTracksApi: boolean;
}> {
  const video = document.createElement("video");
  const canPlayType = video.canPlayType(input.contentType) as "" | "maybe" | "probably";
  const mediaCapabilitiesSupported = navigator.mediaCapabilities
    ? (await navigator.mediaCapabilities.decodingInfo({ type: "file", video: input.video, audio: input.audio })).supported
    : "unavailable";
  return {
    canPlayType,
    mediaCapabilitiesSupported,
    hasAudioTracksApi: "audioTracks" in video
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One original asset row plus one instrumental asset row | One real-MV asset with `trackRoles` | Locked in Phase 12 discussion on 2026-05-10 | Prevents duplicate song/asset records for one file. |
| File extension implies playback readiness | Probe facts plus browser APIs plus real sample attempts | Confirmed by MDN/Android docs on 2026-05-11 | MKV/MPG may be ingestable but still review-required or unsupported. |
| Browser `audioTracks` assumed for switching | Capability-gated switching, clear unsupported message | MDN marks API limited availability | Phase 12 should not promise in-file switching yet. |
| Raw probe JSON as durable catalog detail | Standard summary plus provenance | Locked in Phase 12 discussion | Future tool changes do not break catalog/player consumers. |
| Android reservation via Android-specific fields | Platform-neutral profile and track refs | Locked in Phase 12 discussion | Future Media3 can map to track overrides without schema churn. |

**Deprecated/outdated:**

- Two-asset wording for real MV files: superseded by D-04 through D-07.
- Treating `SwitchQualityStatus` as the compatibility contract: it can inform compatibility, but does not replace `compatibilityStatus`.
- Marking one runtime track-switch failure as permanently unsupported: D-16 says keep current playback and show a clear message.

## Open Questions

1. **Which source should fill `trackRef.id` first?**
   - What we know: `trackRef` must include index/id/label; index must remain available.
   - What's unclear: ffprobe stream `id`, stream index, and tags vary by container.
   - Recommendation: use source stream id when present, fallback to a stable string derived from stream index, and always preserve index and label.

2. **How should existing assets be backfilled?**
   - What we know: Existing ready/verified demo/local assets must remain compatible after Phase 12.
   - What's unclear: Whether every existing ready/verified asset should be called `playable` immediately.
   - Recommendation: backfill ready + verified + non-ephemeral assets to `playable`; leave others `unknown` or `review_required` based on current status.

3. **What real samples will the playback spike use?**
   - What we know: User should provide at least one MKV and one MPG/MPEG, ideally each with two audio tracks.
   - What's unclear: Actual codecs, track labels, and whether the current TV browser can load/switch them.
   - Recommendation: plan a sample-driven manual or Chrome smoke step that records probe facts and runtime outcome in structured reasons.

4. **How should "ingestable" be displayed without a fifth enum value?**
   - What we know: `compatibilityStatus` values are locked and do not include `ingestable`.
   - What's unclear: The exact UI copy belongs to later Admin phases.
   - Recommendation: derive ingest visibility from candidate/probe status; use `compatibilityStatus` only for playback/queue readiness.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Typecheck/test scripts | Yes | v25.8.0 | Use project-supported Node if runtime issues appear. |
| pnpm | Workspace commands | Yes | 10.33.2 | None needed. |
| npm registry | Version verification | Yes | npm 11.11.0 | None needed. |
| ffprobe | Media probe/risk spike | Yes | 8.1 | Install FFmpeg if missing. |
| ffmpeg | Fixture generation | Yes | 8.1 | Use user-provided samples if fixture generation is skipped. |
| MediaInfo CLI | Optional metadata comparison | No | - | Use existing ffprobe wrapper for Phase 12. |
| PostgreSQL live DB | Applying migration against real DB | No | `DATABASE_URL` unset; `psql`/`pg_isready` not found | Write SQL/tests now; run migration smoke when a DB is supplied. |
| Google Chrome | Real playback smoke | Yes | App installed at `/Applications/Google Chrome.app` | Manual browser check or existing happy-dom unit tests for non-media logic. |

**Missing dependencies with no fallback:**

- A real PostgreSQL connection is required to prove the migration against deployment data. The planner should include a separate migration smoke step when `DATABASE_URL` is available.

**Missing dependencies with fallback:**

- MediaInfo CLI is missing; Phase 12 can use ffprobe and keep the durable contract tool-neutral.
- PostgreSQL CLI tools are missing; application-level `pg` migration tests can still be written, but not a live `psql` verification.

## Sources

### Primary (HIGH confidence)

- Local phase context: `.planning/phases/12-contract-schema-and-playback-risk-spike/12-CONTEXT.md` - locked decisions and out-of-scope boundaries.
- Local requirements/roadmap/state: `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` - Phase 12 success criteria and MEDIA-01 through MEDIA-04.
- Local contracts and schema: `packages/domain/src/index.ts`, `packages/player-contracts/src/index.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/db/migrations/*.sql`.
- Local runtime: `build-playback-target.ts`, `build-switch-target.ts`, `asset-gateway.ts`, `media-probe.ts`, `import-scanner.ts`, `candidate-builder.ts`, `video-pool.ts`, `switch-controller.ts`.
- FFmpeg ffprobe official docs - `-show_format`, `-show_streams`, JSON writer, generated 2026-05-09: https://ffmpeg.org/ffprobe.html
- MDN `HTMLMediaElement.canPlayType()` - MIME/codec support returns empty, maybe, or probably: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType
- MDN `HTMLMediaElement.audioTracks` - limited availability: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks
- MDN `MediaCapabilities.decodingInfo()` - supported/smooth/powerEfficient capability query: https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo
- Android Media3 ExoPlayer supported formats - Matroska/MPEG-PS support depends on contained sample formats: https://developer.android.com/media/media3/exoplayer/supported-formats?hl=en
- Android Media3 track selection - specific audio tracks are selected by querying current tracks and applying a track override: https://developer.android.com/media/media3/exoplayer/track-selection?hl=en
- PostgreSQL JSON types - `jsonb` indexing, containment, and subscripting: https://www.postgresql.org/docs/current/datatype-json.html
- MediaInfo official overview - technical/tag data for video and audio files: https://mediaarea.net/en/MediaInfo

### Secondary (MEDIUM confidence)

- npm registry metadata via `npm view` on 2026-05-11 for TypeScript, Fastify, pg, Vitest, React, Vite, plugin-react, TanStack Query, happy-dom, tsx, turbo, and @types/node.
- Local environment probes for installed Node, pnpm, npm, ffprobe, ffmpeg, Chrome app, and missing PostgreSQL/MediaInfo CLI.

### Tertiary (LOW confidence)

- None used as authoritative. Browser playback and track switching remain empirical until tested with real samples.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - project dependencies, installed tools, and npm metadata were verified.
- Architecture: HIGH - based on local code paths and locked Phase 12 context.
- Schema recommendations: MEDIUM-HIGH - additive JSONB/check-column approach matches local patterns, but live DB migration was not run.
- Playback risk: MEDIUM - official browser/Android docs confirm the risk shape, but real MKV/MPG samples have not been tested.
- Pitfalls: HIGH - derived from direct mismatches between existing pair-asset runtime and locked single-asset model.

**Research date:** 2026-05-11
**Valid until:** 2026-05-18 for playback compatibility assumptions; 2026-06-10 for schema/contract patterns.
