# Architecture Research

**Domain:** Home living-room KTV system
**Researched:** 2026-04-28
**Confidence:** MEDIUM

## Recommended Architecture

### System Overview

```text
+------------------------ Device / UX Layer -------------------------+
|  Mobile Controller   |   TV Player Runtime   |   Admin Repair UI  |
|  - search            |   - fullscreen video  |   - import review   |
|  - queue control     |   - current/next UI   |   - metadata fixes  |
|  - no playback auth  |   - no queue writes   |   - asset health     |
+----------------------- Control Plane ------------------------------+
| API + Realtime Gateway | Session Engine | Catalog/Search Read Model|
| - REST/WS              | - room truth   | - song/artist lookup     |
| - pairing              | - queue rules  | - aliases/pinyin         |
| - auth for devices     | - failover     | - dedupe/version merge   |
+------------------------ Media Plane --------------------------------+
| Media Pipeline Worker  | Asset Gateway / Static Media Serving       |
| - local scan           | - controlled asset URLs                    |
| - metadata probe       | - NAS + cache exposure to TV               |
| - online source lookup | - no provider logic on TV                  |
| - cache/download       | - stable playback contract                 |
+------------------------- Storage -----------------------------------+
| PostgreSQL | Redis | NAS Library | Online Cache | Playback Events   |
+--------------------------------------------------------------------+
```

The right shape for this project is a modular monolith with one API process, one worker process, two thin clients, and clear internal boundaries. Do not split into many networked microservices. The real complexity is not traffic volume; it is state consistency across queue control, playback, asset readiness, and fallback.

The architecture should be treated as two loops sharing one domain model:

1. Control loop: mobile command -> session engine -> realtime broadcast -> TV execution -> TV telemetry -> session engine.
2. Media loop: local scan or online lookup -> normalize metadata -> create ready asset -> expose controlled playback URL.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Mobile Controller | Search, queue actions, current state view, pairing join | API + Realtime Gateway only |
| TV Player Runtime | Render current song, preload next asset, emit playback telemetry, recover after reconnect | Realtime Gateway for state, Asset Gateway for media bytes |
| API + Realtime Gateway | Command ingress, query APIs, device pairing, websocket fanout, auth/session cookies/tokens | Mobile, TV, Session Engine, Catalog/Search |
| Session Engine | Single source of truth for room state, queue transitions, playback lifecycle, skip/fallback decisions, optimistic concurrency | API Gateway, Redis, PostgreSQL, Worker events |
| Catalog/Search Read Model | Unified Song/Artist/Alias search, version grouping, local and online result presentation | API Gateway, PostgreSQL, search indexes, Media Pipeline |
| Media Pipeline Worker | Local library scan, metadata extraction, import review, online candidate resolution, cache/download, asset verification | PostgreSQL, NAS, Online Cache, Session Engine via events |
| Asset Gateway | Stable static URLs for playable assets, access control, cache headers, range support | TV Player, NAS, Online Cache |
| Admin Repair UI | Resolve bad imports, merge duplicate songs, repair failed sources, inspect event history | API Gateway, Catalog/Search, Media Pipeline |

Boundary rule: the TV player never talks to online providers, never mutates queue state, and never decides what is next. The mobile controller never talks to the TV directly. Both are clients of the server-side session model.

## Recommended Project Structure

```text
apps/
  api/                  # REST + websocket gateway
  worker/               # scan, cache, verification, retry jobs
  tv-player/            # fullscreen playback client
  mobile-controller/    # phone-first control client
packages/
  domain/               # Song, Asset, QueueEntry, PlaybackSession models
  protocol/             # API schemas, websocket events, command types
  session-engine/       # reducer, command handlers, failover logic
  catalog/              # normalization, aliases, search queries, dedupe
  media-pipeline/       # scanners, probes, source adapters, cache logic
  player-contracts/     # player telemetry schema and manifest types
  shared/               # utilities, config, logging
infra/
  caddy/                # reverse proxy and static media routing
  compose/              # local deployment manifests
```

### Structure Rationale

