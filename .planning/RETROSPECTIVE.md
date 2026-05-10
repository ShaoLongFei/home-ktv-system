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

## Milestone: v1.1 — Polish

**Shipped:** 2026-05-10
**Phases:** 6 | **Plans:** 12 | **Tasks:** 29

### What Was Built

- TV playback presentation now has clearer idle/loading/playing/error/conflict states, first-play guidance, switch/recovery feedback, and stable `mm:ss / mm:ss` time display.
- Admin, Mobile, and TV now have more consistent Chinese-first copy, empty/error/loading states, button feedback, and visual density.
- Mobile visual verification now resolves a fresh paired controller URL by default and keeps `MOBILE_VISUAL_URL` as a manual override.
- Runtime orchestration is clearer across Mobile, TV, Admin Rooms, Admin Import Workbench, and Admin Song Catalog through app-local hooks.
- Phase-level verification, requirements traceability, and milestone audit evidence were brought back into sync for archive.

### What Worked

- The gap-closure phases made the audit actionable: Phase 9 fixed verification/traceability, Phase 10 fixed paired Mobile screenshots, and Phase 11 closed Admin runtime boundaries.
- Keeping runtime hooks app-local avoided a premature shared state package while still reducing page-level orchestration.
- Visual helper tests plus help-output checks gave useful coverage without introducing a heavy browser test framework.
- Final closeout with `pnpm test`, `pnpm typecheck`, key-link checks, and explicit UAT evidence made archive status defensible.

### What Was Inefficient

- The first milestone audit was correctly strict but stale after gap closure, so completion required refreshing audit evidence before archive.
- Phase 10 was missing a phase-level verification report even though the implementation was complete, which created avoidable archive friction.
- Some auto-extracted milestone accomplishments were noisy and needed manual curation.

### Patterns Established

- Treat milestone audit gaps as first-class phases rather than ad hoc edits.
- Keep page components render-focused and move query/mutation/cache orchestration into feature-local runtime hooks.
- Prefer deterministic local visual helpers with clear service failure messages over broad browser automation.
- Archive milestone ROADMAP/REQUIREMENTS/AUDIT files and leave current planning docs small before starting the next milestone.

### Key Lessons

1. Every gap-closure phase should produce its own `VERIFICATION.md`; otherwise milestone archive will find documentation debt even when code is correct.
2. Milestone completion should refresh audit evidence after all gap phases, not reuse the earlier `gaps_found` audit.
3. Product polish phases still need structural tests and typed boundaries; UI improvement without architecture cleanup leaves audit debt behind.
4. Automated archive helpers are useful, but final milestone artifacts still need a human pass for naming, state consistency, and accomplishment quality.

### Cost Observations

- Model mix: mostly implementation and verification sessions with GSD executor/verifier style workflows.
- Sessions: several phase sessions plus audit and archive closeout.
- Notable: the highest-friction work was not UI implementation; it was keeping phase verification, requirements traceability, and milestone archive state consistent.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | multiple | 5 | Established discuss-plan-execute-verify loop with real UAT before milestone closure |
| v1.1 | multiple | 6 | Added audit-driven gap-closure phases and phase-level verification before archive |

### Cumulative Quality

| Milestone | Tests | Coverage | Notes |
|-----------|-------|----------|-------|
| v1.0 | `pnpm test`: 8 workspace tasks, 209 passing tests plus no-test package tasks | API, admin, mobile, TV, shared packages | Final closure also ran `pnpm typecheck` with 12 successful tasks |
| v1.1 | `pnpm test`: 8 workspace tasks; `pnpm typecheck`: 12 successful tasks | TV polish, Admin/Mobile UI, paired visual helper, runtime hooks, traceability | Final closure also ran Admin tests/typecheck, `ui:visual-check:test`, and key-link checks |

### Top Lessons

1. Keep requirement truth, UAT truth, and implementation truth synchronized after each phase.
2. Treat local deployment ergonomics as part of the product when the app spans API, TV, admin, and mobile clients.
3. Test media workflows with generated deterministic content before involving real songs or providers.
4. Refresh milestone audit evidence after gap-closure phases before attempting archive.
