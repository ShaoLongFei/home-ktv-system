# Architecture Research: v1.3 Real-World Runtime Integration

**Project:** 家庭包厢式 KTV 系统  
**Milestone:** v1.3 真实场景接入、部署和验证  
**Researched:** 2026-05-14  

## Existing Boundaries

- `ktv_*` tables are a full-library read model populated from NAS files.
- Product runtime currently reads canonical `songs/assets` for search, queue, playback targets, Admin catalog, and TV.
- Queue and playback code should stay centered on canonical IDs to avoid broad cross-module changes.

## Recommended Data Flow

1. KTV index repository queries active rows only: `ktv_song_assets.missing_at is null`.
2. Mobile search route returns a merged result set:
   - canonical formal songs from `songs/assets`
   - indexed real-library candidates from `ktv_*`
3. User queues a KTV-indexed version.
4. API validates the asset is still active and the mapped file path is readable.
5. Catalog sync service creates or reuses:
   - one canonical `songs` row
   - one canonical `assets` row linked to the indexed file path
   - source metadata connecting the canonical asset back to the KTV index row
6. Existing queue command enqueues the canonical `songId/assetId`.
7. Existing TV snapshot and playback target construction stream the canonical asset path through the current asset gateway.

## Key Components

- `KtvIndexRepository`: search, get asset by ID, get stats, get latest index run.
- `KtvCatalogSyncService`: idempotent conversion from indexed asset to canonical Song/Asset.
- `MediaPathResolver`: maps indexed NAS file paths to API-readable paths and reports unreadable files.
- `RealDeploymentPreflight`: validates DB, table counts, latest run, NAS path access, API health, and sample asset readability.
- `RealWorldUatChecklist`: documented and scripted verification path for the user.

## API Surface

Prefer extending existing user-facing routes before adding new concepts:

- `GET /rooms/:roomSlug/songs/search` includes indexed KTV results.
- `POST /rooms/:roomSlug/commands/add-queue-entry` accepts canonical IDs and, if needed, a controlled KTV-index selection token or source payload that resolves server-side.
- Admin can use new read-only diagnostics routes under `/admin/ktv-index/*`.

## Compatibility Boundary

v1.3 should guarantee that the selected file reaches TV as a valid playback target if the API can read it. It should not guarantee that every MKV/MPG codec plays in the browser. Browser playback failure remains a visible runtime/preprocess state.

## Build Order

1. Repository and path preflight.
2. Search integration and queue-time catalog sync.
3. Playback/streaming verification.
4. Real deployment script and Admin diagnostics.
5. Full real-scene UAT and hardening.