- **`apps/api` + `apps/worker`:** separate runtime concerns without splitting the codebase into independent services too early.
- **`packages/domain` and `packages/protocol`:** prevent drift between mobile, TV, API, and worker by sharing the same canonical models and event contracts.
- **`packages/session-engine`:** isolates the highest-risk logic so it can be tested as a deterministic state machine.
- **`packages/catalog` and `packages/media-pipeline`:** keep search/read concerns separate from ingest/cache concerns.
- **`player-contracts`:** makes the TV player replaceable later, whether it stays a browser app or moves into a native shell.

## Architectural Patterns

### Pattern 1: Authoritative Session Engine

**What:** All queue and playback mutations go through a deterministic reducer with versioned room state.
**When to use:** Always. This is the core protection against queue drift and reconnect bugs.
**Trade-offs:** Slightly more ceremony than mutating Redis objects directly, but much easier to test and reason about.

**Example:**
```typescript
type RoomCommand =
  | { kind: "queue.add"; roomId: string; songId: string; assetId: string; expectedVersion: number }
  | { kind: "playback.failed"; roomId: string; queueEntryId: string; expectedVersion: number };

export async function handleRoomCommand(cmd: RoomCommand) {
  const room = await repo.loadRoomState(cmd.roomId);
  assertVersion(room.version, cmd.expectedVersion);

  const { nextRoom, events } = reduceRoom(room, cmd);

  await repo.saveRoomState(nextRoom, events);
  await realtime.broadcast(cmd.roomId, events);
}
```

### Pattern 2: Song / Asset / SourceRecord Separation

**What:** Users interact with a canonical `Song`; playback consumes a concrete `Asset`; provider and verification history live in `SourceRecord`.
**When to use:** Any time local and online media are mixed.
**Trade-offs:** More tables and joins, but it avoids binding queue state to unstable files or provider URLs.

**Example:**
```typescript
type Song = { id: string; title: string; artistId: string };
type Asset = {
  id: string;
  songId: string;
  sourceType: "local" | "online_cached";
  status: "ready" | "caching" | "failed";
  playbackUrl: string;
};
type SourceRecord = {
  assetId: string;
  provider: string;
  providerSongId: string;
  lastVerifiedAt?: string;
  failureCount: number;
};
```

### Pattern 3: Async Asset Readiness

**What:** Search can discover a song before a ready asset exists. The worker resolves, downloads, verifies, and promotes that asset to `ready`.
**When to use:** Online supplementation and large local library imports.
**Trade-offs:** Eventual consistency. The UI must show `resolving`, `caching`, or `ready` states instead of pretending everything is instantly playable.

**Example:**
```typescript
export async function requestPlayableAsset(songId: string) {
  const asset = await catalog.findBestReadyAsset(songId);
  if (asset) return asset;

  await jobs.enqueue("cache-online-asset", { songId });
  return { status: "pending" as const };
}
```

### Pattern 4: TV Pulls Media, Pushes Telemetry

**What:** The TV player receives session snapshots and manifests from the server, then fetches media directly from the asset gateway and reports `loading`, `playing`, `ended`, and `failed`.
**When to use:** Any browser-based or kiosk-style player where playback is device-local but control must stay centralized.
**Trade-offs:** Requires careful event correlation by `roomId`, `queueEntryId`, and `sessionVersion`.

**Example:**
```typescript
socket.on("session.snapshot", async (snapshot) => {
  if (snapshot.current?.asset?.status !== "ready") return;

  video.src = snapshot.current.asset.playbackUrl;
  await report("loading", snapshot);
});

video.addEventListener("playing", () => report("playing", currentSnapshot));
video.addEventListener("ended", () => report("ended", currentSnapshot));
video.addEventListener("error", () => report("failed", currentSnapshot));
```

## Data Flow

### Control Flow

```text
Mobile action
  -> HTTPS command
  -> API validation
  -> Session Engine transition
  -> persist room state + emit domain events
  -> websocket broadcast
  -> TV player preload/play
  -> TV telemetry back to API
  -> Session Engine confirms, retries, or failovers
  -> updated snapshot to mobile + TV
```

### Media Flow

```text
Local files / Online provider candidate
  -> Media Pipeline worker
  -> metadata probe + normalization
  -> Song / Asset / SourceRecord writes
  -> search read model update
  -> ready asset exposed by Asset Gateway
  -> TV fetches media bytes directly
```

### State Ownership

