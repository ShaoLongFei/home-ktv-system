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

## Milestone: v1.2 — 真实 MV 歌库

**Shipped:** 2026-05-14
**Phases:** 6 | **Plans:** 25 | **Tasks:** 58

### What Was Built

- Real MV contracts now model one MKV/MPG/MPEG file as one dual-track asset with MediaInfo provenance, compatibility reasons, track roles, and platform-neutral playback profiles.
- Scanner and Admin review now handle real MV media, same-stem covers, same-stem `song.json`, MediaInfo-first metadata, filename fallback, conflict evidence, safe cover preview, and repair guidance.
- Formal admission now promotes one reviewed real MV candidate into one Song plus one dual-track-video Asset and writes a durable real-MV `song.json`.
- Mobile search, queueing, TV playback targets, and original/accompaniment switching now work for approved real MV songs behind server-authored track intent and TV runtime capability gates.
- Review-first policy, inert auto-admit reservation, demo/local/online compatibility, local media hardening, and Android boundary guards are covered by tests and archive evidence.

### What Worked

- Keeping Android TV as a future boundary let v1.2 focus on durable contracts, browser TV risk evidence, and existing product flow integration.
- Treating unsupported media as visible review/preprocess states avoided silently hiding real user files while keeping queueing safe.
- The one-file / one-asset model fit the user's media organization and avoided splitting original/accompaniment into separate catalog identities.
- Phase 17 made the audit gap explicit and cheap to close instead of mixing traceability fixes into product work.

### What Was Inefficient

- Phase 12 implementation had enough plan summaries but lacked a single aggregate verification file, which delayed milestone archive until Phase 17.
- The full external KTV index work landed adjacent to v1.2 but is still a separate read-path problem, so it must not be mistaken for product runtime integration.
- Browser support for real MKV/MPG playback remains environment-dependent, so tests need to keep distinguishing media contract correctness from actual codec/runtime availability.

### Patterns Established

- Preserve raw media facts as review evidence, but expose normalized `MediaInfoSummary` and provenance through product contracts.
- Use TrackRef-based audio-role mapping rather than relying on implicit stream indexes.
- Commit real-MV vocal-mode changes only after TV telemetry confirms local audio-track switching.
- Keep future platform work as source-guarded contract boundaries until implementation genuinely starts.

### Key Lessons

1. A phase with multiple summaries still needs an aggregate `VERIFICATION.md` when milestone audit expects one phase-level proof point.
2. Real media support must separate catalog validity, scan/review validity, browser playback support, and future native playback support.
3. For large local media libraries, an external index can be valuable before it becomes the product read path, but the boundary must be explicit.
4. Review-first admission is the right default while media parsing and track-role inference are still being validated against real-world files.

### Cost Observations

- Model mix: mostly implementation, verification, and audit closeout sessions.
- Sessions: several phase execution sessions plus UAT-style debugging and milestone audit closure.
- Notable: the most expensive area was cross-surface media behavior, especially distinguishing current browser limitations from product contract gaps.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | multiple | 5 | Established discuss-plan-execute-verify loop with real UAT before milestone closure |
| v1.1 | multiple | 6 | Added audit-driven gap-closure phases and phase-level verification before archive |
| v1.2 | multiple | 6 | Added real media contract/admission/playback hardening and explicit traceability closure before archive |

### Cumulative Quality

| Milestone | Tests | Coverage | Notes |
|-----------|-------|----------|-------|
| v1.0 | `pnpm test`: 8 workspace tasks, 209 passing tests plus no-test package tasks | API, admin, mobile, TV, shared packages | Final closure also ran `pnpm typecheck` with 12 successful tasks |
| v1.1 | `pnpm test`: 8 workspace tasks; `pnpm typecheck`: 12 successful tasks | TV polish, Admin/Mobile UI, paired visual helper, runtime hooks, traceability | Final closure also ran Admin tests/typecheck, `ui:visual-check:test`, and key-link checks |
| v1.2 | targeted API/TV/domain/player-contract tests plus package typechecks | Real MV contracts, scan/review/admission, playback target, TV capability, hardening | Final closure ran Phase 12/17 verification checks and refreshed milestone audit to passed |

### Top Lessons

1. Keep requirement truth, UAT truth, and implementation truth synchronized after each phase.
2. Treat local deployment ergonomics as part of the product when the app spans API, TV, admin, and mobile clients.
3. Test media workflows with generated deterministic content before involving real songs or providers.
4. Refresh milestone audit evidence after gap-closure phases before attempting archive.
5. Keep external index/read-model work visibly separate from the product runtime path until the UI/API actually consume it.
