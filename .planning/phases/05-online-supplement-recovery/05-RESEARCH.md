# Phase 5: Online Supplement & Recovery - Research

**Researched:** 2026-05-07  
**Domain:** online supplement, cache lifecycle, playback recovery, admin recovery  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: 当本地搜索无结果时，手机端直接显示在线候选区和“请求补歌”入口。
- D-02: 当本地已有结果时，仍可显示在线候选区，但必须排在本地结果下方，作为弱提示扩展。
- D-03: 在线候选卡片展示标题、歌手、来源、时长、候选类型，以及可靠性/风险标签。
- D-04: 用户提交补歌后，展示任务状态流，不自动入队；ready 后仍需要用户显式点歌。
- D-05: 允许所有已启用 provider 进入缓存流程，管理员保留关闭能力作为 kill-switch。
- D-06: 不设置统一的前置人工审核闸门；用户选中候选后可以直接进入缓存，只有失败或风险分支才进入 `review_required`。
- D-07: 在线补歌任务保留完整生命周期状态：`discovered / selected / review_required / fetching / fetched / ready / failed / stale / promoted / purged`。
- D-08: `ready` 在线资源可被用户显式选择进入播放，但不自动入队。
- D-09: 在线候选在缓存完成并通过自动校验后即可变为 `ready` 并可点。
- D-10: `ready` 在线资源保持在线补歌语义，不与本地正式库完全合并成同一类资源。
- D-11: 当前播放失败时，系统直接跳下一首，不优先做同曲备用资源切换或同源重试。
- D-12: 失败提示要同时显示原因和回退结果，例如“已跳过”。
- D-13: Admin Rooms 页默认展示房间状态、当前曲目、队列、TV 在线、控制端数量、最近事件和在线任务摘要。
- D-14: 后台允许重试失败任务、清理失败任务、刷新房间状态、刷新 `pairingToken`，并支持资源转正操作。
- D-15: 任务卡片必须关联房间、候选、状态、失败原因和最近事件。
- D-16: Rooms 页不单独提供一个显眼的 ready 在线资源“转正入口”；转正更适合放在任务流程里，而不是房间主界面的主按钮。

### Claude's Discretion
- 任务卡片的具体布局、状态徽标文案、刷新节奏和失败原因的视觉层级。
- Provider kill-switch 的具体入口位置与状态表达。
- `review_required` 在 UI 上的呈现方式，以及 ready 资源和本地正式资源的分组样式。
- 在线任务列表与最近事件是采用内联展开、抽屉还是独立面板。

### Deferred Ideas (OUT OF SCOPE)
- None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONLN-01 | 当本地歌库无法满足点歌需求时，用户可以主动请求在线补歌候选 | `song-search` 现有 `online` 槽位、在线候选发现/适配器模式、搜索结果分组策略 |
| ONLN-02 | 用户可以把一个在线候选提交到“先缓存、后播放”的流程，而不是直接在线播放 | `candidate_tasks` 生命周期、`selected -> fetching -> fetched -> ready` 流程、provider cache job 模式 |
| ONLN-03 | 在线候选只有在生成受控且 `ready` 的资源后才可以进入正式点歌队列 | `Asset.status` / `Asset.sourceType` 约束、`session-command-service` 队列准入、`AssetGateway` ready gate |
| ONLN-04 | 管理员可以查看在线候选任务状态、重试失败任务、清理失败任务，并把合适的缓存资源转正为正式歌库内容 | `admin-rooms` 现有运维入口、`admin-imports` 的 retry/repair 模式、`candidate_tasks` 与 `promoted` 语义 |
| PLAY-05 | 当当前资源播放失败时，系统可以自动切换到同曲目的备用可用资源，或回退到下一首并向控制端提示原因 | 以 Phase 5 约束为准：当前阶段应落“直接跳下一首 + 原因/回退结果广播”，不要按旧架构文档默认做备用资源切换 |
| ADMN-02 | 管理员可以在后台查看房间状态、当前队列、当前 TV Player、在线控制端数量和最近播放事件 | `buildRoomControlSnapshot`、`admin-rooms`、`RoomStatusView`、`playback_events` 与控制会话计数 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Prefer `rg` / `rg --files` for file discovery.
- Parallelize independent reads with `multi_tool_use.parallel` when possible.
- Use `apply_patch` for manual file edits; do not write files with heredocs or `cat`.
- Do not use destructive git commands unless explicitly requested.
- Do not revert user changes you did not make.
- Default to ASCII unless the file already uses another charset.
- Start work through the GSD workflow before file-changing actions.

