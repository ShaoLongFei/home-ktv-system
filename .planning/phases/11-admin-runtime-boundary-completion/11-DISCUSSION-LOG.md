# Phase 11: Admin Runtime Boundary Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 11-admin-runtime-boundary-completion
**Areas discussed:** Extraction shape, Page component boundary, Behavior preservation, Testing depth

---

## Extraction Shape

| Option | Description | Selected |
|--------|-------------|----------|
| One runtime hook per page | `useImportWorkbenchRuntime` and `useSongCatalogRuntime`; keeps the extraction app-local and feature-local. | yes |
| Hook plus separate runtime/service helper layer | Cleaner layering, but more files and more structure than this gap likely needs. | |
| Only pure helpers | Smaller change, but likely insufficient to close `QUAL-01` because query/mutation orchestration stays in pages. | |

**User's choice:** One runtime hook per page.
**Notes:** This continues the Phase 8 app-local hook pattern and avoids a new shared framework/package.

---

## Page Component Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Page consumes view model plus callbacks | Page components become render-focused and stop orchestrating TanStack Query/mutation directly. | yes |
| Page still receives query/mutation objects | More flexible but leaves boundary unclear. | |
| Mixed mode | Move list/selection state to hook but leave editor mutations in page. | |

**User's choice:** Page consumes view model plus callbacks.
**Notes:** The runtime hook should own query/mutation orchestration and expose render-ready state and actions.

---

## Behavior Preservation

| Option | Description | Selected |
|--------|-------------|----------|
| Strict preservation only | Do not alter any visible behavior beyond file structure. | |
| Allow small bug fixes | Preserve behavior by default, but fix obvious local bugs discovered during extraction when covered by tests. | yes |
| Allow light product polish | Permit small visible state feedback/copy changes if tested. | |

**User's choice:** Allow small bug fixes.
**Notes:** Small fixes must stay local to existing import/catalog behavior, be test-covered, and be recorded as deviations. Product changes remain out of scope.

---

## Testing Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Existing page tests plus lightweight runtime/helper tests | Keep UI tests as behavior locks and add focused tests for the extracted runtime boundary. | yes |
| Existing Admin UI tests only | Lower effort, but weaker evidence for `QUAL-01`. | |
| Heavy hook-level coverage | Stronger but likely too broad for this gap-closure phase. | |

**User's choice:** Existing page tests plus lightweight runtime/helper tests.
**Notes:** Runtime/helper tests should prove the boundary without turning Phase 11 into a large test rewrite.

---

## the agent's Discretion

- Exact hook return type names, helper names, and file naming style.
- Whether small pure helpers such as cache/selection/formatting utilities remain in page files or move beside runtime hooks.
- Minimal runtime/helper test scope needed to prove the new boundary.

## Deferred Ideas

- Shared web-client utilities package.
- Broad Admin redesign or new import/catalog workflows.
- Runtime-boundary work outside the audited Import Workbench and Song Catalog pages.
