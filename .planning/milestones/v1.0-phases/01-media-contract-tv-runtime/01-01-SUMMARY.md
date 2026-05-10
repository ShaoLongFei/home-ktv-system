---
phase: 01-media-contract-tv-runtime
plan: 01
subsystem: foundation
tags: [pnpm, turborepo, typescript, fastify, react, vite, shared-contracts]
requires: []
provides:
  - Runnable pnpm workspace with app and package boundaries
  - Shared domain, protocol, session-engine, and player-contract package entry points
  - Fastify API shell and Vite TV Player shell compiled against shared contracts
affects: [phase-01, phase-02, phase-03, api, tv-player, session-engine]
tech-stack:
  added: [pnpm, turbo, typescript, fastify, react, react-dom, vite, "@vitejs/plugin-react", tsx]
  patterns:
    - Workspace packages publish typed ESM entry points from dist
    - API and TV runtime import contracts from shared packages instead of redefining shapes
key-files:
  created:
    - package.json
    - pnpm-workspace.yaml
    - turbo.json
    - tsconfig.base.json
    - .env.example
    - packages/domain/src/index.ts
    - packages/protocol/src/index.ts
    - packages/player-contracts/src/index.ts
    - packages/session-engine/src/index.ts
    - apps/api/src/server.ts
    - apps/api/src/routes/health.ts
    - apps/tv-player/src/App.tsx
  modified:
    - .planning/STATE.md
key-decisions:
  - "Use pnpm workspaces plus Turborepo as the repo task runner."
  - "Expose Phase 1 contract vocabulary through four concrete @home-ktv/* packages."
  - "Keep the session engine as a typed entry point in this plan, with behavior left to later runtime plans."
patterns-established:
  - "Shared packages compile to dist and expose ESM exports with TypeScript declarations."
  - "Runtime apps depend on @home-ktv contracts rather than local playback payload definitions."
requirements-completed: [LIBR-03]
duration: 12min
completed: 2026-04-28
---

# Phase 01 Plan 01: Workspace and Contract Shell Summary

**pnpm/Turborepo TypeScript workspace with shared KTV domain/protocol packages, Fastify API health shell, and Vite TV Player shell using player contracts**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-28T08:15:04Z
- **Completed:** 2026-04-28T08:27:23Z
- **Tasks:** 3
- **Files modified:** 30

## Accomplishments

- Created the root pnpm workspace and Turborepo scripts for `dev`, `build`, `typecheck`, `lint`, and `test`.
- Added `@home-ktv/domain`, `@home-ktv/protocol`, `@home-ktv/session-engine`, and `@home-ktv/player-contracts`.
- Bootstrapped `@home-ktv/api` and `@home-ktv/tv-player` so both compile against the shared contract packages.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold the pnpm workspace and root toolchain** - `5668625` (chore)
2. **Task 2: Create shared domain, protocol, session-engine, and player-contract packages** - `298b2de` (feat)
3. **Task 3: Bootstrap API and TV app shells against the shared contracts** - `468801a` (feat)

## Files Created/Modified

- `package.json` - Root private workspace metadata and scripts.
- `pnpm-workspace.yaml` - Workspace app/package globs plus approved `esbuild` build script for Vite tooling.
- `turbo.json` - Build, typecheck, lint, test, and dev task graph.
- `tsconfig.base.json` - Shared strict TypeScript options.
- `.env.example` - Required Phase 1 env keys for database, media root, public base URL, and TV room slug.
- `packages/domain/src/index.ts` - `Song`, `Asset`, `Room`, `QueueEntry`, `PlaybackSession`, `DeviceSession`, `PlaybackEvent`, `VocalMode`, `LyricMode`, `AssetStatus`, `PlayerState`, `DeviceType`, `SwitchQualityStatus`, and `switchFamily`.
- `packages/protocol/src/index.ts` - Canonical player and room message names including `room.snapshot.updated`.
- `packages/player-contracts/src/index.ts` - `PlaybackTarget`, `SwitchTarget`, and `PlayerTelemetryEvent`.
- `packages/session-engine/src/index.ts` - Typed session engine state, command, reducer, and handler entry points.
- `apps/api/src/server.ts` - Fastify server using shared domain/protocol contracts.
- `apps/api/src/routes/health.ts` - `GET /health` returning room-aware metadata.
- `apps/tv-player/src/App.tsx` - TV shell states `booting`, `idle`, `playing`, and `conflict`, importing `PlaybackTarget`.

