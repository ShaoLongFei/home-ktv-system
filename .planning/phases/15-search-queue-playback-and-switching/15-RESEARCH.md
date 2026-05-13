# Phase 15: Search, Queue, Playback, and Switching - Research

**Researched:** 2026-05-13
**Domain:** TypeScript monorepo playback contracts, catalog search, queue commands, browser TV media runtime
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Queue Default Vocal Mode
- **D-01:** Mobile does not ask the user to choose original/accompaniment while queueing a real-MV song.
- **D-02:** Real-MV queueing chooses the track based on the room's current playback mode at request time. If the current/target mode is accompaniment, queue the accompaniment track; otherwise queue the original track.
- **D-03:** If there is no current playback state or inherited target mode, use accompaniment as the KTV-safe fallback unless an existing room-level default mode is already available in code.
- **D-04:** Queueing must use the reviewed `trackRoles` from the approved real-MV Asset. If the selected mode's track is missing or the asset is not ready, the song is not queueable from Mobile.

### Single-Asset Switching
- **D-05:** Extend the existing `switch-vocal-mode` flow to support switching within the same real-MV Asset by changing `selectedTrackRef`. Do not create a separate real-MV-only command path.
- **D-06:** Keep existing session-version, realtime snapshot, telemetry, rollback, and conflict semantics. The contract may extend `SwitchTarget` or a related target shape, but it should still be served by the existing switch transition flow.
- **D-07:** For real MV, switching means same `assetId`/playback URL with a different `vocalMode` and selected `TrackRef`, not loading a counterpart Asset from the same `switchFamily`.

### Runtime Failure And Button Behavior
- **D-08:** The Mobile switch button remains visible and clickable for the current song when a real-MV track-role pair exists.
- **D-09:** A click is a switch attempt, not a guarantee. TV runtime must commit the switch only after it can actually select the requested audio track.
- **D-10:** If the current browser/device cannot switch audio tracks, playback stays on the current mode and the user sees a clear failure/revert message. Do not silently disable the feature and do not permanently mark the song unusable from one failed switch attempt.
- **D-11:** TV should preserve the current playback position as much as possible. Same-file track switching should avoid the visible time rollback that happens with dual-video asset switching.

### Unavailable And Preprocess States
- **D-12:** Search results should not hide approved real-MV songs that are not queueable because they are unsupported, review-required, missing usable tracks, or need preprocessing.
- **D-13:** Mobile search should show those songs as "需预处理" or "暂不可播放" and disable queue actions. It should not show low-level codec/probe details.
- **D-14:** Admin remains the detailed diagnostic surface for compatibility reasons, track-role problems, and preprocessing guidance.
- **D-15:** TV playback failure for a real-MV asset should produce a clear unsupported/needs-preprocessing notice and should skip or recover using the existing playback failure flow instead of hanging on a broken item.

### Claude's Discretion
- Exact contract field names for same-asset switch targets are left to the planner, as long as the existing switch command/transition flow is reused.
- Exact Mobile copy and badge layout are planner discretion, but default language must remain Chinese and disabled states must be obvious.
- Exact runtime audio-track selection mechanism is planner discretion, provided it is capability-checked and tested against the existing browser TV player.

