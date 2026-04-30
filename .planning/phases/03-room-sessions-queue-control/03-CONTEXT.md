# Phase 3: Room Sessions & Queue Control - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段交付 `living-room` 的扫码入场、控制会话恢复、多人手机端共享实时房间状态、服务端权威队列命令处理、播放中原唱 / 伴唱切换触发，以及管理员刷新房间入场令牌。

Phase 3 不负责完整中文搜索、多版本点歌选择或在线补歌缓存；这些能力分别留给 Phase 4 和 Phase 5。Phase 3 只需要提供最小“已入库歌曲列表 / 选择歌曲”入口来满足本地可播歌曲入队。

</domain>

<decisions>
## Implementation Decisions

### 扫码入场与控制会话恢复
- **D-01:** `pairingToken` 有效期为 15 分钟。
- **D-02:** 控制会话使用服务端会话 + httpOnly cookie + 本地 device id，而不是只依赖 localStorage token。
- **D-03:** 已建立的控制会话在刷新或短时断线后可以恢复；`pairingToken` 过期不影响既有控制会话。
- **D-04:** 管理员轮换 `pairingToken` 后，新扫码必须使用新 token；已建立的控制会话继续有效直到自身超时。

### 多人控制权限与防误触规则
- **D-05:** 多个手机控制端在 Phase 3 中平权，不引入 host / owner / 管理员指定控制者。
- **D-06:** 切掉当前正在播放的歌曲需要二次确认。
- **D-07:** 删除尚未播放的队列项不弹二次确认，但需要提供短暂撤销。
- **D-08:** 原唱 / 伴唱切换是常用播放控制，不需要二次确认，按钮即时触发。

### 实时同步与手机控制首屏
- **D-09:** WebSocket 是 Phase 3 的主同步方式，用于让手机端、TV 端和服务端状态闭环保持一致。
- **D-10:** WebSocket 断线后客户端自动重连；重连失败时退回低频轮询，并显示离线 / 重连状态。
- **D-11:** 手机控制首屏需要同时覆盖当前播放、原唱 / 伴唱切换、队列、点歌入口和 TV 在线状态。
- **D-12:** Phase 3 手机端点歌入口采用最小“已入库歌曲列表 / 选择歌曲”形态；完整中文搜索、拼音搜索和多版本选择留到 Phase 4。

### 队列命令语义与自动推进
- **D-13:** 顶歌表示移动到当前播放之后的第一位，不打断当前歌曲。
- **D-14:** 切歌表示立即跳过当前歌曲并由服务端推进下一首；如果队列为空，房间回到 `idle`。
- **D-15:** TV 上报 `ended` 后，服务端立即推进下一首并生成新的 playback target。
- **D-16:** 并发命令通过 `sessionVersion` / `commandId` 做幂等和冲突拒绝；客户端收到冲突或过期版本后刷新最新 snapshot。

### 管理员二维码 / token 管理
- **D-17:** Admin 房间状态页提供刷新 `pairingToken` 的入口。
- **D-18:** 刷新 `pairingToken` 后旧 token 立即失效，但既有控制会话不受影响。
- **D-19:** Admin 需要展示 token 过期时间、在线控制端数量、TV 在线状态和当前队列摘要。
- **D-20:** 控制会话 2 小时无活动后过期。

