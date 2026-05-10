# Phase 1: Media Contract & TV Runtime - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段当前边界是：定义单房间 `living-room` 的可播放媒体契约、播放中原唱 / 伴唱切换契约、TV Player 运行时契约、播放器上报/恢复/冲突处理语义，以及服务端向 TV 下发播放目标状态的主链路。

基于本次讨论，planning docs 与架构主文档现已按“**播放中原唱 / 伴唱切换能力是 v1 硬约束**”完成对齐：Phase 1 负责运行时与切换契约，Phase 2 负责正式歌库准入规则，Phase 3 负责控制端触发与状态闭环。

</domain>

<decisions>
## Implementation Decisions

### TV Runtime Target
- **D-01:** Phase 1 首发交付形态是 **网页播放器**，而不是直接做 Android TV 原生壳。
- **D-02:** 虽然首发是网页播放器，但运行时边界必须从第一天就按“**未来确定会包成 Android TV 壳**”来设计，不能把实现写死成只适合普通浏览器页面的结构。
- **D-03:** 第一验证环境锁定为 **桌面 Chrome / 小主机接电视**，而不是电视自带浏览器或 Android 盒子浏览器。

### Playable Asset Contract
- **D-04:** 用户不接受“只能播但不能切”的正式歌库体验；**正式歌库主路径必须具备原唱 / 伴唱切换能力**。
- **D-05:** 用户要求的切换能力不是“播放前选择原唱版或伴唱版”，而是 **播放中也必须可切**。
- **D-06:** “播放中切换”的体验目标是 **尽量接近无感 / 肉眼几乎感知不到**；明显中断、明显黑帧、明显时间跳变都不符合预期。
- **D-07:** 正式歌库的双资源准入标准必须严格：原唱版与伴唱版必须属于 **同版本、同时轴** 的资源对。
- **D-08:** 双资源时长差 `<=300ms` 才允许正式入库；`300ms-1s` 进入 `review-required`；`>1s` 直接拒绝进入正式歌库。

### Roadmap Alignment
- **D-09:** planning docs 必须把“播放中原唱 / 伴唱切换”视为 **v1 硬约束**，并拆成三层：Phase 1 运行时切换能力、Phase 2 正式歌库准入规则、Phase 3 控制端触发能力。

### TV Screen Composition
- **D-10:** TV `idle` 状态下显示 **大二维码**，以便手机快速扫码入场。
- **D-11:** TV `playing` 状态下显示 **角落常驻小二维码**，而不是完全隐藏二维码。
- **D-12:** 播放中采用 **标准信息密度**：至少展示当前歌曲、下一首、当前原唱 / 伴唱状态，以及必要的加载 / 恢复提示。

### MVP Infrastructure Floor
- **D-13:** Phase 1 按 **最小基础设施底座** 规划：单 backend + PostgreSQL + NAS 文件存储 + `ffmpeg / ffprobe`。
- **D-14:** `Redis`、`BullMQ`、独立 `worker` 进程 **不是 Phase 1 必需项**；若后续 research / planning 发现必须引入，也应作为“被证明需要”而不是“预设必上”的基础设施。

### Failure, Conflict, and Recovery UX
- **D-15:** 播放失败、恢复中、播放器冲突等状态要 **用户可感知，但文案与表现保持产品化**，不要直接暴露过多技术细节。
- **D-16:** 如果第二个 TV Player 连接同一房间，新播放器应直接看到“当前已有主播放器在线，不能接管”的冲突提示；**Phase 1 不提供抢占接管**。
- **D-17:** 如果播放中原唱 / 伴唱切换失败，系统应 **立即回退到切换前模式**、给出产品化提示，并把该对资源标记为异常待复核。
- **D-18:** TV 重连 / 刷新后，应优先恢复到 **同一首歌的接近原进度**；若做不到，再退回当前曲目开头，并明确提示用户。

### the agent's Discretion
- 具体的播放器前端技术组织方式，只要满足“网页首发、Android TV 壳可接入”的边界要求即可。
- 具体的 TV 状态文案、图标、提示组件和节奏，可以由后续 planner / implementer 自行设计，但必须保持高可读、远距离可识别、且不破坏“产品化提示”的要求。
- 是否在 Phase 1 内先保留 `soft_sub` / `external_lrc` 的数据模型字段但不进入主播放链，可以由后续 planning 在不违背正式歌库准入规则的前提下自行细化。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Product Constraints
- `.planning/ROADMAP.md` — Phase 1 的当前名称、目标、成功标准与计划拆分入口
- `.planning/REQUIREMENTS.md` — 当前 v1 requirements 映射，尤其是 `LIBR-03`、`LIBR-04`、`PLAY-01`、`PLAY-02`、`PLAY-03`、`PLAY-06`，以及与本次讨论冲突的后续唱控设定
- `.planning/PROJECT.md` — 手机唯一控制端、本地主在线辅、服务端权威状态、无实时 DSP 等项目级硬约束

