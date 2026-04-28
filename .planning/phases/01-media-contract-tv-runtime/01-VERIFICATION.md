---
status: human_needed
phase: 01-media-contract-tv-runtime
verified_at: 2026-04-28T09:16:00Z
requirements: [LIBR-03, PLAY-01, PLAY-02, PLAY-03, PLAY-06, PLAY-07]
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md]
---

# Phase 01 Verification: Media Contract & TV Runtime

## Verdict

Automated verification passed, but Phase 1 still requires real TV-path UAT before it should be marked complete.

## Automated Checks

| Check | Result | Evidence |
|-------|--------|----------|
| Workspace typecheck | passed | `pnpm typecheck` ran 9 successful Turborepo tasks |
| API player runtime tests | passed | `pnpm --filter @home-ktv/api test -- player-runtime-contract` passed 3 files / 9 tests |
| API production build | passed | `pnpm --filter @home-ktv/api build` completed |
| TV production build | passed | `pnpm --filter @home-ktv/tv-player build` completed and Vite emitted a production bundle |
| TV switch/recovery tests | passed | `pnpm --filter @home-ktv/tv-player test -- switch-runtime reconnect-recovery` passed 2 files / 5 tests |
| Plan key files | passed | `player-client.ts`, `switch-controller.ts`, and `ConflictScreen.tsx` exist |

## Must-Have Coverage

| Must-have | Status | Evidence |
|-----------|--------|----------|
| `living-room` TV player bootstrap, snapshots, and telemetry | automated-pass | `apps/api/src/routes/player.ts`, `apps/api/src/routes/room-snapshots.ts`, `apps/api/src/test/player-runtime-contract.test.ts` |
| TV UI shows idle QR, playing corner QR, current/next/mode, and conflict messaging | automated-pass | `IdleScreen.tsx`, `PlayingScreen.tsx`, `ConflictScreen.tsx`, `PlaybackStatusBanner.tsx` build successfully |
| In-song switching uses standby playback and rollback | automated-pass | `switch-controller.ts`, `video-pool.ts`, `switch-runtime.test.tsx` |
| Second TV player sees conflict instead of takeover | automated-pass | `conflict-service.ts`, `ConflictScreen.tsx`, `player-runtime-contract.test.ts`, `switch-runtime.test.tsx` |
| Reload/reconnect resumes or restarts with notice | automated-pass | `apply-reconnect-recovery.ts`, `recovery-controller.ts`, `reconnect-recovery.test.tsx` |
| Real TV browser/codec/autoplay/switch budget | human-needed | Requires desktop Chrome/Chromium on the mini PC connected to the TV |

## Human Verification Required

1. Idle screen shows a large QR on the real TV path.
2. Playing screen shows a small corner QR, current song, next song placeholder, and current vocal mode.
3. Switching between a verified original/instrumental pair stays near prior progress on desktop Chrome/Chromium.
4. Forced switch failure rolls back to the prior mode with productized messaging.
5. Refresh/reconnect either resumes near the prior point or clearly says it restarted the same song from the beginning.
6. A second TV player shows the explicit conflict screen and does not take over.

## Gaps

None found in automated verification. Real TV UAT remains open in `01-HUMAN-UAT.md`.
