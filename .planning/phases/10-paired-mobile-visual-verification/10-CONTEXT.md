# Phase 10 Context: Paired Mobile Visual Verification

## Trigger

Created from `.planning/v1.1-MILESTONE-AUDIT.md`.

## Gap Scope

The audit found that `scripts/ui-visual-check.mjs` defaults to:

```text
/controller?room=living-room
```

Because the script uses a temporary Chrome profile, the Mobile screenshot does not carry an existing control-session cookie and therefore does not reliably capture the paired controller state.

## Requirements

- PROD-03
- PROD-05

## Expected Outcome

- Mobile visual validation can cover a paired controller state deterministically.
- The script or UAT docs explain how the pairing token/session is obtained.
- Existing Admin/Mobile screenshot outputs remain intact.
- Failure output is clear when local services are not running or pairing cannot be created.

## Non-Goals

- Do not redesign the Mobile UI.
- Do not introduce a heavy browser-test stack unless the existing lightweight Chrome helper cannot support the flow.