```text
PostgreSQL: durable catalog, queue history, source records, playback events
Redis: hot room state cache, fanout, heartbeats, worker coordination
NAS / online cache: media bytes only

Session Engine owns:
- room playback state
- queue ordering
- current / next selection
- skip / retry / fallback decisions

TV Player owns:
- local media element state
- buffering / decode status
- telemetry emission

Catalog/Search owns:
- discovery and ranking
- alias/pinyin matching
- local/online result grouping
```

### Key Data Flows

1. **Local ingestion:** NAS scan -> metadata probe -> `Song` merge -> `Asset` creation -> search index update.
2. **Search:** Mobile query -> Catalog/Search -> ranked songs grouped by canonical `Song` -> user selects version if needed.
3. **Queue to playback:** Mobile command -> Session Engine -> realtime snapshot -> TV loads `Asset.playbackUrl` -> TV reports playback progress and end state.
4. **Online supplementation:** Search miss or explicit online search -> source adapter candidates -> worker cache/download -> `Asset(status=ready)` -> queue entry can become playable.
5. **Failure recovery:** TV reports `failed` -> Session Engine checks alternate ready asset -> swap and rebroadcast, or skip and log reason.

## Suggested Build Order

1. **Canonical media model + asset gateway**
   - Build `Song`, `Asset`, `SourceRecord`, `Room`, `QueueEntry`, `PlaybackSession`.
   - Expose controlled static URLs from NAS/cache before building mobile UX.
   - Reason: every later phase depends on stable playback identifiers and media URL semantics.

2. **Local ingestion and import review**
   - Scan the local library, probe files, normalize metadata, handle duplicates and bad names.
   - Add a minimal admin repair path for imports that fail normalization.
   - Reason: local playback is the primary path; online supplementation should not define the first data model.

3. **Session engine + minimal TV playback loop**
   - Implement room state reducer, pairing, realtime snapshots, current/next display, and player telemetry.
   - Validate reconnect recovery and versioned commands now.
   - Reason: KTV failure modes are mostly state-machine failures, not UI problems.

4. **Mobile controller and queue management**
   - Add search, add/remove/bump/skip commands, queue list, and current-state view.
   - Keep all writes server-mediated.
   - Reason: once playback works deterministically, the mobile app is mostly a client of existing state.

5. **Search quality and read-model refinement**
   - Add aliases, pinyin, initials, singer lookup, recent songs, and dedupe rules.
   - Keep search as a read model; do not let search logic leak into queue state.
   - Reason: search quality matters, but it should refine a proven core loop instead of redefining it.

6. **Online supplementation and cache-first playback**
   - Add provider adapters, source ranking, cache jobs, health verification, and alternate-asset fallback.
   - Only allow queued playback from `ready` cached assets in MVP.
   - Reason: this is the highest-complexity area and depends on the earlier Song/Asset split.

7. **Observability and recovery tools**
   - Playback event log, failed-source repair, asset verification, session inspection, and basic history.
   - Reason: once real use begins, diagnosis speed matters more than another feature surface.

Build-order implication: do not start with multi-room, recommendations, direct online streaming, or fancy subtitle pipelines. Those all sit on top of the same core invariants and will amplify mistakes if the core model is still moving.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 room | Modular monolith is enough. One API, one worker, PostgreSQL, Redis, NAS mount, simple reverse proxy. |
| 2-10 rooms | Keep the same codebase, but shard hot room state by `roomId`, isolate worker concurrency, and move static media delivery behind a stronger cache layer. |
| 10+ rooms | Split Session Engine runtime from Catalog/Search and Media Pipeline if operational isolation becomes necessary. Keep protocol contracts unchanged. |

### Scaling Priorities

1. **First bottleneck:** media I/O and cache/download jobs, not command throughput. Fix with better worker scheduling, asset verification, and static media serving.
2. **Second bottleneck:** realtime fanout and reconnect storms if multiple players/controllers reconnect together. Fix with room-scoped channels, snapshot replay, and durable event ordering.

## Anti-Patterns

### Anti-Pattern 1: Player-As-Source-Of-Truth

**What people do:** Let the TV decide current song, next song, or queue completion based only on its local media events.
**Why it's wrong:** Any reconnect, manual skip, or duplicate event creates state drift between mobile and TV.
**Do this instead:** The TV reports telemetry; the Session Engine decides authoritative transitions.