### Deferred Ideas (OUT OF SCOPE)
- Native Android TV audio-track switching remains a future milestone.
- Automatic transcoding/remuxing remains out of scope; user preprocesses unsupported files outside the system.
- Media acquisition, OpenList matching, and online MV download flows are outside Phase 15.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAY-01 | User can search and queue approved real MV songs from the mobile controller using the existing Chinese-first search behavior. | Extend `PgSongRepository.searchFormalSongs` and Mobile result rendering; keep existing normalization/ranking and realtime command path. |
| PLAY-02 | Queueing a dual-track real MV defaults to accompaniment when an accompaniment track is confirmed. | Add backend queue-intent resolver from room session `targetVocalMode`/current mode to reviewed `trackRoles.instrumental`, falling back to accompaniment when no current mode exists. |
| PLAY-03 | TV receives an explicit playback profile and `selectedTrackRef` for real MV assets. | `PlaybackTarget` already has `playbackProfile` and `selectedTrackRef`; fix resolver because formal real-MV assets are `vocalMode: "dual"`, so selected track cannot be inferred from asset `vocalMode`. |
| PLAY-04 | User can switch original/accompaniment during playback only when the TV runtime has verified track-switch capability. | Extend existing `switch-vocal-mode` -> `buildSwitchTarget` -> `/player/switch-transition` -> `SwitchController` flow with same-asset track switching and audioTracks API gating. |
| PLAY-05 | User sees a clear unsupported or needs-preprocessing state when a real MV cannot load, seek, resume, or switch as advertised. | Reuse `handlePlayerFailed`, TV notices, and Mobile disabled search states; add Chinese-first copy for preprocessing/unsupported/reverted switch. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Product priority is stable singable flow, not feature breadth.
- Mobile is the only control surface; TV remains playback/status only.
- Playback state must be adjudicated by the server state machine.
- No software realtime vocal DSP; hardware owns final audio chain.
- Local catalog remains primary; online supplement is secondary and cached before playback.
- Preserve `room` model even for single-room use.
- Chinese search must continue covering title, artist, pinyin, initials, aliases, and search hints.
- Follow existing TypeScript monorepo, Fastify API, React app, and app-local runtime-hook patterns.
- Do not make direct implementation edits outside a GSD workflow; this artifact is the requested GSD research output.

## Summary

Phase 15 is not a new stack or new player. It is a contract and state-flow extension across already-existing surfaces: catalog search, queue command validation, playback target building, switch target building, TV runtime switching, and Mobile rendering. The highest-risk finding is that Phase 14 intentionally admitted real-MV assets as one `dual-track-video` Asset with `vocalMode: "dual"` and `switchFamily: null`. Existing search/queue/switch code still assumes two verified counterpart assets with different asset-level `vocalMode`, so it will exclude real MV from search, reject it at queue time, and produce no switch target.

Use one backend-authored playback-intent resolver for real MV. It should resolve a desired vocal mode (`original` or `instrumental`) from session state and map that to the asset's reviewed `trackRoles`, then carry both the effective mode and `selectedTrackRef` through queue options, session target mode, `PlaybackTarget`, `SwitchTarget`, TV telemetry, and snapshots. Do not let Mobile choose tracks and do not let TV infer business state from asset metadata.

