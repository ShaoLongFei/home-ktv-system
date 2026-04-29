---
status: partial
phase: 01-media-contract-tv-runtime
source: [01-VERIFICATION.md]
started: 2026-04-28T09:16:00Z
updated: 2026-04-29T14:48:32Z
---

## Current Test

number: 3
name: Near-seamless verified vocal switch
expected: |
  Switching between a verified original/instrumental pair preserves near-prior progress and commits only after standby playback is ready.
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
result: issue
reported: "能显示页面，但是视频没有播放，按 v 是会切换画面且有“嘀”的一声，但底部模式文字没有任何变化"
severity: major

### 4. Switch failure rollback
expected: A forced switch-target playback failure rolls back to the previous vocal mode and shows productized rollback messaging.
result: pending

### 5. Reconnect recovery
expected: Refreshing/reconnecting resumes near the prior point; if resume cannot be honored, the same song restarts from 0 with a clear notice.
result: pending

### 6. Second TV conflict
expected: A second TV player for `living-room` sees an explicit conflict state and does not take over playback.
result: pending

## Summary

total: 6
passed: 2
issues: 1
pending: 3
skipped: 0
blocked: 0

## Gaps

- truth: "Switching between a verified original/instrumental pair preserves near-prior progress and commits only after standby playback is ready."
  status: failed
  reason: "User reported: 能显示页面，但是视频没有播放，按 v 是会切换画面且有“嘀”的一声，但底部模式文字没有任何变化"
  severity: major
  test: 3
  artifacts:
    - "apps/tv-player/src/App.tsx: playing snapshots primed the active video source but did not start active playback."
    - "apps/tv-player/src/runtime/switch-controller.ts: successful standby commits did not report playing telemetry, so backend snapshots stayed on the previous vocal mode."
  missing:
    - "Runtime path to start active video for the current playback target."
    - "Successful switch commit telemetry that updates backend active asset and vocal mode after standby playback is ready."