## Summary

Phase 5 is an extension of the existing server-authoritative media model, not a second playback system. The repo already has the right anchors: `Song` / `Asset` separation, `PlaybackSession` truth on the server, `playback_events` for audit, `admin-rooms` as the ops entry point, and `song-search` as the place where local-vs-online result grouping belongs.

The main planning risk is semantic drift. Earlier architecture notes suggest alternate-asset fallback and promotion patterns, but the locked Phase 5 decisions are stricter: online candidates must cache first, `ready` does not auto-enqueue, and playback failure should skip directly to the next song while surfacing the reason and fallback result. Plan around those phase decisions, not the older general architecture sketch.

**Primary recommendation:** keep one online-task lifecycle in PostgreSQL, extend the existing session snapshot and room admin surfaces, and treat provider adapters, cache jobs, and recovery notices as server-owned concerns.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.15.0 LTS | API and background runtime | Matches the repo's current backend baseline and keeps the whole control plane in one TypeScript stack. |
| TypeScript | 5.9.2 | Shared types across API, mobile, admin, and domain | Prevents contract drift across the room/session/media surfaces. |
| Fastify | 5.8.5 | HTTP + realtime gateway | Fits the existing API shape and the repo's command/snapshot style. |
| React | 19.2.5 | Mobile/admin UIs | Already used by the controller and admin apps. |
| Vite | 8.0.10 | Frontend build/runtime | Already the browser-app baseline in the repo. |
| PostgreSQL | 18.3 | Durable source of truth | Best fit for candidate tasks, playback events, queue state, and admin recovery records. |
| FFmpeg / ffprobe | 8.1 line | Probe and verify media | Needed for cache validation and ready gating; keep it out of the playback path. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.3.6 | Runtime validation | Use at API boundaries and task payloads. |
| Drizzle ORM | 0.45.2 | Typed SQL access | Use only if it fits the existing SQL-first repository style. |
| TanStack Query | 5.100.5 | Server-state caching in UIs | Use for room status, task lists, and refreshable admin views. |
| TanStack Router | 1.168.25 | Routing/data loading | Use if the admin or controller screens need deeper route composition. |
| Zustand | 5.0.12 | Local UI state | Use for modal/toggle/transient client state only. |
| BullMQ | 5.76.2 | Retryable cache/recovery jobs | Only add if online caching and cleanup outgrow in-process async handling. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres as task store | Redis queue only | Faster transient jobs, but weaker auditability and recovery history. |
| In-process async handlers | Separate worker + BullMQ | Better isolation, but more moving parts for a phase that is still operationally small. |
| Direct online playback | Cache-before-play assets | Simpler demo path, but conflicts with the project's stability and recovery constraints. |

**Installation:**
```bash
npm install fastify zod drizzle-orm pg @fastify/websocket react react-dom @tanstack/react-query @tanstack/react-router zustand bullmq
```

Versions above come from the repo's current stack research baseline.

## Architecture Patterns

### Recommended Project Structure
```text
apps/
  api/
    src/modules/online/        # provider adapters, candidate tasks, cache orchestration
    src/modules/playback/      # failure handling, skip/advance, playback audit
    src/modules/rooms/         # snapshots, admin room summary, pairing refresh
  mobile-controller/           # online candidate display and task status UX
  admin/                       # room recovery view, task repair actions
packages/
  domain/                     # shared state and lifecycle enums
  player-contracts/           # snapshot and telemetry contracts
```

