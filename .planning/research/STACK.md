# Stack Research: v1.3 Real-World Runtime Integration

**Project:** 家庭包厢式 KTV 系统  
**Milestone:** v1.3 真实场景接入、部署和验证  
**Researched:** 2026-05-14  

## Current Stack

- TypeScript monorepo with Fastify API, React Admin, React Mobile Controller, React TV Player, shared domain/protocol/player-contract packages.
- PostgreSQL is the durable store for formal catalog, queue, playback state, and the new `ktv_*` full-library index.
- Existing runtime queue and playback code expects canonical `songs` and `assets` records.
- Existing dev deployment uses `pnpm dev:local` with per-service logs.
- Real full-library index already exists in the local PostgreSQL container and points to NAS paths under `/mnt/nas/KTV歌曲`.

## Stack Additions For v1.3

- A read-only KTV index repository over `ktv_songs`, `ktv_artists`, `ktv_song_artists`, and `ktv_song_assets`.
- A catalog sync/admission service that can promote one indexed `ktv_song_assets` row into existing `songs` and `assets` tables idempotently.
- Runtime media path mapping and preflight checks so an indexed NAS path can be proven readable before queue/playback.
- Real-mode deployment script or `dev:local` profile that exports database, media-root, public URL, and optional index/NAS variables consistently.
- Real-world verification scripts that check database counts, path reachability, API health, search, queue, TV snapshot, and playback target construction.

## Recommended Approach

Use the existing formal runtime path for queue and playback. Search can read `ktv_*`, but the moment the user queues an indexed asset, the API should ensure a canonical `Song` plus `Asset` exists, then enqueue the canonical IDs.

This avoids introducing a second ID universe into `queue_entries`, `buildPlaybackTarget`, room snapshots, TV telemetry, switch rollback, and Admin room status.

## What Not To Add

- Do not build Android TV in v1.3.
- Do not make transcoding/remuxing mandatory for this milestone.
- Do not replace the existing formal catalog repositories wholesale.
- Do not assume `/mnt/nas/KTV歌曲` is readable from every deployment environment; verify and surface it.

## Verification Commands To Preserve

- `pnpm -F @home-ktv/api typecheck`
- targeted API tests around KTV index search, catalog sync, queue command, playback target, and path preflight
- `pnpm dev:local start` or a real-mode equivalent
- SQL checks against `ktv_song_assets where missing_at is null`

