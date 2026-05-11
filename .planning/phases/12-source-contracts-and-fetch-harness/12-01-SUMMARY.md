---
phase: 12-source-contracts-and-fetch-harness
plan: 01
subsystem: tooling
tags: [typescript, zod, cli, vitest, hot-songs]

requires:
  - phase: 12-source-contracts-and-fetch-harness
    provides: Phase 12 planning and source ingestion scope
provides:
  - Isolated `@home-ktv/hot-songs` workspace package for hot-song source tooling
  - Root `pnpm hot-songs:sources` command delegating to the package CLI
  - Source manifest, manual snapshot, source row, and source health Zod contracts
  - Public/manual source validation with auth header guardrails
affects: [SRC-01, SRC-02, SRC-04, phase-12]

tech-stack:
  added: [zod, tsx, vitest]
  patterns:
    - Isolated workspace package for source collection tooling
    - Runtime Zod contracts for source configuration and health records

key-files:
  created:
    - packages/hot-songs/package.json
    - packages/hot-songs/tsconfig.json
    - packages/hot-songs/vitest.config.ts
    - packages/hot-songs/src/cli.ts
    - packages/hot-songs/src/contracts.ts
    - packages/hot-songs/src/test/cli.test.ts
    - packages/hot-songs/src/test/contracts.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Hot-song source collection lives in a separate @home-ktv/hot-songs package so Phase 12 cannot mutate playback, catalog, OpenList, or UI runtime code."
  - "Source contracts explicitly distinguish KTV-first and support sources before later ranking work."
  - "Cookie, authorization, and private token headers are rejected at validation time to keep Phase 12 public/manual metadata-only."

patterns-established:
  - "CLI parser shell exports parseCollectSourcesArgs() for later runner wiring."
  - "Source health uses the exact status vocabulary succeeded, failed, stale, and skipped."
  - "Manual and public sources are validated through one SourceDefinitionSchema with kind-specific file/url requirements."

requirements-completed: [SRC-01, SRC-02, SRC-04]

duration: 18m
completed: 2026-05-10
---

# Phase 12 Plan 01: Package and Source Contracts Summary

**Hot-song source collection package with CLI parsing, manifest contracts, row contracts, health status contracts, and public-only auth guardrails**

## Performance

- **Duration:** 18m
- **Started:** 2026-05-10T05:48:00Z
- **Completed:** 2026-05-10T06:06:41Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `@home-ktv/hot-songs` as an isolated workspace package with TypeScript, Vitest, tsx, and a root `pnpm hot-songs:sources` command.
- Implemented `parseCollectSourcesArgs()` for single-run manifest/output/source/fixture arguments.
- Added Zod contracts for source definitions, source manifests, manual snapshots, source rows, source health statuses, and auth/private-header rejection.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add hot-songs package and CLI parser shell** - `486b23e` (feat)
2. **Task 2: Define source contracts and auth guardrails** - `5fd09af` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `package.json` - Added root scripts for hot-song source collection and tests.
- `pnpm-lock.yaml` - Recorded the hot-songs package dependencies.
- `packages/hot-songs/package.json` - Defines the isolated workspace package and scripts.
- `packages/hot-songs/tsconfig.json` - Package TypeScript configuration.
- `packages/hot-songs/vitest.config.ts` - Package Vitest configuration.
- `packages/hot-songs/src/cli.ts` - CLI argument parser shell.
- `packages/hot-songs/src/contracts.ts` - Source, snapshot, row, and health Zod contracts.
- `packages/hot-songs/src/test/cli.test.ts` - CLI parser coverage.
- `packages/hot-songs/src/test/contracts.test.ts` - Source contract and auth guardrail coverage.

## Decisions Made

- Kept Phase 12 tooling isolated from the existing KTV runtime and catalog packages.
- Used Zod for runtime validation because manifests and snapshots are file-based inputs.
- Rejected private auth headers in source definitions instead of relying on later adapter behavior.

## Verification

- `pnpm -F @home-ktv/hot-songs test -- src/test/cli.test.ts` - passed.
- `pnpm -F @home-ktv/hot-songs test -- src/test/contracts.test.ts` - passed.
- `pnpm -F @home-ktv/hot-songs typecheck` - passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-02 can load JSON manifests against the new contracts and add the manual CAVCA snapshot adapter without changing runtime or catalog behavior.

## Self-Check: PASSED

- Found package file: `packages/hot-songs/package.json`
- Found CLI parser: `packages/hot-songs/src/cli.ts`
- Found source contracts: `packages/hot-songs/src/contracts.ts`
- Found task commit: `486b23e`
- Found task commit: `5fd09af`

---
*Phase: 12-source-contracts-and-fetch-harness*
*Completed: 2026-05-10*