## Verification

- `pnpm install` - passed; lockfile up to date across 7 workspace projects.
- `pnpm typecheck` - passed; Turborepo ran 9 successful tasks across 6 packages.
- `pnpm --filter @home-ktv/api build` - passed.
- `pnpm --filter @home-ktv/tv-player build` - passed; Vite produced `dist/index.html` and bundled assets.
- API smoke check - passed; `GET /health` returned HTTP 200 with `roomSlug: "living-room"` and `room.snapshot.updated`.

## Decisions Made

- Used exact package names from the plan: `@home-ktv/domain`, `@home-ktv/protocol`, `@home-ktv/session-engine`, `@home-ktv/player-contracts`, `@home-ktv/api`, and `@home-ktv/tv-player`.
- Kept the TV app browser-first, but structured it around `PlaybackTarget` so later Android TV shell work can reuse the same runtime contract.
- Kept session-engine behavior minimal because this plan only establishes the typed entry point; later plans own reducer behavior and room state transitions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing pnpm CLI**
- **Found during:** Task 1
- **Issue:** `pnpm` was not available in the shell, blocking the plan's required install/build commands.
- **Fix:** Installed `pnpm@10.33.2` globally with npm.
- **Files modified:** None in repo.
- **Verification:** `pnpm --version` returned `10.33.2`.
- **Committed in:** Not applicable; environment setup only.

**2. [Rule 3 - Blocking] Added generated-output ignores**
- **Found during:** Task 1
- **Issue:** `pnpm install` created `node_modules/`, which would remain untracked without a root ignore file.
- **Fix:** Added `.gitignore` for `node_modules/`, `dist/`, `coverage/`, `.turbo/`, and local env files.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` no longer showed generated install/build output.
- **Committed in:** `5668625`

**3. [Rule 3 - Blocking] Added Vite HTML entry**
- **Found during:** Task 3
- **Issue:** Vite requires `index.html` as the application entry even though the plan's file list only named TS/TSX files.
- **Fix:** Added `apps/tv-player/index.html`.
- **Files modified:** `apps/tv-player/index.html`
- **Verification:** `pnpm --filter @home-ktv/tv-player build` passed.
- **Committed in:** `468801a`

**4. [Rule 3 - Blocking] Approved esbuild install script for Vite**
- **Found during:** Task 3
- **Issue:** pnpm blocked `esbuild` postinstall until explicitly approved, which can break Vite builds on clean installs.
- **Fix:** Ran `pnpm approve-builds --all`, recording `allowBuilds.esbuild` in `pnpm-workspace.yaml`.
- **Files modified:** `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- **Verification:** Subsequent `pnpm install` completed without ignored-build warnings.
- **Committed in:** `468801a`

**5. [Rule 1 - Bug] Fixed TV shell type narrowing**
- **Found during:** Task 3 verification
- **Issue:** A constant `null` playback target made TypeScript narrow the `playing` branch to `never`.
- **Fix:** Moved target reading behind a typed function so the shell can compile before runtime data is wired.
- **Files modified:** `apps/tv-player/src/App.tsx`
- **Verification:** `pnpm --filter @home-ktv/tv-player build` passed.
- **Committed in:** `468801a`

---

**Total deviations:** 5 auto-fixed (1 bug, 4 blocking)
**Impact on plan:** All fixes were needed for the scaffold to install, build, and remain clean. No product scope was added.

## Known Stubs

- `packages/session-engine/src/index.ts` - `reduceSessionEngine` and `handleTelemetry` currently return the input state. This is intentional for Plan 01-01 because later session/runtime plans fill reducer behavior.
- `apps/tv-player/src/App.tsx` - `readInitialPlaybackTarget()` returns `null`. This is intentional for the initial TV shell; later plans wire server-authored playback targets.

## Issues Encountered

- Registry downloads produced temporary low-speed warnings during dependency installation; install completed successfully and no persistent warning remained after the final install.
- The TV app type narrowing bug was resolved during Task 3 before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-02 can now add schema/storage and resource access against stable `Song`/`Asset`/`Room`/`PlaybackSession` contracts. Plan 01-03 can wire the TV runtime around `PlaybackTarget`, `SwitchTarget`, and telemetry events without inventing new payload names.

## Self-Check: PASSED

- Key created files exist.
- Task commits found: `5668625`, `298b2de`, `468801a`.
- No missing files or commits detected.

---
*Phase: 01-media-contract-tv-runtime*
*Completed: 2026-04-28*
