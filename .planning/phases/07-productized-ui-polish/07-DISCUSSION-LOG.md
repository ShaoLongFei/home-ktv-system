# Phase 7: Productized UI Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08  
**Phase:** 07-productized-ui-polish  
**Areas discussed:** Chinese-first copy and terminology, state feedback model, Mobile layout and interactions, Admin layout and interactions, TV consistency scope, verification expectations

---

## Chinese-First Copy and Terminology

| Option | Description | Selected |
|--------|-------------|----------|
| Default Chinese with retained language switch | Keep Admin/Mobile language switch, make Chinese the tested/default product path, and align terminology across apps. | ✓ |
| Chinese-only simplification | Remove English switching to reduce copy maintenance. | |
| Full shared i18n package now | Create a cross-app i18n package before UI polish. | |

**User's choice:** Default Chinese with retained language switch.  
**Notes:** User previously explicitly requested all pages default to Chinese while keeping language switching. Full i18n boundary cleanup is deferred to Phase 8 unless a small shared glossary helper clearly reduces duplication.

---

## State Feedback Model

| Option | Description | Selected |
|--------|-------------|----------|
| Unified product feedback | Standardize empty/loading/error/success/disabled states with Chinese product copy and immediate visible updates. | ✓ |
| Minimal text-only fixes | Only translate obvious English labels and leave behavior/layout mostly unchanged. | |
| New toast system everywhere | Introduce a broad notification layer for all apps. | |

**User's choice:** Unified product feedback.  
**Notes:** Prior UAT found reload-dependent Admin task updates, Mobile online/offline confusion, and unclear online supplement behavior. Phase 7 should fix visible feedback without adding a heavy notification framework.

---

## Mobile Layout and Interactions

| Option | Description | Selected |
|--------|-------------|----------|
| Phone-first controller polish | Prioritize phone-width stability for current playback, search, queue, online supplement rows, dialogs, and buttons. | ✓ |
| Desktop-like dense controller | Increase information density across all widths. | |
| Visual redesign | Rebuild the mobile UI with a new look and layout system. | |

**User's choice:** Phone-first controller polish.  
**Notes:** Mobile is the primary control surface. The user has already reported text alignment/button issues and online supplement visibility issues, so this needs targeted layout and regression coverage.

---

## Admin Layout and Interactions

| Option | Description | Selected |
|--------|-------------|----------|
| Operational console polish | Keep the existing workbench/list-detail model and improve density, status labels, busy states, refresh feedback, and task/event readability. | ✓ |
| Consumer-style redesign | Make Admin more spacious and card-like. | |
| Backend-only diagnostics | Leave UI mostly raw and optimize API/debug data instead. | |

**User's choice:** Operational console polish.  
**Notes:** Admin should stay compact and useful for operations. Raw IDs and event names can remain as secondary diagnostics, but Chinese product labels should lead.

---

## TV Consistency Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Carry forward Phase 6, only align copy | Keep TV playback UI stable and only fix terminology/copy consistency or regressions. | ✓ |
| Rework TV again | Revisit TV playback layout and runtime behavior in Phase 7. | |
| Ignore TV in Phase 7 | Treat Phase 6 as complete and skip TV entirely. | |

**User's choice:** Carry forward Phase 6, only align copy.  
**Notes:** Phase 6 has already passed user UAT. Phase 7 should not churn the TV playback experience unless it finds a visible inconsistency.

---

## Verification Expectations

| Option | Description | Selected |
|--------|-------------|----------|
| Focused UI regression plus lightweight visual checks | Add tests for Chinese copy, language switching, clickability, states, and small/desktop viewport visual sanity. | ✓ |
| Unit tests only | Cover strings and handlers without browser/visual checks. | |
| Manual testing only | Rely on UAT without automated regression coverage. | |

**User's choice:** Focused UI regression plus lightweight visual checks.  
**Notes:** Phase 6 established a lightweight Chrome screenshot helper. Phase 7 should reuse that style where practical and provide Chinese UAT steps so the user can validate visible behavior directly.

---

## the agent's Discretion

- Exact Chinese wording, status chip styling, spacing, and small helper extraction are left to planning/implementation.
- The planner may decide whether a tiny shared glossary helper is worth adding now; larger i18n/module boundaries belong to Phase 8.
- The planner may choose the specific visual-check mechanism as long as it stays lightweight and verifies key Mobile/Admin/TV surfaces.

## Deferred Ideas

- Cross-app API client/state hook/i18n architecture hardening — Phase 8.
- Production deployment, backup/restore, real provider, multi-room, accounts, scoring, recording, Android TV shell, and audio DSP — future milestones.
