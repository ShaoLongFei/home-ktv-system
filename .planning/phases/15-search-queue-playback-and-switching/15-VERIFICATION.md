---
phase: 15-search-queue-playback-and-switching
verified: 2026-05-13T11:20:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 15: Search, Queue, Playback, and Switching Verification Report

**Phase Goal:** Make approved real MV songs searchable, queueable, playable, and switchable only when runtime capability is verified.
**Verified:** 2026-05-13T11:20:00Z
**Status:** passed
**Re-verification:** No

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Approved real-MV songs are visible in Mobile search and queueable when playable. | VERIFIED | `song-repository.ts` builds `canQueue`/`disabledLabel` version options; `song-search-routes.test.ts` covers ready real-MV search versions; `controller.test.tsx` covers queueable add payload without `vocalMode`; `real-mv-playback-flow.test.ts` covers search -> queue. |
| 2 | Queueing real MV uses backend-resolved vocal intent and defaults to accompaniment when appropriate. | VERIFIED | `session-command-service.ts` resolves real-MV queue mode from session target mode and persists `playbackOptions.preferredVocalMode`; `room-queue-commands.test.ts` and `real-mv-playback-flow.test.ts` assert instrumental default. |
| 3 | TV receives explicit playback profile and selected audio-track intent. | VERIFIED | `PlaybackTarget.selectedTrackRef` exists in player contracts; `build-playback-target.ts` emits `playbackProfile` and `selectedTrackRef`; `active-playback-controller.test.tsx` proves TV applies `selectedTrackRef` before playback. |
| 4 | Original/accompaniment switching reuses the existing switch command and is runtime-gated. | VERIFIED | `SwitchTarget.switchKind` supports `audio_track`; `build-switch-target.ts` creates same-asset real-MV switch targets; TV `switch-controller.ts` only commits after audio-track selection; TV tests cover commit and failure paths. |
| 5 | Unsupported, missing-track, and runtime failure states remain visible and clear. | VERIFIED | Search disabled states return `需预处理`, `暂不可播放`, or `缺少伴唱声轨`; Mobile renders disabled buttons and switch failures; TV emits capability-blocked telemetry and Chinese notices. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `apps/api/src/modules/catalog/repositories/song-repository.ts` | Search version queueability contract | VERIFIED | Builds `queueState`, `canQueue`, and `disabledLabel` for real-MV versions. |
| `apps/mobile-controller/src/App.tsx` | Disabled result UI and switch/notice rendering | VERIFIED | Reads `canQueue`/`disabledLabel`, renders `version-option__status`, keeps switch action visible for current targets, and renders snapshot notices. |
| `apps/mobile-controller/src/runtime/use-room-controller-runtime.ts` | Switch command error handling | VERIFIED | Maps `SWITCH_TARGET_NOT_AVAILABLE` to Chinese copy and keeps UI interactive. |
| `apps/api/src/modules/playback/session-command-service.ts` | Real-MV queue mode resolution | VERIFIED | Persists preferred vocal mode in queue playback options. |
| `apps/api/src/modules/playback/build-playback-target.ts` | Playback target selected track | VERIFIED | Emits `playbackProfile` and `selectedTrackRef`. |
| `apps/api/src/modules/playback/build-switch-target.ts` | Same-asset switch target | VERIFIED | Emits `switchKind: "audio_track"` with target `selectedTrackRef`. |
| `apps/tv-player/src/runtime/video-pool.ts` and `switch-controller.ts` | Browser TV audio-track application and switch commit/failure | VERIFIED | Applies selected tracks and commits switch only after runtime selection succeeds. |
| `apps/api/src/test/real-mv-playback-flow.test.ts` | Cross-surface regression | VERIFIED | Covers search, queue, playback target, switch target, switch commit persistence, and unsupported queue rejection. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `song-repository.ts` | Mobile search UI | `SongSearchVersionOption.canQueue` / `disabledLabel` | WIRED | Mobile uses backend version fields directly for disabled UI state. |
| Mobile `addQueueEntry` | API command service | `{ songId, assetId }` payload only | WIRED | No queue-time `vocalMode` payload was added. |
| `session-command-service.ts` | `build-playback-target.ts` | `QueueEntry.playbackOptions.preferredVocalMode` | WIRED | Queue intent flows into selected `TrackRef`. |
| `build-switch-target.ts` | TV `switch-controller.ts` | `SwitchTarget.switchKind === "audio_track"` and `selectedTrackRef` | WIRED | Same-asset switch target is interpreted by TV runtime. |
| TV telemetry | API `telemetry-service.ts` | `stage: "switch_committed"` | WIRED | Successful TV switch commits `preferredVocalMode`; failed switch does not. |