### Media Model and Playback Contract
- `docs/KTV-ARCHITECTURE.md` §关键数据模型 — `Song` / `Asset` / `Room` / `PlaybackSession` / `DeviceSession` 的核心建模建议
- `docs/KTV-ARCHITECTURE.md` §数据建模原则 — `Song` 与 `Asset` 分离、受控静态资源 URL、服务端裁决状态真相
- `docs/KTV-ARCHITECTURE.md` §API 与实时协议设计 — Command / State / Event 分离、HTTP / WebSocket 职责边界
- `docs/KTV-ARCHITECTURE.md` §Session Engine 状态机设计 — 房间状态、队列项状态、幂等与恢复语义
- `docs/KTV-ARCHITECTURE.md` §第一版最关键的协议约束 — 手机发命令、电视报事实、服务端产出完整状态

### Lyrics, Switching, and Resource Admittance
- `docs/KTV-ARCHITECTURE.md` §歌词 / 字幕策略 — `hard_sub` / `soft_sub` / `external_lrc` / `none` 的分层策略
- `docs/KTV-ARCHITECTURE.md` §第一版资源准入策略 — 正式歌库主路径与歌词可用性要求
- `docs/KTV-ARCHITECTURE.md` §原唱 / 伴唱切换策略 — 双资源切换、双音轨与软件消声三种路线对比
- `docs/KTV-ARCHITECTURE.md` §第一版建议方案 — 当前架构文档已收敛到“双资源 + 播放中切换 + 失败回退”的第一版运行时建议

### Pairing, TV Presence, and Conflict Handling
- `docs/KTV-ARCHITECTURE.md` §二维码入场与设备绑定策略 — TV 强绑定、手机轻绑定、`pairingToken`、控制会话恢复
- `docs/KTV-ARCHITECTURE.md` §二维码展示策略 — `idle` / `playing` 阶段二维码展示方式候选
- `docs/KTV-ARCHITECTURE.md` §TV Player 冲突处理 — 单房间单 TV 冲突处理原则
- `docs/KTV-ARCHITECTURE.md` §控制端会话与断线恢复 — 控制端会话与扫码 token 解耦

### Final Architecture Direction
- `docs/KTV-ARCHITECTURE.md` §最终推荐架构 — 单机单实例后端 + 两个用户前端 + 轻量后台
- `docs/KTV-ARCHITECTURE.md` §基础设施最小集 — PostgreSQL / NAS / `ffmpeg / ffprobe` 为 MVP 主底座
- `docs/KTV-ARCHITECTURE.md` §媒体能力最小集 — 浏览器友好编码、优先 `H.264 + AAC`
- `docs/KTV-ARCHITECTURE.md` §最终 MVP 范围 — 当前 MVP 收敛边界，用于识别本次讨论与既有范围的冲突点

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 目前仓库中 **没有可复用应用代码**；当前唯一可复用资产是规划文档与架构文档本身。

### Established Patterns
- 当前已建立的“模式”全部来自文档而非代码：单 backend、自托管、服务端状态机为唯一真相、TV 只播放不做业务决策、手机是唯一控制端。

### Integration Points
- 新代码将从零开始连接到：
  - `backend`：HTTP / WebSocket / 播放状态机
  - `tv-player`：固定房间播放运行时
  - `mobile-controller`：后续 phase 接入
  - `admin`：后续 phase 接入

</code_context>

<specifics>
## Specific Ideas

- 网页播放器虽然先首发，但结构上不要做成“普通网页 demo”，而要保留未来包成 Android TV 壳的运行时边界。
- 正式歌库不能给用户制造“这首歌应该能切原唱/伴唱但实际切不了”的疑问。
- 播放中原唱 / 伴唱切换的体验应尽量接近无感，而不是靠“重新播一下”来糊弄。
- TV 屏幕重点是远距离可读与状态清晰，不是先追求装饰性界面。

</specifics>

<deferred>
## Deferred Ideas

- 更完整的界面视觉风格、字体、配色、氛围感等视觉设计细化，延后到 `$gsd-ui-phase 1` 再单独约束。
- 如果未来确实需要支持电视自带浏览器、Android 盒子浏览器或原生 Android TV 壳的差异化适配，作为后续实现研究点，而不是在本次讨论中先展开成多套目标。

</deferred>

---

*Phase: 01-media-contract-tv-runtime*
*Context gathered: 2026-04-28*