### Anti-Pattern 2: Device-To-Device Control

**What people do:** Have the mobile controller call the TV directly for skip, pause, or song selection.
**Why it's wrong:** You lose auditability, ordering, and recovery. Pairing becomes fragile and multiple phones become a race condition.
**Do this instead:** Route every command through the API and Session Engine, then broadcast the resulting state.

### Anti-Pattern 3: Queue Entries Bound To Filenames

**What people do:** Store queue state as a file path or provider URL and treat that as the song identity.
**Why it's wrong:** Online cached assets rotate, local files get renamed, duplicates cannot merge cleanly, and fallback is nearly impossible.
**Do this instead:** Queue `Song` plus selected `Asset`, with provider history stored separately in `SourceRecord`.

### Anti-Pattern 4: Direct Online Streaming In MVP

**What people do:** Resolve an online URL and hand it straight to the TV player.
**Why it's wrong:** Provider instability, browser codec variance, token expiry, and buffering failures all leak into the player runtime.
**Do this instead:** Cache first, verify the asset, then expose a controlled playback URL.

### Anti-Pattern 5: Ingestion Work In The Request Path

**What people do:** Run file scans, metadata probe, or online downloads during mobile API requests.
**Why it's wrong:** Requests block, retries get messy, and user actions become hostage to slow I/O.
**Do this instead:** Queue jobs in the worker and surface explicit pending states to the UI.

### Anti-Pattern 6: Treating Search As The Domain Model

**What people do:** Let search results directly define song identity, queue semantics, or asset selection.
**Why it's wrong:** Ranking rules and normalization change over time; queue stability should not.
**Do this instead:** Search returns canonical `Song` candidates and optional asset choices; the Session Engine operates on stable IDs only.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| NAS / filesystem library | Read-only scan by worker, read-only playback by asset gateway | Keep imports and formal library paths separate. |
| `ffprobe` / `ffmpeg` | Worker subprocess tools | Probe first; transcode only when necessary for playback normalization. |
| Online source adapters | Worker-side adapter interface | Never expose provider-specific URLs or parsing logic to the TV client. |
| Reverse proxy / static server | Front door for apps and media | Media routes should be stable and optimized for large-file playback. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Mobile Controller <-> API Gateway | HTTPS + websocket | Mobile sends commands and reads projections; no direct player RPC. |
| TV Player <-> Session Engine | websocket snapshots and telemetry events | Correlate by `roomId`, `queueEntryId`, and `sessionVersion`. |
| TV Player <-> Asset Gateway | HTTP media fetch | Keep this contract simple and stable. |
| API Gateway <-> Session Engine | in-process module calls first | Split over the network only if scaling or operational isolation proves necessary. |
| API Gateway <-> Catalog/Search | query module or internal API | Read-only from the perspective of control flows. |
| Session Engine <-> Worker | job enqueue / domain events | Use for cache requests, verification, and repair tasks; not for immediate UI writes. |

## Sources

- Local project constraints: `/Users/shaolongfei/OtherProjects/home-ktv-system/.planning/PROJECT.md` and `/Users/shaolongfei/OtherProjects/home-ktv-system/docs/KTV-ARCHITECTURE.md` (HIGH)
- Karaoke Eternal server docs: https://www.karaoke-eternal.com/docs/karaoke-eternal-server/ (MEDIUM, confirms split between server/app/player responsibilities and browser playback constraints)
- Karaoke Eternal app docs: https://www.karaoke-eternal.com/docs/karaoke-eternal-app/getting-started/ (MEDIUM, confirms room/player pairing flow and player-side playback initiation)
- PiKaraoke project README: https://github.com/vicwomg/pikaraoke (MEDIUM, confirms browser-based queue/control model and mixed local/online ingestion pattern)
- Jellyfin media organization docs: https://jellyfin.org/docs/general/server/media/music/ (MEDIUM, supports local metadata, parser tuning, and import normalization)
- MDN autoplay guide: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay (HIGH, confirms browser autoplay constraints that affect TV player bootstrapping)

---
*Architecture research for: home living-room KTV system*
*Researched: 2026-04-28*