### Data-Flow Trace

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| Mobile search result | `canQueue`, `queueState`, `disabledLabel` | API catalog repository -> search route -> Mobile runtime | Yes | FLOWING |
| Queue entry | `playbackOptions.preferredVocalMode` | Add queue command + session target mode | Yes | FLOWING |
| TV playback target | `selectedTrackRef` | Queue preferred mode + reviewed real-MV `trackRoles` | Yes | FLOWING |
| TV switch target | `switchKind`, `selectedTrackRef` | Current real-MV asset + committed preferred mode | Yes | FLOWING |
| Switch commit | `preferredVocalMode` update | TV `playing` telemetry with `switch_committed` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| API Phase 15 regression | `pnpm -F @home-ktv/api test -- src/test/song-search-routes.test.ts src/test/room-queue-commands.test.ts src/test/build-playback-target.test.ts src/test/build-switch-target.test.ts src/test/player-runtime-contract.test.ts src/test/real-mv-playback-flow.test.ts` | 36 files, 231 tests passed | PASS |
| Mobile regression | `pnpm -F @home-ktv/mobile-controller test -- src/test/controller.test.tsx` | 1 file, 35 tests passed | PASS |
| TV regression | `pnpm -F @home-ktv/tv-player test -- src/test/active-playback-controller.test.tsx src/test/app-runtime.test.tsx src/test/tv-screen-states.test.tsx` | 15 files, 55 tests passed | PASS |
| Player contracts typecheck | `pnpm -F @home-ktv/player-contracts typecheck` | exit 0 | PASS |
| API typecheck | `pnpm -F @home-ktv/api typecheck` | exit 0 | PASS |
| Mobile typecheck | `pnpm -F @home-ktv/mobile-controller typecheck` | exit 0 | PASS |
| TV typecheck | `pnpm -F @home-ktv/tv-player typecheck` | exit 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `PLAY-01` | `15-01`, `15-05` | Search and queue approved real-MV songs from Mobile. | SATISFIED | Search route tests, Mobile queue test, real-MV playback flow regression. |
| `PLAY-02` | `15-02`, `15-05` | Queueing defaults to accompaniment when confirmed. | SATISFIED | Room queue command tests and playback flow regression assert `preferredVocalMode: "instrumental"`. |
| `PLAY-03` | `15-02`, `15-03`, `15-04`, `15-05` | TV receives playback profile and selected track. | SATISFIED | Build playback target tests, player contracts, TV active playback tests. |
| `PLAY-04` | `15-03`, `15-04`, `15-05` | Switch only when runtime capability succeeds. | SATISFIED | Same-asset switch target tests, TV switch runtime tests, TV app runtime tests. |
| `PLAY-05` | `15-01`, `15-03`, `15-04`, `15-05` | Unsupported/preprocess/failure states are clear. | SATISFIED | Search disabled state tests, Mobile disabled UI tests, TV failure notice tests. |

All Phase 15 requirement IDs are now complete in `.planning/REQUIREMENTS.md` and covered by implementation plus automated regression evidence.

### Anti-Patterns Found

None blocking. The final source guard confirms the new Phase 15 regression does not pull native Android TV, transcoding, OpenList, or download workflows into this phase.

### Human Verification

No human-only verification is required for Phase 15. Actual browser support for selecting audio tracks remains runtime-gated; unsupported devices take the tested capability-blocked path.

### Gaps Summary

No blocking gaps remain. Phase 15 achieved its goal: approved real-MV songs are searchable and queueable, playback carries explicit selected-track intent, same-asset switching uses the existing command/telemetry flow, and unavailable or failed states stay visible with clear Chinese UI.

---

_Verified: 2026-05-13T11:20:00Z_
_Verifier: Codex inline verification_