**Primary recommendation:** Extend the existing search/add-queue/switch flow with a real-MV single-asset branch keyed by `asset.playbackProfile.kind === "single_file_audio_tracks"`, and keep the rest of the command/session/telemetry contracts server-authoritative.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 6.0.3 | Shared domain/player contracts and app code | Current repo baseline; prevents drift across API, Mobile, TV, and shared packages. |
| Fastify | 5.8.5 | API routes for search, commands, player telemetry | Existing server framework for route injection tests and command endpoints. |
| React | 19.2.5 | Mobile and TV UI/runtime hooks | Existing UI layer; Phase 15 needs small UI/runtime changes, not new frameworks. |
| Vite | 8.0.10 | Frontend build/test integration | Existing app build setup. |
| Vitest | 4.1.5 | API and frontend regression tests | Existing test runner across API, Mobile, and TV. |
| PostgreSQL SQL via `pg` | 8.20.0 | Catalog/session/queue persistence | Existing repositories use typed SQL directly; search relies on `pg_trgm`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/websocket` | 11.2.0 | Realtime snapshot fanout | Preserve existing snapshot update path after queue/switch commands. |
| `@tanstack/react-query` | 5.100.6 installed, 5.100.10 current | Existing Mobile/Admin server state dependency | Do not introduce new usage for Phase 15 unless following an existing pattern. |
| `pinyin-pro` | 3.28.1 | Chinese pinyin/initial search keys | Keep existing search normalization behavior. |
| `opencc-js` | 1.3.0 installed, 1.3.1 current | Simplified/traditional normalization | Keep existing Chinese-first behavior. |
| FFmpeg/ffprobe | 8.1 installed | Media fixture/probe support | Use only for validation fixtures or manual sample checks, not runtime transcoding. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing React/Fastify runtime | New media-player library | Not justified; the hard part is server state and browser capability gating, not rendering. |
| Existing `HTMLMediaElement.audioTracks` branch | hls.js/dash.js | Real MV files are direct MKV/MPG/MPEG assets; streaming libraries do not solve source audio-track switching for local files. |
| Existing SQL search | Dedicated search service | Out of scope; current pinyin/trigram search is already validated and Phase 15 only changes eligibility/result metadata. |

**Installation:**
```bash
pnpm install
```

**Version verification:** Registry checks were run with `npm view` on 2026-05-13. Current package versions: Fastify 5.8.5, React 19.2.6, Vite 8.0.12, Vitest 4.1.6, TypeScript 6.0.3, `pg` 8.20.0, `@fastify/websocket` 11.2.0, `pinyin-pro` 3.28.1, `opencc-js` 1.3.1. Keep repo-pinned versions unless a plan explicitly includes dependency updates.

## Architecture Patterns

### Recommended Project Structure

```text
packages/domain/src/index.ts                # Search/result and playback option contract fields
packages/player-contracts/src/index.ts      # PlaybackTarget/SwitchTarget extensions
apps/api/src/modules/playback/              # Backend playback intent, queue validation, switch target builders
apps/api/src/modules/catalog/repositories/  # Search eligibility/result construction
apps/api/src/routes/                        # Existing search, command, and player endpoints
apps/mobile-controller/src/                 # Disabled search results and clickable current-song switch
apps/tv-player/src/runtime/                 # Same-file audio-track switch and failure telemetry
apps/tv-player/src/screens/                 # Chinese notice/status copy
```

### Pattern 1: Backend-Authored Playback Intent

**What:** API resolves the intended mode and selected track. TV receives `playbackProfile` plus `selectedTrackRef`; Mobile only issues existing commands.

**When to use:** Every real-MV queue, start, resume, and switch path.

**Example:**
```typescript
// Source: apps/api/src/modules/playback/build-playback-target.ts
return {
  ...target,
  playbackProfile: buildPlaybackProfileForAsset(asset),
  selectedTrackRef: selectedTrackRefForResolvedMode(asset, resolvedVocalMode)
};
```

Planning note: the existing `selectedTrackRefForAsset(asset)` only checks `asset.vocalMode`. That works for legacy paired assets but fails for admitted real-MV assets because they are stored as `vocalMode: "dual"`.

### Pattern 2: Existing Command Flow, New Target Shape

**What:** Keep `switch-vocal-mode`, `requestSwitchTarget`, realtime snapshots, `/player/switch-transition`, telemetry, and rollback semantics. Extend `SwitchTarget` to carry same-asset track intent.

**When to use:** Switching real MV original/accompaniment during current playback.

**Example:**
```typescript
// Source: packages/player-contracts/src/index.ts plus existing build-switch-target flow
export interface SwitchTarget {
  fromAssetId: AssetId;
  toAssetId: AssetId;
  vocalMode: VocalMode;
  selectedTrackRef?: TrackRef | null;
  playbackProfile?: PlaybackProfile;
}
```

Recommended semantics: for same-asset real MV, `fromAssetId === toAssetId`, `playbackUrl` is unchanged, `vocalMode` is the target effective mode, and `selectedTrackRef` is the reviewed target role. Add a discriminant such as `switchKind: "asset" | "audio_track"` only if tests show it makes TV code clearer.

### Pattern 3: Visible But Disabled Search Results

**What:** Search should include approved real-MV songs even when not Mobile-queueable, with a disabled reason surfaced at result/version level.

**When to use:** Formal assets with `playbackProfile.kind === "single_file_audio_tracks"` and status/review/compatibility/track-role gaps.

**Example:**
```typescript
// Source: packages/domain/src/index.ts, extend current search option
export interface SongSearchVersionOption {
  assetId: AssetId;
  isRecommended: boolean;
  queueable?: boolean;
  disabledReasonCode?: "needs_preprocess" | "temporarily_unavailable" | "missing_track_role";
  disabledLabel?: string; // Mobile copy: "需预处理" or "暂不可播放"
}
```

Keep local result ordering and match reasons from `searchFormalSongs`; only broaden eligibility/result metadata.

### Anti-Patterns to Avoid

- **Letting asset `vocalMode: "dual"` mean selected playback mode:** For real MV it describes the source asset shape, not what the TV should play.
- **Adding a real-MV-only Mobile command:** User decision explicitly requires reusing `switch-vocal-mode`.
- **Committing switch before actual TV track selection:** TV must report/commit only after selecting the requested track; failures keep or revert playback.
- **Hiding unavailable real MV in search:** Mobile should show disabled results; Admin remains the detailed diagnostic surface.
- **Marking an asset permanently unusable after one runtime switch failure:** Failure may be browser/device-specific and should be a notice/telemetry event.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chinese search normalization | New fuzzy search/ranking | Existing `normalizeSearchText`, pinyin keys, `pg_trgm`, `searchMatchScores` | Search behavior is already a product constraint and tested. |
| Command/session concurrency | Ad hoc Mobile state mutation | Existing `executeRoomCommand`, command IDs, session versions, conflict responses | Avoids controller/TV drift. |
| Realtime updates | Manual Mobile polling after each real-MV command | Existing snapshot broadcaster and `useRoomControllerRuntime` | Keeps Mobile/TV synchronized. |
| Player failure recovery | Custom real-MV skip loop | Existing `handlePlayerFailed` and playback notices | Already updates queue/session and broadcasts recovery. |
| Audio track API abstraction from scratch across all browsers | Runtime-claiming compatibility matrix | Capability gate against actual current element: `audioTracks` presence, target track match, `enabled` mutation success | Browser support varies; verify the running TV environment. |

**Key insight:** Real-MV complexity is state correctness, not media plumbing. Use existing state machine and contracts; only add the missing selected-track dimension.

## Common Pitfalls

### Pitfall 1: Legacy Counterpart Eligibility Excludes Real MV

**What goes wrong:** Search and queue reject real MV because current SQL and command validation require `switch_quality_status = 'verified'`, non-null `switch_family`, and a ready counterpart asset.
**Why it happens:** Phases 1-11 modeled original/accompaniment as separate assets.
**How to avoid:** Add a real-MV eligibility branch for `single_file_audio_tracks` assets: ready/playable/source queueable plus selected role exists for the target mode.
**Warning signs:** Approved real MV appears in Admin but Mobile search returns no local result or `SONG_NOT_QUEUEABLE`.

### Pitfall 2: Selected Track Ref Is Null For Real MV

**What goes wrong:** TV receives `playbackProfile.requiresAudioTrackSelection: true` but `selectedTrackRef: null`.
**Why it happens:** Existing builder only maps `asset.vocalMode === "original" | "instrumental"`; admitted real MV uses `vocalMode: "dual"`.
**How to avoid:** Resolve effective vocal mode from queue/session state, then map through `asset.trackRoles`.
**Warning signs:** `buildPlaybackTarget` tests pass for fabricated real-MV assets with `vocalMode: "instrumental"` but fail with formal Phase 14 assets.

### Pitfall 3: Pending Target Mode Never Becomes Current Mode For Same Asset

**What goes wrong:** TV keeps trying to switch because `currentTarget.vocalMode` stays `"dual"` or old mode while `targetVocalMode` differs.
**Why it happens:** Legacy switch commits by changing `activeAssetId`; real-MV same-asset switching must update committed effective mode separately.
**How to avoid:** Plan a contract/session representation for current effective vocal mode. Options: store resolved mode in queue `playbackOptions` and update it on switch commit telemetry, or add session-level current selected mode. Be explicit.
**Warning signs:** Realtime snapshots continuously contain `targetVocalMode !== currentTarget.vocalMode` after successful track switch.

### Pitfall 4: `audioTracks` Type Is Not In TypeScript DOM Lib

**What goes wrong:** Direct `video.audioTracks` access fails typecheck.
**Why it happens:** The repo currently detects `"audioTracks" in video`; TypeScript 6 DOM types do not expose `AudioTrackList` in `lib.dom.d.ts`.
**How to avoid:** Add a narrow local interface/type guard in TV runtime tests, not global loose `any` spread across files.
**Warning signs:** TS errors in TV runtime or untyped track mutation logic.

### Pitfall 5: Unsupported Playback Is Reported In English

**What goes wrong:** TV/Mobile notices expose low-level English errors like `browser-cannot-play-type`.
**Why it happens:** Existing backend `playbackFailedNotice` and player route notice fallback are English for generic failures.
**How to avoid:** Add Chinese-first failure mapping for real-MV unsupported/preprocess/switch failures in TV display model and Mobile i18n, while leaving Admin detailed reasons.
**Warning signs:** `PlaybackStatusBanner` displays raw codec/probe/runtime strings.

## Code Examples

Verified patterns from the existing repo:

### Queue Command Validation And Append

```typescript
// Source: apps/api/src/modules/playback/session-command-service.ts
const selectedAsset = await input.repositories.assets.findById(requestedAssetId);
if (!selectedAsset || selectedAsset.songId !== song.id || selectedAsset.status !== "ready") {
  return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
}

