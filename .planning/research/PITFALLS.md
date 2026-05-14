# Pitfalls Research: v1.3 Real-World Runtime Integration

**Project:** 家庭包厢式 KTV 系统  
**Milestone:** v1.3 真实场景接入、部署和验证  
**Researched:** 2026-05-14  

## Main Risks

### Mixing ID Spaces

If `queue_entries` starts storing `ktv_song_assets.id` directly, playback target construction, Admin room status, TV telemetry, and rollback paths will all need special cases. Prefer queue-time sync into canonical `songs/assets`.

### Path Reachability Drift

The database stores NAS paths such as `/mnt/nas/KTV歌曲/...`, but the API process may run on macOS, inside Docker, or on a server with a different mount path. Every deployment must validate mapping and file readability.

### Search Flooding

The real library has more than 34k active assets. Search must use normalized indexed fields, limits, ranking, and active-asset filters. Do not load all rows into memory.

### Duplicate Catalog Rows

Multiple queues of the same indexed asset should reuse the same canonical Song/Asset. Store a durable source link or deterministic external key so sync is idempotent.

### Browser Playback Assumptions

Finding a file and reading it does not prove the TV browser can decode it or switch audio tracks. UAT must separate path/stream success from actual media support.

### Deployment Hidden State

Manual exports across four terminals caused earlier test confusion. v1.3 should make real-mode env explicit and scriptable.

## Prevention

- Keep queue/playback canonical.
- Add KTV index source metadata before queueing.
- Add path preflight and Admin diagnostics before broad Mobile exposure.
- Use API tests for search/sync/queue and a real smoke script for deployment.
- Keep unsupported or unreadable indexed assets visible only with clear disabled states.

