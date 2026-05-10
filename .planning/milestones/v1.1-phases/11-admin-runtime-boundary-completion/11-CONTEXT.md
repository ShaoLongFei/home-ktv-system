# Phase 11: Admin Runtime Boundary Completion - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 closes the remaining `QUAL-01` structure gap by extracting Admin Import and Songs runtime orchestration out of page components.

This phase is a gap-closure/refactor phase. It delivers focused app-local runtime hooks for:

- `apps/admin/src/imports/ImportWorkbench.tsx`
- `apps/admin/src/songs/SongCatalogView.tsx`

The phase must preserve existing Admin product behavior, Chinese UI copy, layout, busy states, load/error states, selection behavior, mutation responses, and test expectations. It must not redesign Admin, introduce a new shared state framework, refactor unrelated Admin views, or expand catalog/import product capability.

</domain>

<decisions>
## Implementation Decisions

### Extraction Shape
- **D-01:** Extract one app-local runtime hook per page: `useImportWorkbenchRuntime()` for Import Workbench and `useSongCatalogRuntime()` for Song Catalog.
- **D-02:** Keep the hooks close to their current feature folders, e.g. `apps/admin/src/imports/use-import-workbench-runtime.ts` and `apps/admin/src/songs/use-song-catalog-runtime.ts`.
- **D-03:** Pure formatting/cache/selection helpers may be extracted beside the hook when it reduces page complexity, but the primary boundary should remain one focused runtime hook per page rather than a broad service layer.
- **D-04:** Do not introduce a new shared package, Zustand/Redux-style store, or cross-app runtime abstraction in Phase 11.

### Page Component Boundary
- **D-05:** `ImportWorkbench.tsx` and `SongCatalogView.tsx` should become render-focused shells that consume a render-ready view model plus action callbacks from their runtime hooks.
- **D-06:** Page components should not directly orchestrate TanStack Query queries/mutations, cache invalidation, selected item repair, or mutation success side effects after this phase.
- **D-07:** TanStack Query can remain the data-fetching tool inside the runtime hooks. The phase is about moving orchestration behind hooks, not replacing the data layer.
- **D-08:** Existing child editor components such as `CandidateEditor` and `SongDetailEditor` should keep their current product-facing contracts unless a small adapter prop is needed to connect the new runtime hook.

### Behavior Preservation and Small Bug Policy
- **D-09:** Preserve current visible behavior by default: Chinese copy, Admin layout, status filters, selected row behavior, busy/disabled buttons, load errors, detail empty states, confirmation dialogs, mutation endpoints, cache updates, and evaluation/validation display should remain the same.
- **D-10:** Small bug fixes are allowed when they are discovered during extraction and directly affect the existing import/catalog behavior. Examples: a stale selected item after cache update, missing query invalidation, or a mutation result not reflected without reload.
- **D-11:** Allowed small fixes must stay local, be covered by tests, and be documented as deviations in the Phase 11 summary.
- **D-12:** Product changes are not allowed under the small bug policy. Do not add new filters, new Admin panels, new import states, new catalog workflows, new copy strategy, or visual redesign.

### Testing Depth
- **D-13:** Preserve the existing Admin UI tests as behavior locks for Import Workbench and Song Catalog.
- **D-14:** Add lightweight runtime/helper tests for the extracted hooks/helpers where they prove selection, cache update, mutation side effect, loading/error, or view-model behavior better than page-only tests.
- **D-15:** Avoid excessive hook-test scaffolding. The runtime tests should target the newly extracted boundary, while existing `import-workbench.test.tsx` and `song-catalog.test.tsx` continue proving user-visible behavior.
- **D-16:** Final verification must include Admin tests and workspace typecheck. If the extracted boundary touches shared Admin API behavior, include targeted API-client or Admin integration tests as needed.

### the agent's Discretion
- Exact hook return type names, helper names, and file naming style are left to planning as long as the files stay app-local and feature-local.
- The planner may decide whether `CandidateGroup`, `probeSummary`, `durationSummary`, `cacheCandidate`, or `cacheSong` remain in the page file or move beside the runtime hook, based on what makes the render/runtime boundary clearest.
- The planner may decide the minimal set of runtime/helper tests needed to prove `QUAL-01` without making Phase 11 heavier than the audit gap requires.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Requirement
- `.planning/ROADMAP.md` — Phase 11 goal, dependencies, gap-closure statement, and success criteria.
- `.planning/REQUIREMENTS.md` — `QUAL-01` wording and traceability status.
- `.planning/PROJECT.md` — v1.1 quality goal, Admin role, current shipped behavior, and out-of-scope constraints.
- `.planning/v1.1-MILESTONE-AUDIT.md` — Audit gap that identifies `ImportWorkbench.tsx` and `SongCatalogView.tsx` as remaining Admin runtime boundary debt.

### Prior Runtime Boundary Decisions
- `.planning/phases/08-code-structure-hardening/08-CONTEXT.md` — App-local runtime hook direction, no shared package, page components render state while hooks own orchestration.
- `.planning/phases/08-code-structure-hardening/08-SUMMARY.md` — Established patterns from `useRoomStatus()`, Mobile runtime hook, and TV runtime hook.
- `.planning/phases/08-code-structure-hardening/08-VERIFICATION.md` — QUAL-01 remains deferred to Phase 11 while QUAL-02 through QUAL-04 are verified.
- `docs/plans/2026-05-09-phase-8-code-structure-hardening-design.md` — Boundary rules and alternatives rejected for Phase 8.
- `docs/plans/2026-05-09-phase-8-code-structure-hardening.md` — Existing implementation pattern for app-local runtime extraction and verification gates.

