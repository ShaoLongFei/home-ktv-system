# Phase 8: Code Structure & Logic Hardening Design

**Goal:** Make the existing Admin, Mobile, and TV code easier to maintain by pulling runtime logic out of page components and into focused hooks/helpers, without changing visible product behavior.

**Architecture:** Keep the phase local to the existing apps. Do not add a new shared workspace package unless a concrete extraction proves to be duplicated across all three apps. Instead, make each page shell thin and move orchestration into app-local runtime modules:

- Admin: move room-status fetching, realtime sync, refresh actions, and task-action bookkeeping into a dedicated room-status hook.
- Mobile: split the controller runtime into session/realtime/bootstrap, command execution, and search orchestration helpers while keeping the public hook API stable.
- TV: move playback orchestration, heartbeat, recovery, and keyboard/pointer side effects out of `App.tsx` into a dedicated runtime hook so the app shell only chooses which screen to render.

This keeps the code shape simple, avoids a new package boundary, and makes it easier to reason about each app in isolation.

**Tech Stack:** TypeScript, React hooks, Vitest, existing app-local CSS and runtime controllers.

---

## Alternatives Considered

1. **Create a shared web-client utilities package**
   - Pros: removes some duplicated fetch/error/id helpers.
   - Cons: introduces a new package boundary and more wiring than Phase 8 needs.
   - Rejected for now.

2. **Leave runtime logic where it is and only rename helpers**
   - Pros: low risk.
   - Cons: does not actually improve maintainability enough for Phase 8.
   - Rejected.

3. **Extract app-local runtime hooks and helpers**
   - Pros: improves separation without broad structural churn.
   - Cons: more files, but the complexity stays local.
   - Chosen.

## Boundary Rules

- Page components should render state, not own the state machine.
- Runtime hooks may own effects, polling, websocket lifecycles, and command orchestration.
- Pure formatting or mapping helpers can stay local to each app.
- Existing visible copy, status names, and behavior stay unchanged unless a test proves a bug.

## Testing Strategy

- Keep existing integration/UI tests as the safety net.
- Add focused hook/controller tests for the extracted runtime boundaries where the page test no longer directly exercises the logic.
- Run the app-level test suites and `pnpm typecheck` after each extraction.

## Deferred

- A true cross-app shared client package.
- Broader cleanup of import/catalog pages unless the extraction exposes real duplication.
- UI changes unrelated to boundary cleanup.