### the agent's Discretion
- 具体 WebSocket 消息 envelope、连接保活、重连退避、低频轮询间隔和广播节流策略由 researcher / planner 决定，但必须保持服务端状态机为唯一真相。
- 具体手机控制页视觉布局、按钮文案、撤销提示样式和离线提示样式由 UI 设计与实现阶段决定，但首屏信息必须覆盖 D-11。
- 具体 `commandId` 生成方式、幂等记录保存期限和版本冲突响应格式由 planner 决定，但不能让手机端本地状态覆盖服务端真相。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Requirements
- `.planning/ROADMAP.md` — Phase 3 的目标、成功标准和计划拆分：扫码入场、会话生命周期、服务端权威队列和多端实时同步。
- `.planning/REQUIREMENTS.md` — `PAIR-01`、`PAIR-02`、`PAIR-03`、`PAIR-04`、`QUEU-01`、`QUEU-03`、`QUEU-04`、`QUEU-05`、`QUEU-06`、`PLAY-04`、`ADMN-03` 的验收边界。
- `.planning/PROJECT.md` — 手机唯一控制端、TV 只播放和展示、服务端状态机唯一真相、本地歌库主路径和单房间 MVP 约束。
- `.planning/phases/01-media-contract-tv-runtime/01-CONTEXT.md` — 播放中原唱 / 伴唱切换是 v1 硬约束；TV 请求切换 transition，不自己推断资源配对；TV idle / playing 二维码展示策略。
- `.planning/phases/02-library-ingest-catalog-admin/02-CONTEXT.md` — 正式歌库主路径严格要求 verified 原唱 / 伴唱双资源；默认播放伴唱版，原唱版作为播放中切换目标。

### Existing Runtime Contracts
- `packages/domain/src/index.ts` — 已有 `Room`、`QueueEntry`、`PlaybackSession`、`DeviceSession`、`PlaybackEvent`、`DeviceType`、队列状态和播放状态类型。
- `packages/session-engine/src/index.ts` — 现有 session engine typed entry point；Phase 3 需要把空 reducer 扩展为服务端权威命令处理。
- `packages/player-contracts/src/index.ts` — `RoomSnapshot`、`PairingInfo`、`PlaybackTarget`、`SwitchTarget`、`SwitchTransitionResult` 等 TV / 控制端共享契约。
- `packages/protocol/src/index.ts` — 当前协议事件名和 player telemetry contract；Phase 3 实时同步消息应与这里的协议包对齐。

### Existing API and TV Integration Points
- `apps/api/src/routes/room-snapshots.ts` — 当前 room snapshot 构建和 pairing info 生成路径。
- `apps/api/src/routes/player.ts` — TV bootstrap、heartbeat、telemetry、switch-transition 和 reconnect-recovery 路由。
- `apps/api/src/modules/player/register-player.ts` — TV device session 注册、冲突处理和现有 `PairingInfo` 生成逻辑。
- `apps/api/src/modules/playback/repositories/queue-entry-repository.ts` — 现有 queue entry repository 入口，Phase 3 队列命令会扩展这里或相邻模块。
- `apps/api/src/modules/playback/repositories/playback-session-repository.ts` — 现有 playback session repository 入口，Phase 3 会用它落地 session version 与推进语义。
- `apps/tv-player/src/runtime/use-room-snapshot.ts` — TV 当前 snapshot 轮询和 pairing 稳定策略；Phase 3 需要考虑与 WebSocket 主同步的关系。
- `apps/tv-player/src/screens/IdleScreen.tsx` — idle 大二维码展示。
- `apps/tv-player/src/screens/PlayingScreen.tsx` — playing 角落二维码、当前歌曲、下一首和播放提示展示。

