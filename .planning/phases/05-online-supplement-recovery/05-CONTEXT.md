# Phase 5: Online Supplement & Recovery - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

在不破坏本地优先稳定性的前提下，补上在线补歌的发现、缓存、ready 准入、失败回退和运维恢复能力。在线资源必须先缓存再播放；补歌结果可以进入可播流程，但在线资源在语义上仍保持补歌属性，不直接走在线直通播放。

</domain>

<decisions>
## Implementation Decisions

### 补歌入口与候选展示
- **D-01:** 当本地搜索无结果时，手机端直接显示在线候选区和“请求补歌”入口。
- **D-02:** 当本地已有结果时，仍可显示在线候选区，但必须排在本地结果下方，作为弱提示扩展。
- **D-03:** 在线候选卡片展示标题、歌手、来源、时长、候选类型，以及可靠性/风险标签。
- **D-04:** 用户提交补歌后，展示任务状态流，不自动入队；ready 后仍需要用户显式点歌。

### Provider 与缓存闸门
- **D-05:** 允许所有已启用 provider 进入缓存流程，管理员保留关闭能力作为 kill-switch。
- **D-06:** 不设置统一的前置人工审核闸门；用户选中候选后可以直接进入缓存，只有失败或风险分支才进入 `review_required`。
- **D-07:** 在线补歌任务保留完整生命周期状态：`discovered / selected / review_required / fetching / fetched / ready / failed / stale / promoted / purged`。
- **D-08:** `ready` 在线资源可被用户显式选择进入播放，但不自动入队。

### Ready 准入与失败回退
- **D-09:** 在线候选在缓存完成并通过自动校验后即可变为 `ready` 并可点。
- **D-10:** `ready` 在线资源保持在线补歌语义，不与本地正式库完全合并成同一类资源。
- **D-11:** 当前播放失败时，系统直接跳下一首，不优先做同曲备用资源切换或同源重试。
- **D-12:** 失败提示要同时显示原因和回退结果，例如“已跳过”。

### 运维恢复视图
- **D-13:** Admin Rooms 页默认展示房间状态、当前曲目、队列、TV 在线、控制端数量、最近事件和在线任务摘要。
- **D-14:** 后台允许重试失败任务、清理失败任务、刷新房间状态、刷新 `pairingToken`，并支持资源转正操作。
- **D-15:** 任务卡片必须关联房间、候选、状态、失败原因和最近事件。
- **D-16:** Rooms 页不单独提供一个显眼的 ready 在线资源“转正入口”；转正更适合放在任务流程里，而不是房间主界面的主按钮。

### the agent's Discretion
- 任务卡片的具体布局、状态徽标文案、刷新节奏和失败原因的视觉层级。
- Provider kill-switch 的具体入口位置与状态表达。
- `review_required` 在 UI 上的呈现方式，以及 ready 资源和本地正式资源的分组样式。
- 在线任务列表与最近事件是采用内联展开、抽屉还是独立面板。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Requirements
- `.planning/ROADMAP.md` — Phase 5 的目标、成功标准和 05-01 / 05-02 / 05-03 计划拆分。
- `.planning/REQUIREMENTS.md` — `ONLN-01`、`ONLN-02`、`ONLN-03`、`ONLN-04`、`PLAY-05`、`ADMN-02` 的验收边界，以及当前 v1 的 out-of-scope 约束。
- `.planning/PROJECT.md` — 本地优先、手机唯一控制端、服务端真相源、在线补歌为辅和合规边界等项目级硬约束。
- `.planning/phases/01-media-contract-tv-runtime/01-CONTEXT.md` — 播放契约、切换语义、失败提示产品化和 TV 运行时边界。
- `.planning/phases/02-library-ingest-catalog-admin/02-CONTEXT.md` — 严格正式库准入、导入审核、后台最小运维形态。
- `.planning/phases/03-room-sessions-queue-control/03-CONTEXT.md` — 命令 / 版本语义、队列操作、控制会话恢复。
- `.planning/phases/04-search-song-selection/04-CONTEXT.md` — 在线占位边界、版本感知搜索与点歌选择流程。

### Online Supplement and Recovery Architecture
- `docs/KTV-ARCHITECTURE.md` §在线歌源接入方式与合规边界 — provider 分层、发现层 / 导入层 / 合规播放边界。
- `docs/KTV-ARCHITECTURE.md` §统一接口建议 — `search` / `getCandidate` / `prepareFetch` / `verify` 的适配器能力形态。
- `docs/KTV-ARCHITECTURE.md` §在线候选与本地模型对齐 — 在线候选如何映射到内部 `Song` / `Asset` 模型。
- `docs/KTV-ARCHITECTURE.md` §在线缓存生命周期 — `discovered` / `selected` / `fetching` / `fetched` / `ready` / `failed` / `stale` / `promoted` / `purged`。
- `docs/KTV-ARCHITECTURE.md` §在线缓存策略建议 — cache-before-play、缓存目录分离、去重和保留策略。
- `docs/KTV-ARCHITECTURE.md` §在线缓存转正策略 — 在线资源如何转正为正式歌库内容。
- `docs/KTV-ARCHITECTURE.md` §在线歌源的失败回退策略 — 搜索失败、缓存失败、播放前校验失败的回退建议。
- `docs/KTV-ARCHITECTURE.md` §`POST /api/rooms/:roomId/commands/queue-online-candidate` — 在线候选入队到缓存流程的命令草案。
- `docs/KTV-ARCHITECTURE.md` §`candidate.updated` / `system.notice` / `player.failed` — 任务状态和播放失败的事件模型。
- `docs/KTV-ARCHITECTURE.md` §`candidate_tasks` / `playback_events` — 在线任务与播放审计的存储模型。

