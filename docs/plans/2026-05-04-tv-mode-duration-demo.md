# TV Mode, Time, and Demo Songs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make TV playback state visibly clearer by showing vocal mode and `mm:ss / mm:ss` timing, keep the mobile controller readable, and seed two distinct 60s demo songs for easier verification.

**Architecture:** Extend the playback target contract with duration metadata from the asset layer so the TV screen can render elapsed and total time without inventing state. Keep the mobile controller change presentation-only by making the current mode explicit. Update the demo seeding script to generate two different imports with distinct media characteristics so the queue is easier to reason about during manual testing.

**Tech Stack:** TypeScript, React, Vite, ffmpeg, Vitest.

---

### Task 1: Add duration metadata to the playback target

**Files:**
- Modify: `packages/player-contracts/src/index.ts`
- Modify: `apps/api/src/modules/playback/build-playback-target.ts`
- Modify: `apps/api/src/modules/playback/build-switch-target.ts` if needed for parity
- Modify: `apps/api/src/test/build-playback-target.test.ts`
- Modify: `apps/api/src/test/build-switch-target.test.ts` if types require it

**Step 1: Write the failing test**
- Add an assertion that `PlaybackTarget` includes `durationMs` and that `buildPlaybackTarget()` returns it from the asset.

**Step 2: Run test to verify it fails**
- Run: `pnpm --dir apps/api test -- src/test/build-playback-target.test.ts`
- Expected: type or assertion failure until the contract and builder are updated.

**Step 3: Write minimal implementation**
- Thread `asset.durationMs` into the playback target object.

**Step 4: Run test to verify it passes**
- Run: `pnpm --dir apps/api test -- src/test/build-playback-target.test.ts`

**Step 5: Commit**
- Not required for this session.

### Task 2: Render vocal mode and `mm:ss / mm:ss` on the TV screen

**Files:**
- Modify: `apps/tv-player/src/screens/PlayingScreen.tsx`
- Modify: `apps/tv-player/src/test/active-playback-controller.test.tsx` if helper types change
- Add or modify: a TV screen test covering the new time text

**Step 1: Write the failing test**
- Add a screen-level test that verifies the TV screen shows the current vocal mode and a `00:12 / 03:00`-style time string.

**Step 2: Run test to verify it fails**
- Run: `pnpm --dir apps/tv-player test`

**Step 3: Write minimal implementation**
- Compute elapsed time from `resumePositionMs` and derive total time from `durationMs`.
- Present the label as a restrained status row, not a progress bar.

**Step 4: Run test to verify it passes**
- Run: `pnpm --dir apps/tv-player test`

### Task 3: Make the mobile controller show the active vocal mode more clearly

**Files:**
- Modify: `apps/mobile-controller/src/App.tsx`
- Modify: `apps/mobile-controller/src/App.css`
- Modify: `apps/mobile-controller/src/test/controller.test.tsx`

**Step 1: Write the failing test**
- Add an assertion that the current mode is displayed with an explicit label such as `当前模式`.

**Step 2: Run test to verify it fails**
- Run: `pnpm --dir apps/mobile-controller test`

**Step 3: Write minimal implementation**
- Replace the bare mode token with a clearer label and visual treatment.

**Step 4: Run test to verify it passes**
- Run: `pnpm --dir apps/mobile-controller test`

### Task 4: Seed two distinct 60s demo songs

**Files:**
- Modify: `scripts/seed-demo-song.mjs`
- Modify: `apps/api/src/test/seed-demo-song.test.ts`

**Step 1: Write the failing test**
- Update the seed test to expect two seeded songs with different titles and 60s duration files.

**Step 2: Run test to verify it fails**
- Run: `pnpm --dir apps/api test -- src/test/seed-demo-song.test.ts`

**Step 3: Write minimal implementation**
- Generate two imports with distinct metadata and media characteristics.
- Default duration should be 60_000 ms.

**Step 4: Run test to verify it passes**
- Run: `pnpm --dir apps/api test -- src/test/seed-demo-song.test.ts`

### Task 5: Full verification

**Files:**
- No new files

**Step 1: Run the focused test suites**
- Run: `pnpm --dir apps/api test -- src/test/build-playback-target.test.ts src/test/seed-demo-song.test.ts`
- Run: `pnpm --dir apps/tv-player test`
- Run: `pnpm --dir apps/mobile-controller test`

**Step 2: Run type checks**
- Run: `pnpm --dir apps/api typecheck`
- Run: `pnpm --dir apps/tv-player typecheck`
- Run: `pnpm --dir apps/mobile-controller typecheck`

