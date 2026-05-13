# Phase 15: Search, Queue, Playback, and Switching - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 15 connects approved real-MV catalog entries to the existing singing flow. Mobile users must be able to search and queue approved real MV songs, TV must receive explicit real-MV playback profile and selected audio-track intent, and original/accompaniment switching must work through runtime-gated single-file audio-track switching. This phase does not implement automatic transcoding/remuxing, native Android TV, new media acquisition, or new Admin admission policy.

</domain>

<decisions>
## Implementation Decisions

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

### the agent's Discretion
- Exact contract field names for same-asset switch targets are left to the planner, as long as the existing switch command/transition flow is reused.
- Exact Mobile copy and badge layout are planner discretion, but default language must remain Chinese and disabled states must be obvious.
- Exact runtime audio-track selection mechanism is planner discretion, provided it is capability-checked and tested against the existing browser TV player.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope
- `.planning/PROJECT.md` - v1.2 goal, real MV file model, no forced transcoding, Android TV deferral, and active Phase 15 requirements.
- `.planning/REQUIREMENTS.md` - PLAY-01 through PLAY-05 and v1.2 hardening boundaries.
- `.planning/ROADMAP.md` - Phase 15 goal, dependency on Phase 14, and success criteria.
- `.planning/STATE.md` - current milestone decisions and Phase 15 focus.

### Prior Phase Contracts
- `.planning/phases/12-contract-schema-and-playback-risk-spike/12-CONTEXT.md` - single real-MV Asset, `trackRoles`, `playbackProfile`, `selectedTrackRef`, and playback-risk decisions.
- `.planning/phases/13-mediainfo-probe-scanner-and-sidecars/13-CONTEXT.md` - same-stem real-MV file organization, MediaInfo provenance, track-role inference, and compatibility surface.
- `.planning/phases/14-admin-review-and-catalog-admission/14-CONTEXT.md` - Admin review, reviewed `trackRoles`, readiness mapping, one Song plus one real-MV Asset, and Phase 15 runtime deferral.
- `.planning/phases/14-admin-review-and-catalog-admission/14-VERIFICATION.md` - verified real-MV admission and durable song.json evidence.

### Search And Queue
- `apps/api/src/routes/song-search.ts` - Mobile search endpoint and online supplement response shape.
- `apps/api/src/modules/catalog/repositories/song-repository.ts` - formal song search eligibility and version option construction.
- `apps/mobile-controller/src/App.tsx` - Mobile search results, version selection, queue controls, and switch button UI.
- `apps/mobile-controller/src/runtime/use-room-controller-runtime.ts` - Mobile command orchestration, realtime snapshot handling, and duplicate queue confirmation.
- `apps/mobile-controller/src/api/client.ts` - Mobile command API calls for add queue, skip, promote, and switch vocal mode.
- `apps/api/src/modules/playback/session-command-service.ts` - queue mutation, selected asset validation, `switch-vocal-mode`, and playback session synchronization.
- `apps/api/src/modules/playback/repositories/queue-entry-repository.ts` - queue entry persistence and `playbackOptions`.

### Player Contracts And TV Runtime
- `packages/domain/src/index.ts` - `PlaybackProfile`, `TrackRef`, `TrackRoles`, `Asset`, `QueueEntry`, and `PlaybackOptions`.
- `packages/player-contracts/src/index.ts` - `PlaybackTarget`, `SwitchTarget`, `RoomSnapshot`, and `RoomControlSnapshot`.
- `apps/api/src/modules/playback/build-playback-target.ts` - backend-authored `playbackProfile` and `selectedTrackRef`.
- `apps/api/src/modules/playback/build-switch-target.ts` - current counterpart-asset switch target builder that must be extended for same-asset real MV.
- `apps/api/src/modules/playback/apply-switch-transition.ts` - switch transition endpoint logic.
- `apps/api/src/routes/player.ts` - player bootstrap, telemetry, switch transition, and reconnect recovery routes.
- `apps/tv-player/src/runtime/video-pool.ts` - current dual-video playback pool and target priming behavior.
- `apps/tv-player/src/runtime/switch-controller.ts` - TV switch command, rollback, and telemetry behavior.
- `apps/tv-player/src/runtime/use-tv-playback-runtime.ts` - TV snapshot synchronization, local notices, and switch orchestration.
- `apps/tv-player/src/runtime/playback-capability.ts` - current web playback and audio-track API inspection.
- `apps/tv-player/src/screens/PlayingScreen.tsx` - TV current mode, status, time, and next-song display.
- `apps/tv-player/src/screens/tv-display-model.ts` - Chinese TV state and notice copy.

### Compatibility And Admission
- `apps/api/src/modules/media/real-mv-compatibility.ts` - compatibility status and track-role inference helpers.
- `apps/api/src/modules/catalog/admission-service.ts` - real-MV formal admission readiness and Asset construction.
- `apps/api/src/modules/catalog/song-json.ts` - durable real-MV song.json contract.
- `apps/api/src/modules/catalog/song-json-consistency-validator.ts` - single real-MV asset validation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildPlaybackTarget` already emits `playbackProfile` and `selectedTrackRef` for assets; Phase 15 should preserve this backend-authored playback intent.
- `QueueEntry.playbackOptions.preferredVocalMode` already exists and can carry queue-time vocal intent if the planner decides it is the cleanest fit.
- The Mobile controller already has realtime snapshot handling, search debouncing, duplicate confirmation, queue commands, and a single switch button.
- The TV runtime already has local notices, switch rollback telemetry, and playback position reporting.
- `inspectCurrentWebPlaybackProfile` already reports whether the browser exposes an `audioTracks` API.

### Established Patterns
- Backend owns queue/playback truth; Mobile sends commands and renders snapshots.
- Search currently returns only ready, queueable, verified switch-pair assets. Phase 15 must adapt this so nonqueueable real-MV songs can be visible but disabled.
- Existing switch logic assumes a counterpart Asset. Real MV must extend that flow for same-asset track switching without duplicating command semantics.
- Existing TV notices are Chinese-first and should remain the visible surface for failures/recovery.

### Integration Points
- Search eligibility and version options need to understand single real-MV Assets, queueability, and disabled reasons.
- `addQueueEntry` needs to resolve real-MV queue intent from current room mode and reviewed `trackRoles`.
- `buildSwitchTarget`/`applySwitchTransition` need a same-asset branch that carries target `TrackRef`.
- TV runtime needs same-file audio-track selection and fallback notices when unsupported.
- Mobile and TV UI need disabled/unavailable copy for "需预处理" and clear switch failure feedback.

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants queueing to follow the current playback mode rather than asking original/accompaniment at queue time.
- User explicitly chose to extend the existing switch flow for same-asset `TrackRef` switching.
- User wants the switch button always clickable for eligible current songs, with failure rollback and clear message when unsupported.
- User wants Mobile search to keep unavailable real-MV songs visible but disabled, while Admin keeps the detailed reason surface.

</specifics>

<deferred>
## Deferred Ideas

- Native Android TV audio-track switching remains a future milestone.
- Automatic transcoding/remuxing remains out of scope; user preprocesses unsupported files outside the system.
- Media acquisition, OpenList matching, and online MV download flows are outside Phase 15.

</deferred>

---

*Phase: 15-search-queue-playback-and-switching*
*Context gathered: 2026-05-13*
