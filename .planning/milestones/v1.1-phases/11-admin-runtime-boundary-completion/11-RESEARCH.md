# Phase 11 Research: Admin Runtime Boundary Completion

## RESEARCH COMPLETE

Phase 11 is a narrow gap-closure refactor. The relevant code is already in the repo and the correct implementation direction is to reuse the Phase 8 app-local runtime-hook pattern rather than introduce a new framework, package, or product behavior.

## Phase Scope

Phase 11 closes `QUAL-01` for the remaining Admin surfaces:

- `apps/admin/src/imports/ImportWorkbench.tsx`
- `apps/admin/src/songs/SongCatalogView.tsx`

The phase should preserve current Admin behavior and move query/mutation orchestration behind feature-local hooks.

## Existing Pattern to Reuse

`apps/admin/src/rooms/use-room-status.ts` is the strongest local precedent:

- The hook owns runtime state, side effects, API calls, busy state, and errors.
- `RoomStatusView.tsx` renders returned state and callbacks.
- The hook stays app-local and feature-local.

Phase 11 should mirror that shape for Import and Songs without creating a shared package.

## Import Workbench Findings

`apps/admin/src/imports/ImportWorkbench.tsx` currently owns:

- Candidate status filters.
- Four `useQueries` calls for candidate queues.
- Candidate grouping by status.
- Selected candidate ID and first-candidate repair.
- Detail query for selected candidate.
- Scan mutation and queue invalidation.
- Save/hold/approve/reject-delete/resolve-conflict mutations.
- Candidate cache update logic.
- Busy aggregation for editor actions.

Best planning target:

- Create `apps/admin/src/imports/use-import-workbench-runtime.ts`.
- Return render-ready values: `statusFilters`, `activeStatus`, `setActiveStatus`, `selectedCandidateId`, `setSelectedCandidateId`, `candidatesByStatus`, `queueReady`, `queueHasError`, `selectedDetail`, `isBusy`, `isScanning`, and action callbacks.
- Keep `CandidateEditor` unchanged unless a minimal adapter is needed.
- Keep `CandidateGroup` in the page unless implementation shows it is simpler to move.

## Song Catalog Findings

`apps/admin/src/songs/SongCatalogView.tsx` currently owns:

- Status and language filter state.
- Catalog query.
- Selected song ID and first-song repair.
- Selected song derivation.
- Evaluation and validation state.
- Metadata/default-asset/asset/revalidate/validate mutations.
- Catalog song cache update logic.
- Busy aggregation.

Best planning target:

- Create `apps/admin/src/songs/use-song-catalog-runtime.ts`.
- Return render-ready values: `songStatusOptions`, `languageOptions`, `status`, `setStatus`, `language`, `setLanguage`, `songs`, `selectedSong`, `selectedSongId`, `setSelectedSongId`, `evaluation`, `validation`, `queryIsLoading`, `queryIsError`, `isBusy`, and action callbacks.
- Keep `SongDetailEditor`, `SongResourceSummary`, `AssetSummary`, and `EmptySongDetail` behavior stable.

## Test Strategy

Use existing Admin UI tests as behavior locks:

- `apps/admin/src/test/import-workbench.test.tsx`
- `apps/admin/src/test/song-catalog.test.tsx`

Add lightweight runtime tests for extracted hook/helper behavior:

- `apps/admin/src/test/import-workbench-runtime.test.tsx`
- `apps/admin/src/test/song-catalog-runtime.test.tsx`

The runtime tests should not duplicate every UI flow. They should prove the new boundary owns selection repair, cache/mutation side effects, and view-model state.

## Risks and Mitigations

- **Risk:** Hook tests become too heavy because TanStack Query needs a provider.
  - **Mitigation:** Use `renderHook` from `@testing-library/react` and a local `QueryClientProvider` wrapper with retries disabled.
- **Risk:** Refactor changes visible Admin behavior.
  - **Mitigation:** Keep existing UI tests intact and run `pnpm -F @home-ktv/admin test` after each surface.
- **Risk:** Both parallel plans touch shared files.
  - **Mitigation:** Keep Import and Songs write sets disjoint; avoid changing `apps/admin/src/api/client.ts` in the Import plan unless the executor proves it is necessary.

## Recommended Plan Split

1. Import Workbench runtime hook and tests.
2. Song Catalog runtime hook and tests.
3. Final Admin quality gate and Phase 11 UAT/evidence.