### Pattern 1: Single Online-Task Lifecycle
**What:** keep online discovery, selection, fetch, validation, ready, failure, stale, promotion, and purge in one explicit task model.  
**When to use:** always for online supplement work.  
**Example:**
```ts
// Source: docs/KTV-ARCHITECTURE.md + packages/domain/src/index.ts
type OnlineTaskState =
  | "discovered" | "selected" | "review_required" | "fetching"
  | "fetched" | "ready" | "failed" | "stale" | "promoted" | "purged";
```

### Pattern 2: Server-Authoritative Recovery
**What:** playback failure and queue progression are decided by the session engine, then broadcast as snapshots/notices.  
**When to use:** every failure, skip, retry, and reconnect path.  
**Example:**
```ts
// Source: apps/api/src/modules/playback/session-command-service.ts + apps/api/src/routes/player.ts
// On failure, append event, update session, then broadcast a new snapshot and notice.
```

### Pattern 3: Ready Is a Gate, Not an Auto-Commit
**What:** `ready` means queueable after validation, not auto-enqueued and not merged into the formal local library truth layer.  
**When to use:** all online resource UX and admin repair flows.  
**Example:**
```ts
// Source: apps/api/src/routes/song-search.ts
online: { status: "disabled", message: "...", candidates: [] }
```

### Anti-Patterns to Avoid
- **Online candidate becomes a local song too early:** it leaks provider semantics into the formal library.
- **Client-side fallback logic:** the TV/mobile clients should not decide recovery independently.
- **Promote button on the Rooms page:** D-16 explicitly pushes promotion into the task flow instead.
- **Ready auto-enqueues:** this violates D-04 and D-08.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Online candidate discovery | Provider-specific UI glue and ad hoc search parsing | Provider adapter with `search/getCandidate/prepareFetch/verify` | Keeps provider volatility out of product logic. |
| Cache retry/cleanup | One-off cron scripts and manual DB edits | Candidate task state machine plus a recoverable job runner | Preserves audit trail and operator recovery. |
| Playback failure recovery | Client-side retry loops | `session-command-service` and `playback_events` driven fallback | Keeps recovery on the server truth path. |
| Room recovery UI | A new debug console | Extend `admin-rooms` / `RoomStatusView` with task and event summary | Reuses the existing admin surface the repo already has. |

**Key insight:** the expensive part is not fetching media bytes; it is keeping search, cache, playback, and repair aligned to one truth layer.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct online playback | Cache-before-play | Phase 5 decisions and architecture note | Keeps the room stable and failure handling uniform. |
| Alternate-asset retry on failure | Direct skip to next song with reason/result notice | Phase 5 decision D-11/D-12 | Reduces recovery branching and avoids extra fallback complexity. |
| Promotion from Rooms page | Promotion inside task flow | Phase 5 decision D-16 | Prevents the ops UI from becoming a second truth layer. |

**Deprecated/outdated:**
- Old general-architecture fallback idea that prefers same-song alternate assets on playback failure. Phase 5 locks a simpler skip-first behavior.

## Common Pitfalls

### Pitfall 1: Treating `ready` as “formally local”
**What goes wrong:** online resources silently merge into the local library model and lose their supplement semantics.  
**Why it happens:** both local and cached online assets are playable, so the distinction feels cosmetic.  
**How to avoid:** keep `Asset.sourceType` and task state visible in data and UI.  
**Warning signs:** no provider/source metadata in admin, or room UI hides the online origin.

### Pitfall 2: Reintroducing fallback logic in the wrong layer
**What goes wrong:** TV/mobile decide recovery differently from the server.  
**Why it happens:** failure handling looks small enough to inline in the client.  
**How to avoid:** route failure through the playback telemetry/session path, then broadcast the server result.  
**Warning signs:** client-side retry loops or hidden local queue mutation.

### Pitfall 3: Making the Rooms page into a repair console
**What goes wrong:** operators lose the task/event context that explains why a resource is ready, failed, or stale.  
**Why it happens:** the page already has room state and pairing actions, so more buttons look cheap.  
**How to avoid:** keep promotion inside task detail flows and keep the Rooms page focused on room state, queue, events, and summaries.  
**Warning signs:** a large number of one-click repair actions without task context.

## Code Examples

Verified patterns from local sources:

