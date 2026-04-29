---
status: partial
phase: 01-media-contract-tv-runtime
source: [01-VERIFICATION.md]
started: 2026-04-28T09:16:00Z
updated: 2026-04-29T14:52:25Z
---

## Current Test

number: 4
name: Switch failure rollback
expected: |
  A forced switch-target playback failure rolls back to the previous vocal mode and shows productized rollback messaging.
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
result: pending

### 5. Reconnect recovery
expected: Refreshing/reconnecting resumes near the prior point; if resume cannot be honored, the same song restarts from 0 with a clear notice.
result: pending

### 6. Second TV conflict
expected: A second TV player for `living-room` sees an explicit conflict state and does not take over playback.
result: pending

## Summary

total: 6
passed: 3
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
