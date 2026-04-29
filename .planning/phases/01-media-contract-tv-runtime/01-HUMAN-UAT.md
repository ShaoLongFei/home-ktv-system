---
status: partial
phase: 01-media-contract-tv-runtime
source: [01-VERIFICATION.md]
started: 2026-04-28T09:16:00Z
updated: 2026-04-29T15:32:50Z
---

## Current Test

number: 6
name: Second TV conflict
expected: |
  A second TV player for `living-room` sees an explicit conflict state and does not take over playback.
awaiting: user response

## Tests

### 1. Idle QR
expected: The TV player in `idle` shows a large room pairing QR for `living-room`.
result: pass

### 2. Playing HUD
expected: The TV player in `playing` shows a small corner QR plus current song, next song placeholder, and current vocal mode.
result: pass

### 3. Near-seamless verified vocal switch
expected: Switching between a verified original/instrumental pair preserves near-prior progress and commits only after standby playback is ready.
result: pass

### 4. Switch failure rollback
expected: A forced switch-target playback failure rolls back to the previous vocal mode and shows productized rollback messaging.
result: pass

### 5. Reconnect recovery
expected: Refreshing/reconnecting resumes near the prior point; if resume cannot be honored, the same song restarts from 0 with a clear notice.
result: pass

### 6. Second TV conflict
expected: A second TV player for `living-room` sees an explicit conflict state and does not take over playback.
result: issue
reported: "第二个窗口没有显示冲突页面，它进入之后也可以开始播放"
severity: major

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "A second TV player for `living-room` sees an explicit conflict state and does not take over playback."
  status: failed
  reason: "User reported: 第二个窗口没有显示冲突页面，它进入之后也可以开始播放"
  severity: major
  test: 6
  artifacts:
    - "POST /player/bootstrap with deviceId=web-tv-debug-second returned status=conflict while the first TV heartbeat was active."
    - "device_sessions contained only the first TV row during the failed manual test, indicating the second browser window did not register as a distinct TV device."
    - "apps/tv-player/src/runtime/player-client.ts generated deviceId only from local storage/random state and ignored URL device identity."
    - "POST /player/bootstrap with deviceId=web-tv-uat-second returned status=conflict, but the TV hook immediately fetched /rooms/living-room/snapshot and overwrote the conflict snapshot with a normal playing snapshot."
  missing:
    - "A deterministic runtime deviceId override for UAT and TV shell launches so a second TV instance can be identified separately."
    - "Conflict bootstrap must stop normal room snapshot polling so a rejected TV player stays on the conflict screen."