### Architecture Guide
- `docs/KTV-ARCHITECTURE.md` §API 与实时协议设计 — Command / State / Event 分离、HTTP / WebSocket 职责边界。
- `docs/KTV-ARCHITECTURE.md` §Session Engine 状态机设计 — 房间状态、队列项状态、幂等、恢复和推进语义。
- `docs/KTV-ARCHITECTURE.md` §第一版最关键的协议约束 — 手机发命令、电视报事实、服务端产出完整状态。
- `docs/KTV-ARCHITECTURE.md` §二维码入场与设备绑定策略 — TV 强绑定、手机轻绑定、`pairingToken` 和控制会话恢复。
- `docs/KTV-ARCHITECTURE.md` §控制端会话与断线恢复 — 控制端会话与扫码 token 解耦。
- `docs/KTV-ARCHITECTURE.md` §TV Player 冲突处理 — 单房间单 TV 冲突处理原则。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/domain/src/index.ts`: 已有 Phase 3 需要的核心实体和状态类型，包括 `Room`、`QueueEntry`、`PlaybackSession`、`DeviceSession` 和 `PlaybackEvent`。
- `packages/player-contracts/src/index.ts`: 已有 `RoomSnapshot`、`PairingInfo`、`PlaybackTarget` 和 `SwitchTarget`，可作为手机端 snapshot 与实时广播的共享形状起点。
- `packages/protocol/src/index.ts`: 已有 `room.snapshot.updated` 和 player telemetry 类型；Phase 3 可以扩展协议包承载控制端命令和广播事件。
- `apps/api/src/routes/room-snapshots.ts`: 已能构建当前房间 snapshot 和 pairing info。
- `apps/api/src/routes/player.ts`: 已有 TV heartbeat / telemetry / switch-transition 路径，可与服务端 Session Engine 闭环。
- `apps/tv-player/src/runtime/use-room-snapshot.ts`: TV 目前用 1500ms 轮询拉取 snapshot，并稳定同一房间的 pairing payload。
- `apps/admin/src/App.tsx`: 已有后台应用入口，Phase 3 可加入房间状态与 token 管理页。

### Established Patterns
- Monorepo 使用 pnpm workspace + Turborepo。
- 后端使用 TypeScript + Fastify + PostgreSQL，不引入 ORM；当前模式是 SQL migration + typed repository interfaces。
- 共享业务类型从 `@home-ktv/domain`、`@home-ktv/player-contracts` 和 `@home-ktv/protocol` 暴露，应用层不应重复定义核心房间 / 队列 / 播放 shape。
- Phase 1 已把 TV 维持为事实上报者和播放执行者；TV 不自行裁决队列、不自行推断切换资源。
- Phase 2 已确保正式歌库主路径可提供 verified 原唱 / 伴唱双资源；Phase 3 可以依赖这个准入结果做点歌和播放中切换。

### Integration Points
- 新增或扩展数据库迁移：控制会话、控制端 device session metadata、`pairingToken` 轮换状态、命令幂等记录、queue position / priority 更新所需字段。
- 新增 API / WebSocket module：扫码换取控制会话、恢复控制会话、订阅房间状态、发送队列命令、广播服务端 snapshot。
- 扩展 `packages/session-engine`: 将 queue add / delete / promote / skip / ended / switch vocal mode 等命令收敛到服务端状态机。
- 新增 mobile controller app 或等价前端入口：扫码后进入 `living-room` 控制页，首屏覆盖当前播放、切换按钮、队列、最小点歌入口和 TV 在线状态。
- 扩展 admin app：展示房间状态、token 过期时间、在线控制端数量、TV 在线状态、当前队列摘要和刷新 token 操作。

</code_context>

<specifics>
## Specific Ideas

- 家庭 MVP 中所有手机平权，不提前引入 host 或复杂权限模型。
- `pairingToken` 是入场凭证，不是控制会话本身；入场 token 过期或轮换不能打断已经建立的手机控制会话。
- 手机首屏应该是实际可用的控制台，而不是说明页或纯状态页。
- 切歌是危险操作，需要二次确认；原唱 / 伴唱切换是常用控制，不确认。
- “顶歌”不等于插播，不能打断当前正在唱的歌曲。
- 并发处理必须保护服务端真相，客户端不能靠本地乐观状态覆盖队列。

</specifics>

<deferred>
## Deferred Ideas

- 完整中文关键词、歌手、拼音、首字母、别名和 `searchHints` 搜索体验属于 Phase 4。
- 多版本点歌前选择具体资源属于 Phase 4；Phase 3 播放中只负责原唱 / 伴唱切换。
- 当前资源播放失败后的备用资源回退和失败原因提示属于 Phase 5。
- 更细粒度的访客 / 管理员 / host 权限模型属于 v2 `AUTH-01`，不进入 Phase 3。

</deferred>

---

*Phase: 03-room-sessions-queue-control*
*Context gathered: 2026-04-30*
