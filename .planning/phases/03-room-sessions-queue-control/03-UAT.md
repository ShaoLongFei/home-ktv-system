---
status: complete
phase: 03-room-sessions-queue-control
source:
  - .planning/phases/03-room-sessions-queue-control/03-01-SUMMARY.md
  - .planning/phases/03-room-sessions-queue-control/03-02-SUMMARY.md
  - .planning/phases/03-room-sessions-queue-control/03-03-SUMMARY.md
  - .planning/phases/03-room-sessions-queue-control/03-04-SUMMARY.md
  - .planning/phases/03-room-sessions-queue-control/03-05-SUMMARY.md
  - .planning/phases/03-room-sessions-queue-control/03-06-SUMMARY.md
  - .planning/phases/03-room-sessions-queue-control/03-07-SUMMARY.md
  - .planning/phases/03-room-sessions-queue-control/03-08-SUMMARY.md
started: 2026-05-04T01:43:38Z
updated: 2026-05-07T03:36:34Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running API/admin/TV/mobile dev server. Start the app stack from scratch. The API boots without migration/schema errors, the admin app loads, the TV player loads the living-room snapshot, and a primary health or room snapshot request returns live data.
result: pass

### 2. TV Pairing QR and Token Refresh
expected: The TV idle/playing screen shows the living-room pairing QR. In admin Rooms, clicking Refresh pairing token changes the token expiry/QR payload, and the TV QR updates to the server-refreshed token without restarting the TV app.
result: pass

### 3. Mobile Scan Entry and Session Restore
expected: Opening the mobile controller URL with room and token enters the controller screen, removes token from the URL after success, and later reloads using the httpOnly control-session cookie even if the old URL token has expired or rotated.
result: pass

### 4. WebSocket Live State Fanout
expected: With TV and at least one mobile controller open, room state updates appear on all clients without manual refresh after queue or playback changes. If WebSocket disconnects, clients show or use fallback behavior and recover latest state.
result: pass

### 5. Ready Song Picker and Queue Add
expected: The mobile controller shows a minimal ready-song picker. Tapping a song adds it through the server command route, updates the shared queue, and the new queue item appears on other controllers and TV state.
result: pass

### 6. Queue Promote, Delete, and Undo
expected: A queued song can be promoted to the first slot after the current song. Deleting a queued song removes it immediately and shows Undo only during the server-provided undo window; Undo restores it to the queue.
result: pass

### 7. Skip Current Confirmation and Advancement
expected: Tapping Skip opens a confirmation dialog. Confirming skips the current song, advances to the next queued song when one exists, and returns the room to idle when the queue is empty.
result: pass

### 8. Vocal Mode Switch
expected: Tapping the vocal switch button sends immediately without confirmation. TV playback switches between instrumental/original using the server-provided switch target while preserving the playback position.
result: pass

### 9. Admin Room Status View
expected: Admin defaults to Imports, can switch to Rooms, and the Rooms view shows token expiry, online controller count, TV status, session version, current song, queue preview, and Refresh pairing token.
result: pass

### 10. Active TV Conflict Safety
expected: Starting a second TV player for the same living-room shows the active-player conflict state and does not start playback or overwrite the active TV state.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