await input.repositories.queueEntries.append({
  roomId: context.room.id,
  songId: song.id,
  assetId: selectedAsset.id,
  requestedBy: input.controlSession.deviceId,
  queuePosition: queuePosition + 1,
  playbackOptions: { preferredVocalMode: resolvedVocalMode }
});
```

### Playback Target Enrichment

```typescript
// Source: apps/api/src/modules/playback/build-playback-target.ts
playbackProfile: buildPlaybackProfileForAsset(asset),
selectedTrackRef: selectedTrackRefForResolvedMode(asset, queueEntry.playbackOptions.preferredVocalMode)
```

### TV Runtime Failure Telemetry

```typescript
// Source: apps/tv-player/src/runtime/switch-controller.ts
await this.client.sendTelemetry({
  eventType: "switch_failed",
  assetId: switchTarget.toAssetId,
  rollbackAssetId: switchTarget.rollbackAssetId,
  stage: "audio_track"
});
```

### Browser Capability Probe

```typescript
// Source: apps/tv-player/src/runtime/playback-capability.ts
const canPlayType = video.canPlayType(input.contentType);
const hasAudioTracksApi = "audioTracks" in video;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two logical assets, one per vocal mode | One real-MV Asset with reviewed `trackRoles` | Phase 12-14, completed 2026-05-13 | Search, queue, target, and switch builders need a same-asset branch. |
| Switch target always points to counterpart asset | Same-asset switch can change only `selectedTrackRef` | Phase 15 locked decision | TV runtime must support both dual-video and in-file audio-track branches. |
| Scanner/Admin readiness implied queueability | Runtime capability gates switching and playback | Phase 15 locked decision | Mobile may show visible disabled results before queueability. |
| Browser support inferred from probe/spike | Runtime checks actual TV browser APIs | Current web platform docs and existing `inspectCurrentWebPlaybackProfile` | `audioTracks` must be checked at switch time, not assumed globally. |

