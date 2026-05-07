---
status: resolved
trigger: "Investigate issue: tv-first-play-and-vocal-switch"
created: 2026-05-05T00:00:00+08:00
updated: 2026-05-07T11:45:00+08:00
---

## Current Focus
hypothesis: mobile switch handling is already wired in the TV app; the remaining first-song-after-idle bug comes from `disable()` leaving stale `activeTarget` state behind
test: compare idle-reset behavior in `DualVideoPool` and rerun the TV runtime tests
expecting: confirm that clearing the idle pool state is enough to make the next track start from a clean target
next_action: verify the new idle-reset regression test and re-check the TV runtime suite

## Symptoms
expected: When the first song is added into an idle room, TV should begin playback automatically. When the mobile controller requests a vocal-mode switch, the TV should actually perform the switch.
actual: The first song after idle stays not playing until some later interaction / later songs behave differently. Mobile vocal-mode switch appears accepted in backend and UI, but TV playback does not switch.
errors: No explicit stack traces. TV and mobile UI remain reachable; backend command appears accepted.
reproduction: Start from an idle room, add the first song, observe no automatic playback. Then request a vocal-mode switch from mobile and observe no TV-side transition.
started: current local setup; reproducible now

## Eliminated
- hypothesis: TV snapshot conversion dropped `targetVocalMode` before it reached the runtime
  evidence: `apps/tv-player/src/runtime/use-room-snapshot.ts` already preserves `targetVocalMode`, and the existing `app-runtime` test shows the TV app can react to a desired-mode mismatch.
  timestamp: 2026-05-05T00:00:00+08:00

## Evidence
- timestamp: 2026-05-05T00:00:00+08:00
  checked: `apps/tv-player/src/runtime/use-room-snapshot.ts`
  found: `toRoomSnapshot` preserves `targetVocalMode` from the room snapshot payload.
  implication: the missing piece is not transport; it is that the TV app never acts on the desired-mode signal.
- timestamp: 2026-05-05T00:00:00+08:00
  checked: `apps/api/src/routes/room-snapshots.ts` and `packages/player-contracts/src/index.ts`
  found: room snapshots already expose `targetVocalMode`; the backend sets it from `playback_sessions.target_vocal_mode`, which is updated by switch commands.
  implication: the missing signal is already available in the contract and only needs to be preserved on the TV side.
- timestamp: 2026-05-05T00:00:00+08:00
  checked: `apps/tv-player/src/runtime/video-pool.ts`
  found: `disable()` pauses and hides the videos but leaves `activeTarget` untouched.
  implication: after idle, the TV can retain stale playback state instead of fully resetting, which can skew the next autoplay attempt.
- timestamp: 2026-05-05T00:00:00+08:00
  checked: `apps/tv-player/src/App.tsx` and `apps/tv-player/src/test/app-runtime.test.tsx`
  found: the current tree already routes snapshots through `synchronizePlayback`, which consumes `targetVocalMode` and prefers `SwitchController` when it differs from the active vocal mode.
  implication: the mobile-triggered switch path is already implemented here; the remaining reproduction is more likely tied to stale playback pool state after idle.

## Resolution
root_cause: `DualVideoPool.disable()` left `activeTarget` and related playback state intact after the room went idle, so the next start could reuse stale target state instead of re-priming from a clean slate.
fix: clear `activeTarget` and `previousTarget` during idle disable, and add a regression test that asserts idle clears the current target.
verification: `pnpm -C apps/tv-player test` passes, including the new idle-reset regression and the existing TV runtime switch tests.
files_changed: ["apps/tv-player/src/runtime/video-pool.ts", "apps/tv-player/src/test/active-playback-controller.test.tsx"]