### Search response extension point
```ts
// Source: apps/api/src/routes/song-search.ts
const response: SongSearchResponse = {
  query,
  local: records.map(...),
  online: {
    status: "disabled",
    message: "本地未入库，补歌功能后续可用",
    candidates: []
  }
};
```

### Server-side playback recovery hook
```ts
// Source: apps/api/src/routes/player.ts + apps/api/src/modules/playback/session-command-service.ts
// failed telemetry should append a playback event, update playback state,
// and then broadcast the next authoritative snapshot.
```

### Admin room snapshot reuse
```ts
// Source: apps/api/src/routes/admin-rooms.ts + apps/api/src/modules/rooms/build-control-snapshot.ts
// reuse the room snapshot pipeline, then extend it with task summary and recent events.
```

## Open Questions

1. **Which online providers are enabled in this deployment?**
   - What we know: the phase allows enabled providers to enter cache flow, and admins can kill-switch them.
   - What's unclear: the actual provider list and which ones support cache versus discovery only.
   - Recommendation: model provider capabilities explicitly in config and keep the kill-switch server-side.

2. **Should Phase 5 introduce a separate worker now, or keep jobs inside `apps/api` for this phase?**
   - What we know: the repo already treats a worker as optional until workload proves it.
   - What's unclear: whether online cache throughput justifies the extra process immediately.
   - Recommendation: default to in-process async jobs plus PostgreSQL; split out a worker only if implementation load or runtime pressure makes it necessary.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-----------|-----------|---------|----------|
| Node.js | API, scripts, future worker | ✓ | v25.8.0 | — |
| pnpm | workspace management | ✓ | 10.33.2 | — |
| ffmpeg | media probing / validation | ✓ | 8.1 | — |
| ffprobe | media probing / validation | ✓ | 8.1 | — |
| psql | DB admin / inspection | ✗ | — | Use app-level DB access or a local Postgres container during implementation. |
| pg_isready | DB health check | ✗ | — | Use app-level connection checks or containerized Postgres. |

**Missing dependencies with no fallback:**
- None for planning.

**Missing dependencies with fallback:**
- `psql`, `pg_isready`

## Sources

### Primary (HIGH confidence)
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/05-online-supplement-recovery/05-CONTEXT.md`
- `.planning/research/SUMMARY.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `.planning/research/STACK.md`
- `docs/KTV-ARCHITECTURE.md`
- `packages/domain/src/index.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/routes/song-search.ts`
- `apps/api/src/routes/admin-rooms.ts`
- `apps/api/src/routes/admin-imports.ts`
- `apps/api/src/routes/player.ts`
- `apps/api/src/modules/catalog/admission-service.ts`
- `apps/api/src/modules/catalog/repositories/asset-repository.ts`
- `apps/api/src/modules/catalog/repositories/song-repository.ts`
- `apps/api/src/modules/ingest/import-scanner.ts`
- `apps/api/src/modules/player/telemetry-service.ts`
- `apps/api/src/modules/playback/session-command-service.ts`
- `apps/api/src/modules/playback/repositories/playback-event-repository.ts`
- `apps/api/src/modules/playback/repositories/playback-session-repository.ts`
- `apps/api/src/modules/playback/repositories/queue-entry-repository.ts`
- `apps/api/src/modules/assets/asset-gateway.ts`
- `apps/api/src/modules/realtime/room-snapshot-broadcaster.ts`
- `apps/api/src/routes/room-snapshots.ts`
- `apps/mobile-controller/src/App.tsx`
- `apps/mobile-controller/src/runtime/use-room-controller.ts`
- `apps/admin/src/rooms/RoomStatusView.tsx`
- `apps/admin/src/api/client.ts`

### Secondary (MEDIUM confidence)
- None used

### Tertiary (LOW confidence)
- None used

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - matches the repo's current stack research and the code that already exists.
- Architecture: HIGH - directly aligned with the current session, catalog, and admin modules.
- Pitfalls: HIGH - driven by explicit phase decisions and concrete code paths.

**Research date:** 2026-05-07  
**Valid until:** 2026-06-06
