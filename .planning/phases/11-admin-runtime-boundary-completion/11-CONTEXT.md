# Phase 11 Context: Admin Runtime Boundary Completion

## Trigger

Created from `.planning/v1.1-MILESTONE-AUDIT.md`.

## Gap Scope

Phase 8 extracted Admin Rooms, Mobile controller, and TV playback runtime boundaries. The audit found that Admin Import and Songs still carry notable query/mutation orchestration in page components:

- `apps/admin/src/imports/ImportWorkbench.tsx`
- `apps/admin/src/songs/SongCatalogView.tsx`

## Requirements

- QUAL-01

## Expected Outcome

- Import Workbench runtime behavior moves behind a focused hook or runtime module.
- Song Catalog runtime behavior moves behind a focused hook or runtime module.
- Existing Chinese UI copy, layout, busy states, and error behavior remain unchanged.
- Admin tests and typecheck continue to pass.

## Non-Goals

- Do not change catalog/import product behavior.
- Do not add a new shared state framework.
- Do not refactor unrelated Admin views.