### Research Context
- `.planning/research/SUMMARY.md` — Phase 5 的推荐交付内容、边界和风险总结。
- `.planning/research/ARCHITECTURE.md` — 模块化单体、媒体平面、provider adapter、cache job 和 recovery surface 的推荐结构。
- `.planning/research/PITFALLS.md` — 直接在线播放、dirty media、状态漂移和 ops repair 的典型风险。
- `.planning/research/STACK.md` — worker-side provider / cache job 归位、PostgreSQL + 静态媒体底座等栈选择背景。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/domain/src/index.ts`：`SongSearchResponse.online`、`AssetSourceType`、`AssetStatus`、`PlaybackEvent` 和在线补歌相关状态已经存在，可直接扩展。
- `apps/api/src/routes/song-search.ts`：已经返回 local + online placeholder 的搜索响应，是补歌入口和在线候选显示的直接接入点。
- `apps/mobile-controller/src/App.tsx` / `apps/mobile-controller/src/runtime/use-room-controller.ts`：已有搜索面板、点歌、重复点歌确认和队列 UI，适合承载在线候选与任务状态。
- `apps/admin/src/rooms/RoomStatusView.tsx` 与 `apps/api/src/routes/admin-rooms.ts`：已有房间状态与 pairing token 刷新框架，适合扩展运维恢复视图。
- `apps/api/src/modules/player/telemetry-service.ts`、`apps/api/src/routes/player.ts`、`apps/api/src/modules/playback/repositories/playback-event-repository.ts`：已有 playback failure / ended / switch 事件链路，可复用为在线补歌失败和回退审计。
- `apps/api/src/modules/catalog/admission-service.ts` 与 `apps/api/src/modules/catalog/repositories/asset-repository.ts`：已有正式资源准入、revalidate 和 promote 风格的模式，可作为 online ready / promoted 的参考。
- `apps/api/src/modules/ingest/import-scanner.ts` 与 `apps/api/src/routes/admin-imports.ts`：已有扫描任务和后台兜底入口模式，可复用到在线缓存任务和重试/清理流程。
- `apps/api/src/modules/playback/session-command-service.ts`：已有服务端权威队列推进、skip、promote、switch 处理逻辑，是 failure recovery 的核心参考。

### Established Patterns
- 服务端 snapshot 是权威真相，WebSocket 只是广播与同步通道。
- 资源状态已经有 `ready / caching / failed / stale / promoted` 的语义基础，适合在线缓存生命周期扩展。
- 管理端偏轻量运维，不走复杂 CMS / RBAC。
- 队列与恢复逻辑都走后端服务，不让前端自己推断真相。
- 搜索响应已经按 local / online 分组，说明补歌入口可以沿用同一响应形状扩展。

### Integration Points
- `apps/api/src/routes/song-search.ts`：扩展在线候选展示和补歌请求入口。
- `apps/api/src/modules/*`：增加在线候选、缓存任务、失败回退和资源转正相关服务。
- `apps/api/src/db/migrations/*.sql`：需要为在线任务和状态流增加持久化结构，尤其是 `candidate_tasks` 风格表。
- `apps/mobile-controller/src/App.tsx`：展示在线候选、任务状态和失败提示。
- `apps/admin/src/rooms/RoomStatusView.tsx` / `apps/admin/src/api/client.ts`：展示任务摘要、事件关联和运维动作。
- `apps/api/src/modules/realtime/room-snapshot-broadcaster.ts` 与 playback/event repos：把任务状态和失败回退结果广播给控制端和后台。

</code_context>

<specifics>
## Specific Ideas

- 本地无结果时，手机端要直接出现在线候选和“请求补歌”入口。
- 本地有结果时，在线候选仍可显示，但只作为下方弱提示，不抢本地结果的位置。
- 在线候选卡片必须带可靠性 / 风险标签，避免让用户误以为它和本地正式库完全等价。
- 用户提交补歌后，界面要清楚展示任务状态流，而不是直接把歌曲放进队列。
- `ready` 在线资源可以播放，但仍保留“补歌资源”的语义，不要在界面上把它完全抹成本地正式库的一部分。
- 播放失败后优先直接跳下一首，并把失败原因和回退结果告诉用户。
- 后台运维页更像房间与任务恢复台，不是原始调试面板。
- ready 在线资源不需要在 Rooms 页单独暴露一个显眼的“转正”主按钮。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-online-supplement-recovery*
*Context gathered: 2026-05-07*