**Deprecated/outdated:**
- Counterpart-only `findVerifiedSwitchCounterparts` as the definition of queueable/switchable: keep it for legacy assets, but do not apply it to real MV.
- Asset-level `switchQualityStatus === "verified"` as real-MV runtime proof: Phase 14 deliberately leaves real-MV switch quality `review_required` until Phase 15.

## Open Questions

1. **How should committed current effective vocal mode be persisted for same-asset real MV?**
   - What we know: `playback_sessions.target_vocal_mode` exists, queue `playbackOptions.preferredVocalMode` exists, and telemetry updates `targetVocalMode` to reported vocal mode.
   - What's unclear: There is no separate session field for committed current vocal mode when `activeAssetId` remains the same.
   - Recommendation: Planner should choose the smallest durable representation that prevents repeated switch attempts and lets `buildPlaybackTarget` emit current `vocalMode` accurately after TV commit.

2. **Should same-asset `SwitchTarget` use a discriminant?**
   - What we know: `fromAssetId === toAssetId` is enough mechanically but may be implicit.
   - What's unclear: Whether tests/readability justify `switchKind`.
   - Recommendation: Add `switchKind: "asset" | "audio_track"` if it keeps TV runtime branching explicit.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All TS apps/tests | Yes | 25.8.0 | Repo expects modern Node; no fallback needed. |
