# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-05-08  
**Phases:** 5 | **Plans:** 25 | **Tasks:** 51

### What Was Built

- Single-room KTV runtime with controlled media contracts, TV playback, telemetry, reconnect recovery, conflict safety, and vocal-mode switching.
- Local library ingest, import review, strict formal catalog admission, `song.json` validation, and admin catalog maintenance.
- QR room entry, control-session restore, realtime room-state fanout, queue control, and admin pairing-token refresh.
- Chinese-first search, pinyin/initial/alias matching, version-aware song selection, and duplicate queue confirmation.
- Online supplement task flow with cache-before-play, provider kill-switch boundaries, failure recovery, and admin recovery actions.
- Default Chinese admin and mobile controller UI with language-switch support.

### What Worked

- Keeping the server as the single source of truth prevented TV, mobile, and admin state from drifting once realtime fanout was wired.
- Separating `Song` from `Asset` made version selection, vocal-mode switching, local resources, and cached online resources fit the same playback model.
- Human UAT caught real deployment and browser behaviors that unit tests could not cover, especially TV online state, QR URLs, and first-play browser gesture limits.
- The local demo-song and demo-provider scripts made the system testable without relying on copyrighted media or external online providers.

### What Was Inefficient

- Planning docs drifted behind implementation for Phase 3 and Phase 5, which made milestone closure require reconciliation work.
- Several verification loops depended on manual multi-terminal deployment until `pnpm dev:local` improved local orchestration.
- Browser autoplay rules created product behavior that looked like a bug until the limitation was isolated and documented through UAT.

### Patterns Established

- Use explicit server-authored snapshots for TV, mobile, and admin rather than duplicating local client state logic.
- Treat online supplement as a task lifecycle, not a queue command; cached online assets become queueable only after ready/verified admission.
- Keep all local dev services behind one orchestration command with per-service logs.
- Put user-visible language strings behind small app-local i18n helpers before UI text grows further.

### Key Lessons

1. Close planning metadata immediately after UAT; stale requirement checkboxes create friction at milestone closure.
2. For media apps in browsers, design first-play and playback-mode behavior around real browser restrictions instead of treating them as implementation bugs.
3. Local deterministic providers and generated demo media are essential for repeatable verification of media workflows.
4. Realtime fanout needs both API-level tests and browser UAT because stale UI state is often a wiring issue, not a component-render issue.

### Cost Observations

- Model mix: mostly high-reasoning implementation and verification sessions.
- Sessions: multiple long GSD phase sessions plus manual UAT loops.
- Notable: the most expensive work was not isolated implementation; it was deployment, UAT feedback, and cross-phase wiring reconciliation.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | multiple | 5 | Established discuss-plan-execute-verify loop with real UAT before milestone closure |

### Cumulative Quality

| Milestone | Tests | Coverage | Notes |
|-----------|-------|----------|-------|
| v1.0 | `pnpm test`: 8 workspace tasks, 209 passing tests plus no-test package tasks | API, admin, mobile, TV, shared packages | Final closure also ran `pnpm typecheck` with 12 successful tasks |

### Top Lessons

1. Keep requirement truth, UAT truth, and implementation truth synchronized after each phase.
2. Treat local deployment ergonomics as part of the product when the app spans API, TV, admin, and mobile clients.
3. Test media workflows with generated deterministic content before involving real songs or providers.
