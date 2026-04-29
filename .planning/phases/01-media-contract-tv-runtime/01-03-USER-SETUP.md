---
status: incomplete
phase: 01-media-contract-tv-runtime
plan: 03
created: 2026-04-28
updated: 2026-04-28
---

# Phase 01 Plan 03 User Setup

## Required Environment

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection for rooms, playback sessions, queue entries, assets, devices, and events | `postgres://ktv:ktv@localhost:5432/home_ktv` |
| `MEDIA_ROOT` | NAS/local media root used by the controlled `/media/:assetId` gateway | `/Volumes/KTVMedia` |
| `PUBLIC_BASE_URL` | URL encoded into TV QR payloads and controlled media URLs | `http://ktv.local:3000` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated TV web origins allowed to call the API from Chrome | `http://192.168.1.20:5173` |

## Media Fixture

- Place at least one manually curated and verified original/instrumental pair under `MEDIA_ROOT`.
- Both assets must represent the same song/version and share a `switch_family`.
- Both assets must be `ready` and `switch_quality_status = verified` before testing playback-time vocal switching.

## TV Target

- Open the TV player in desktop Chrome/Chromium on the mini PC connected to the TV.
- Use the Phase 1 target room slug `living-room`.
- Keep a second browser/device available only for the conflict-state check.

## Verification Commands

```bash
pnpm typecheck
pnpm --filter @home-ktv/api test -- player-runtime-contract
pnpm --filter @home-ktv/tv-player build
pnpm --filter @home-ktv/tv-player test -- switch-runtime reconnect-recovery
```