| pnpm | Workspace commands | Yes | 10.33.2 | None. |
| npm | Registry version checks | Yes | 11.11.0 | pnpm for project work. |
| Vite | Mobile/TV dev and tests | Yes | 8.0.10 repo exec | None. |
| Vitest | API/Mobile/TV tests | Yes | 4.1.5 repo exec | None. |
| FFmpeg/ffprobe | Optional media fixture/manual validation | Yes | 8.1 | Synthetic test fakes for most Phase 15 plans. |
| Google Chrome | Manual TV audio-track check | Yes | 148.0.7778.167 | Happy DOM unit tests for logic; manual browser verification still recommended. |
| Docker | Optional service/test environment | Yes | 29.4.1 client | Not required for unit plans. |
| psql | Direct DB inspection | No | — | Use API tests/fake repositories unless DB validation plan needs local Postgres. |
| redis-cli | Redis checks | No | — | Redis not required for Phase 15. |

**Missing dependencies with no fallback:**
- None for code-level planning and automated unit/integration tests.

**Missing dependencies with fallback:**
- `psql` missing; use existing repository tests/fakes unless a plan explicitly requires direct live DB inspection.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/15-search-queue-playback-and-switching/15-CONTEXT.md` - locked Phase 15 decisions.
- `.planning/REQUIREMENTS.md` - PLAY-01 through PLAY-05.
- `.planning/ROADMAP.md` - Phase 15 goal and success criteria.
- `.planning/PROJECT.md` and `CLAUDE.md` - product and architecture constraints.
- `packages/domain/src/index.ts` - `PlaybackProfile`, `TrackRef`, `TrackRoles`, `PlaybackOptions`, search result contracts.
- `packages/player-contracts/src/index.ts` - `PlaybackTarget`, `SwitchTarget`, snapshots, telemetry.
- `apps/api/src/modules/catalog/repositories/song-repository.ts` - search eligibility and version options.
- `apps/api/src/modules/playback/session-command-service.ts` - add queue, switch command, session synchronization, failure handling.
- `apps/api/src/modules/playback/build-playback-target.ts` and `build-switch-target.ts` - backend target construction.
- `apps/tv-player/src/runtime/*` - dual-video pool, switch runtime, capability probe, synchronization.
- `apps/mobile-controller/src/*` - search UI, commands, realtime controller runtime.
- Current HTML Standard media section - `HTMLMediaElement.audioTracks`/`AudioTrackList` API shape: https://html.spec.whatwg.org/multipage/media.html
- W3C Media Capabilities spec - `decodingInfo()` support/smooth/powerEfficient model: https://w3c.github.io/media-capabilities/

### Secondary (MEDIUM confidence)
- MDN `HTMLMediaElement.audioTracks` and `AudioTrackList` documentation - browser API behavior and compatibility warnings: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks
- MDN Media Capabilities documentation - practical browser API notes: https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities
- npm registry metadata checked via `npm view` on 2026-05-13.

### Tertiary (LOW confidence)
- None used for critical claims.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified from package files and npm registry.
- Architecture: HIGH - based on direct code inspection of the exact Phase 15 integration points.
- Pitfalls: HIGH - derived from mismatches between Phase 14 admitted real-MV asset shape and current search/queue/switch assumptions.
- Browser switching: MEDIUM - standards and MDN document the API, but actual browser/device support must be verified at runtime.

**Research date:** 2026-05-13
**Valid until:** 2026-06-12 for repo architecture; 2026-05-20 for browser compatibility details.
