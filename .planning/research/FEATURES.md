# Feature Research: v1.3 Real-World Runtime Integration

**Project:** 家庭包厢式 KTV 系统  
**Milestone:** v1.3 真实场景接入、部署和验证  
**Researched:** 2026-05-14  

## Table Stakes

### Real Library Visibility

- Admin can see whether the full KTV index is connected, how many active assets exist, latest run status, and whether NAS paths are reachable.
- Mobile search can find songs from the real indexed library by title, artist, pinyin, initials, and category-sensitive version metadata.
- Search results distinguish already-formal catalog songs from indexed real-library songs.

### Real Queue And Playback

- User can queue a real indexed song from Mobile without manually importing it first.
- Queue command idempotently promotes the selected indexed asset into canonical `songs/assets`.
- Existing queue, skip, promote, delete, TV snapshot, playback target, and room status flows continue to work with promoted real songs.
- If the media path is unreadable or unsupported, the user sees a clear disabled or failed state instead of a broken queue.

### Deployment

- One documented real-mode deployment path starts API, Admin, TV, and Mobile with the right database URL, public URL, and media path mapping.
- Logs remain per-service and easy to tail.
- Startup/preflight output tells the user whether PostgreSQL, index tables, NAS mount, and sample media reads are healthy.

### Verification

- A repeatable UAT checklist proves search -> queue -> TV playback -> skip -> recovery against real indexed songs.
- A machine-readable smoke test verifies core API paths before manual TV testing.
- Verification explicitly separates index availability, NAS readability, browser playback support, and vocal switching support.

## Differentiators

- Just-in-time formal catalog sync keeps the large real library searchable without forcing a bulk import into runtime tables.
- Admin recovery views can explain whether failures come from DB index state, file path reachability, media compatibility, or browser runtime.
- Real-mode deployment can become the default operator experience once stable.

## Deferred

- Native Android TV player.
- Automatic transcoding/remuxing pipeline.
- Background full sync of all `ktv_*` songs into canonical `songs/assets`.
- Multi-room library partitioning.
- Recommendation/ranking from hot-song data.