### Admin Architecture and Product Baseline
- `docs/KTV-ARCHITECTURE.md` §后台管理能力范围 — Admin is a lightweight operations/maintenance console.
- `docs/KTV-ARCHITECTURE.md` §后台的角色定位 — Admin is for system maintenance, not singing users.
- `docs/KTV-ARCHITECTURE.md` §第一版后台必须包含的能力 — Song library management, import review, online tasks, and room/player status.
- `docs/KTV-ARCHITECTURE.md` §后台与主用户端的关系 — Admin and controller share APIs where possible; Admin uses dedicated endpoints only where needed.
- `docs/KTV-ARCHITECTURE.md` §后台设计的关键取舍 — Admin should be few, hard, operational, and not a broad CMS.

### Current Admin Runtime Targets
- `apps/admin/src/imports/ImportWorkbench.tsx` — Current import candidate queries, selection repair, scan/save/hold/approve/reject/resolve mutations, and cache updates that need extraction.
- `apps/admin/src/songs/SongCatalogView.tsx` — Current catalog filters, selection repair, metadata/default-asset/asset/revalidate/validate mutations, evaluation/validation state, and cache updates that need extraction.
- `apps/admin/src/rooms/use-room-status.ts` — Existing Admin runtime hook pattern to use as local precedent.
- `apps/admin/src/rooms/RoomStatusView.tsx` — Example render-focused Admin page after Phase 8 extraction.
- `apps/admin/src/api/client.ts` — Admin API client functions already used by Import/Songs and room status.
- `apps/admin/src/imports/CandidateEditor.tsx` — Child editor contract and visible import behavior that must remain stable.
- `apps/admin/src/songs/SongDetailEditor.tsx` — Child editor contract and visible song/catalog behavior that must remain stable.

### Existing Tests
- `apps/admin/src/test/import-workbench.test.tsx` — Existing Import Workbench UI behavior, endpoints, busy state, load-error, and confirmation coverage.
- `apps/admin/src/test/song-catalog.test.tsx` — Existing Song Catalog UI behavior, filters, mutations, busy state, load-error, evaluation, and validation coverage.
- `apps/admin/src/test/room-status.test.tsx` — Existing pattern for Admin runtime behavior verification after hook extraction.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/admin/src/rooms/use-room-status.ts` already demonstrates the desired pattern: runtime hook owns initial load, refresh state, realtime/fallback logic, action execution, and error message state; `RoomStatusView.tsx` renders returned state and callbacks.
- `apps/admin/src/api/client.ts` already provides typed catalog API helpers for Song Catalog and lower-level `fetchAdmin()` for Import Workbench routes.
- `CandidateEditor` and `SongDetailEditor` already isolate large form/editing UI sections; Phase 11 should not collapse them into runtime hooks.
- Existing Admin Testing Library suites can remain the main behavior safety net while new focused runtime/helper tests prove the extracted boundary.

### Established Patterns
- Admin pages are React + TypeScript with TanStack Query for import/catalog data fetching.
- Current Import Workbench orchestration includes `useQueries`, `useQuery`, `useMutation`, query invalidation, cache updates, selected candidate repair, and busy aggregation directly in the page component.
- Current Song Catalog orchestration includes filters, selected song repair, mutations, evaluation/validation local state, cache updates, and busy aggregation directly in the page component.
- Phase 8 established that runtime extraction should be app-local and should preserve visible behavior; no shared package is justified for this gap.

### Integration Points
- Import runtime hook should connect to `/admin/import-candidates`, `/admin/imports/scan`, candidate detail/update/hold/approve/reject-delete/resolve-conflict routes through existing `fetchAdmin()` until typed API helpers are introduced by the planner.
- Song catalog runtime hook should connect through existing `fetchCatalogSongs`, `updateCatalogSong`, `updateCatalogDefaultAsset`, `updateCatalogAsset`, `revalidateCatalogSong`, and `validateCatalogSong`.
- Both runtime hooks should expose enough state for the existing page markup to remain nearly unchanged: active filters, selected entity/detail, grouped rows, loading/error flags, busy flags, mutation callbacks, and any evaluation/validation outputs.

</code_context>

<specifics>
## Specific Ideas

- The target shape should feel like the Phase 8 Admin Rooms extraction: `RoomStatusView` became a render-focused shell around `useRoomStatus()`.
- Import and Songs should remain operational-console surfaces: dense, Chinese-first, and behaviorally unchanged.
- The useful outcome is maintainability evidence for `QUAL-01`, not a visual redesign or catalog workflow enhancement.
- Small bug fixes are acceptable only when discovered during extraction and proven by tests; otherwise behavior should stay locked.

</specifics>

<deferred>
## Deferred Ideas

- A shared web-client utilities package remains deferred until duplication across Admin/Mobile/TV becomes more costly than package wiring.
- Broader Admin design changes, new import/catalog workflows, batch maintenance features, large-scale library operations, production deployment, and real online provider integration remain outside Phase 11.
- Full Admin runtime standardization for every future page is not part of Phase 11; this phase closes the audited Import/Songs gap only.

</deferred>

---

*Phase: 11-admin-runtime-boundary-completion*
*Context gathered: 2026-05-10*
