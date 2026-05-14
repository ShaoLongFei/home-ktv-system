# Project Research Summary

**Project:** 家庭包厢式 KTV 系统  
**Domain:** v1.3 真实场景接入、部署和验证  
**Researched:** 2026-05-14  
**Confidence:** High

## Executive Summary

v1.3 should connect the already-built full KTV index and NAS media library to the product runtime. The safest architecture is a hybrid path: search reads `ktv_*` directly, but queueing an indexed result first promotes that selected asset into the existing canonical `songs/assets` tables, then reuses the existing queue, playback target, TV, room snapshot, and telemetry flows.

This milestone should also make deployment and validation repeatable. The API must prove that PostgreSQL is reachable, active indexed assets exist, NAS paths can be mapped and read, services start with consistent environment variables, and a real user can search, queue, play, skip, and recover using actual library songs.

## Stack Additions

- KTV index read repository.
- Idempotent indexed-asset-to-canonical-catalog sync service.
- Media path resolver and preflight checks for NAS paths.
- Admin diagnostics for index status, latest run, counts, and path health.
- Real-mode deployment script/profile with per-service logs.
- Real-scene smoke checks and UAT guide.

## Table Stakes

- Mobile search finds real indexed songs.
- Search results show whether an item is already formal or comes from the real index.
- Queueing an indexed song creates/reuses canonical Song/Asset and then uses the existing queue command path.
- TV receives existing PlaybackTarget payloads for promoted real assets.
- Unreadable or unsupported real files are disabled or fail with clear guidance.
- Deployment can be started and debugged with one documented command path.
- User can run a concrete real-scene verification checklist.

## Recommended Roadmap Shape

1. KTV index read model and media path preflight.
2. Mobile search and queue-time catalog sync.
3. Real media streaming and playback target verification.
4. Deployment, diagnostics, and operator workflow.
5. Real-scene UAT hardening and milestone verification.

## Out Of Scope

- Android TV native app.
- Mandatory transcoding/remuxing.
- Bulk syncing every indexed row into canonical catalog upfront.
- Multi-room library partitioning.
- Online provider acquisition or hot-song ranking.

## Sources

- `.planning/PROJECT.md`
- `.planning/MILESTONES.md`
- `docs/KTV-FULL-INDEX.md`
- `docs/KTV-FULL-INDEX-INTEGRATION.md`
- `apps/api/src/modules/ingest/ktv-full-index.ts`
- `apps/api/src/routes/song-search.ts`
- `apps/api/src/modules/catalog/repositories/song-repository.ts`
- `apps/api/src/modules/catalog/repositories/asset-repository.ts`

---
*Research completed: 2026-05-14*
*Ready for requirements: yes*
