# Milestones

## v1.2 真实 MV 歌库 (Shipped: 2026-05-14)

**Phases completed:** 6 phases, 25 plans, 58 tasks

**Key accomplishments:**

- Real MV contract support now models one MKV/MPG/MPEG file as one dual-track asset with compatibility, MediaInfo provenance, track roles, and platform-neutral playback profile fields.
- Scanner and Admin review now support real MV files, same-stem covers, same-stem `song.json`, MediaInfo-first metadata, safe preview, conflict evidence, and explicit repair guidance.
- Formal admission now promotes one real MV candidate into one Song plus one dual-track-video Asset and writes a durable `song.json` with media, cover, codec, compatibility, and track-role facts.
- Mobile search, queueing, TV playback targets, and original/accompaniment switching now handle approved real MV songs with server-authored `selectedTrackRef` and runtime capability gates.
- Review-first policy, demo/local/online compatibility, Android boundary guards, and representative real/unsupported media regressions are covered.
- Phase 17 closed the milestone audit gap by adding aggregate Phase 12 verification and syncing requirements traceability.

---

## v1.1 Polish (Shipped: 2026-05-10)

**Phases completed:** 6 phases, 12 plans, 29 tasks

**Key accomplishments:**

- TV playback screens now have clearer Chinese states, first-play guidance, switch/recovery feedback, and stable `mm:ss / mm:ss` time display for couch-distance viewing.
- Admin, Mobile, and TV now share more consistent Chinese-first product copy, empty/error/loading states, button feedback, and visual verification coverage.
- Mobile visual checks now capture a paired controller state by default through pairing-token refresh, with test coverage and Chinese UAT instructions.
- Runtime orchestration was moved behind app-local hooks for Mobile, TV, Admin Rooms, Admin Import Workbench, and Admin Song Catalog where required by the audit.
- Phase-level verification, requirements traceability, and milestone audit evidence now close the v1.1 documentation and quality gates.
- `pnpm test`, `pnpm typecheck`, Admin tests/typecheck, visual helper tests, and key-link checks passed during milestone closeout.

---

## v1.0 MVP (Shipped: 2026-05-08)

**Phases completed:** 5 phases, 25 plans, 51 tasks

**Key accomplishments:**

- pnpm/Turborepo TypeScript workspace with shared KTV domain/protocol packages, Fastify API health shell, and Vite TV Player shell using player contracts
- Canonical KTV media schema with controlled asset streaming, server-authored playback targets, and verified switch-target construction
- Backend-authored TV playback loop with player binding, conflict-safe snapshots, rollback-safe vocal switching, reconnect recovery, and browser TV runtime screens
- PostgreSQL import staging contracts with Song.status propagation and safe joined candidate-file detail mapping
- Incremental local library scanning with ffprobe caching, candidate generation, and API-managed watcher/scheduled/manual scan lifecycle
- Admin import review API with destructive action confirmation, strict pair admission, conflict handling, and repair-aware promotion
- Imports-first React admin workbench with DOM-tested candidate review, metadata editing, confirmations, and conflict resolution
- Formal catalog admin API with strict resource revalidation and /songs song.json consistency checks
- Admin Songs workspace for formal catalog browsing, metadata editing, resource maintenance, and strict revalidation review
- Phase 3 persistence and shared contracts for QR pairing, control-session restore, and mobile room control snapshots.
- Phase 3 pairing token and control-session infrastructure for QR entry, restore, and admin token rotation.
- Queue removal now has explicit undo metadata, and the session-engine/repository layer can drive authoritative room mutations.
- Chinese-first catalog search contracts, normalization helpers, ranking buckets, and PostgreSQL search columns/indexes for later room-scoped search.
- Room-scoped formal song search with artist pinyin backfill, queue-aware local results, D-12 version recommendations, and disabled online placeholder.
- Mobile Chinese search flow with debounced local results, inline version selection, duplicate confirmation, and assetId-validated queue commands.
- Local-first song search now surfaces online supplement candidates, persists candidate tasks, and lets mobile users request supplementation explicitly without auto-queueing playback.
- Online candidate lifecycle, task-scoped repair actions, ready cached queue admission, and skip-first failed playback recovery
- Admin Rooms recovery console with server-side recent playback events, online task diagnostics, and task-scoped repair actions
- createServer now exposes controlled online candidates, persists supplement tasks, and advances selected/retried tasks through cache-worker verification without auto-enqueueing playback.
- Mobile search now proves and renders local results before online supplement candidates when both result types exist.

---
