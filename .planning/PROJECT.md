# 家庭包厢式 KTV 系统

## What This Is

这是一个面向家庭客厅场景的单房间包厢式 KTV 系统。电视只负责全屏播放，手机是唯一控制端，系统通过中心服务端统一管理点歌、队列、播放状态和媒体资源。第一版重点不是做“最花哨的 KTV”，而是先把本地歌库为主、在线补歌为辅的稳定可唱体验做扎实。

## Core Value

在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

## Requirements

### Validated

- [x] Phase 1 validated the controlled media contract, TV runtime binding, playback telemetry, switch rollback, reconnect behavior, and explicit player conflict handling.
- [x] Phase 2 validated local library scanning, import candidate review, strict formal catalog admission, `song.json` consistency validation, and admin maintenance for songs/resources.

### Active

- [ ] 用户可以在手机端完成搜索、点歌、删歌、顶歌、切歌等全部控制操作
- [ ] 电视端可以稳定全屏播放当前歌曲，并实时反映当前播放、下一首和入场二维码
- [ ] 系统可以统一管理本地歌库与在线补歌资源，并尽量让用户感知为同一种“歌曲”
- [ ] 系统可以提供中文歌名、歌手、拼音、首字母、别名等搜索能力
- [ ] 服务端会话状态机可以作为唯一真相源，驱动手机端与电视端的一致状态
- [ ] 在线补歌在第一版中必须先缓存再播放，并在播放失败时具备基础回退能力

### Out of Scope

- 多房间 / 多包厢能力 — 当前明确只做单房间家庭场景，过早支持多房间会抬高状态模型复杂度
- 用户账号体系 — 第一版重点是设备控制与播放闭环，不引入非核心的身份系统
- 软件实时麦克风 DSP / 混响 / 回声 / EQ — 实时音频处理交给硬件链路，避免软件与硬件重复处理
- 唱歌评分、音高分析、AI 人声分离 — 不决定第一版是否“能稳定唱起来”，但会显著增加复杂度
- 在线直通播放 — 第一版优先稳定性与回退能力，避免把在线解析复杂性压给 TV Player
- 复杂后台 CMS — 第一版后台只保留必要的歌库、资源、设备与任务管理能力

## Context

项目已有一份较完整的架构设计文档，已经明确产品边界、核心模块、数据模型、API 草案、播放器状态机方向、目录规范、缓存策略、设备绑定流程以及合规边界。当前系统目标是“从零设计”而不是改造现有代码库，因此 ROADMAP 应聚焦于绿地 MVP 的交付顺序。

已确定的产品与系统背景：

- 场景是单房间、单电视的家庭包厢式 KTV
- 手机是唯一控制端，电视只负责播放与状态展示
- 本地歌库是主路径，在线歌源只做补歌层
- 软件系统负责内容与控制，不负责实时麦克风效果处理
- 架构方向是“中心服务端 + TV Player + Mobile Controller”
- 计划复用开源播放器、拼音、搜索、媒体探测和下载工具，但保留 Session Engine、统一歌曲模型和搜索去重策略的自研空间

当前实现状态：

- Phase 1 已完成并验证：媒体契约、TV Player 绑定、播放中原唱/伴唱切换、重连恢复和冲突状态闭环已具备。
- Phase 2 已完成并验证：本地歌库扫描、导入审核、正式歌库准入、`song.json` 校验和后台歌库维护已具备。
- 下一阶段进入 Phase 3：扫码入场、服务端权威队列、多人控制端同步和播放控制闭环。

## Constraints

- **Product scope**: 第一版必须优先验证“稳定可唱”而不是“功能最全” — 复杂增强能力要延后
- **Interaction model**: 手机必须是唯一控制端 — 电视端不承载搜索和复杂操作
- **Playback model**: 播放状态只能由服务端状态机裁决 — 防止手机端与电视端状态漂移
- **Audio chain**: 软件不承担实时人声 DSP — 由硬件完成混响、监听、EQ 和最终混音
- **Media source**: 歌曲来源采用“本地为主、在线补歌为辅” — 在线源不允许成为主依赖
- **Online playback**: 第一版在线歌曲必须先缓存再播放 — 提高稳定性并简化失败恢复
- **Room model**: 第一版虽然只有一个房间，但数据模型必须保留 `room` 概念 — 避免后续推倒重来
- **Search quality**: 中文搜索体验必须覆盖歌名、歌手、拼音、首字母、别名与繁简体 — 否则点歌体验不可接受
- **Deployment**: 预期运行在家庭服务器拓扑中，业务与任务在 `lxc-dev`，歌库与缓存位于 `lxc-nas`
- **Compliance**: 在线歌源接入需要遵守明确的合规边界 — 具体 provider 选择与策略要在实施前再确认

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 中心服务端作为唯一业务真相 | 点歌、队列、切歌、重连恢复都依赖一致状态 | — Pending |
| TV Player 与 Mobile Controller 分离 | 符合真实 KTV 使用形态，职责边界更清晰 | — Pending |
| 第一版只做单房间，但保留 `room` 数据模型 | 当前场景简单，但避免未来多房间时推翻模型 | — Pending |
| 本地歌库优先，在线歌源作为补歌层 | 在线资源不稳定，不适合作为核心依赖 | — Pending |
| 在线歌曲采用“先缓存再播放” | 更利于稳定播放、失败恢复、资源复用与统一播放器逻辑 | — Pending |
| `Song` 与 `Asset` 分离建模 | 用户点的是“歌”，系统播的是“资源” | — Pending |
| 中文搜索优先做“搜得到且不混乱” | 点歌体验的基础优先于推荐和花哨排序 | — Pending |
| 软件不做实时麦克风 DSP | 避免延迟与复杂度，把音频效果交给硬件链路 | — Pending |
| 第一版优先使用受控静态资源 URL | 不让电视端直接依赖复杂的在线解析流程 | — Pending |
| 推荐技术方向为 TypeScript monorepo | 便于 TV、Mobile、API、Worker 共享协议与类型 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-30 after Phase 02 verification*
