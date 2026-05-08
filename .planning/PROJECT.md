# 家庭包厢式 KTV 系统

## What This Is

这是一个面向家庭客厅场景的单房间包厢式 KTV 系统。电视只负责全屏播放和入场展示，手机是唯一控制端，中心服务端统一管理点歌、队列、播放状态、本地歌库和在线补歌任务。

## Core Value

在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

## Current State

v1.0 MVP 已于 2026-05-08 shipped。系统已经具备：

- TV Player 绑定、全屏播放、播放遥测、重连恢复、播放器冲突保护和原唱/伴唱切换。
- 本地歌库扫描、导入审核、正式歌库准入、`song.json` 校验和后台歌库维护。
- 扫码入场、控制会话恢复、多手机实时同步、点歌、删歌、顶歌、切歌和播放中原唱/伴唱切换。
- 中文优先搜索，覆盖歌名、歌手、拼音、首字母、别名、搜索提示和多版本点歌选择。
- 在线补歌候选、先缓存后播放任务流、失败回退、后台恢复视图和任务级重试/清理/转正。
- Admin 和 Mobile 默认中文界面，并保留语言切换能力。

Milestone archives:

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

## Requirements

### Validated

- v1.0 validated controlled media contracts, TV runtime binding, playback telemetry, switch rollback, reconnect behavior, and explicit player conflict handling.
- v1.0 validated local library scanning, import candidate review, strict formal catalog admission, `song.json` consistency validation, and admin maintenance for songs/resources.
- v1.0 validated QR entry, control-session restore, realtime room-state fanout, queue commands, current-song controls, and admin pairing-token refresh.
- v1.0 validated Chinese-first song search by title, artist, pinyin, initials, aliases, and search hints, plus version-aware mobile song selection.
- v1.0 validated local-first online supplement, cache-before-play boundaries, playback failure recovery, and admin recovery operations.

### Active

No active milestone requirements. Run `$gsd-new-milestone` to define the next milestone.

### Out of Scope

- 多房间 / 多包厢能力 — v1.0 明确只做单房间家庭场景，后续可作为新 milestone 评估。
- 用户账号体系 — v1.0 重点是设备控制与播放闭环，不引入非核心身份系统。
- 软件实时麦克风 DSP / 混响 / 回声 / EQ — 实时音频处理交给硬件链路。
- 唱歌评分、音高分析、AI 人声分离 — 不决定 v1.0 是否能稳定唱起来。
- 在线直通播放 — 与“本地主、在线辅、先缓存再播放”的稳定性原则冲突。
- 复杂后台 CMS — v1.0 后台只保留歌库、资源、设备与任务管理能力。

## Context

项目现在是一个 TypeScript monorepo，包含 Fastify API、React Admin、React Mobile Controller、React TV Player，以及共享 domain/protocol/player-contract packages。v1.0 的主线目标已经完成：家庭单房间场景可以从本地歌库出发完成导入、搜索、扫码、点歌、播放、切换、失败恢复和在线补歌任务闭环。

下一阶段应该重新定义 milestone 范围。候选方向包括：

- 部署与运维硬化：家庭服务器/LXC/NAS 拓扑、环境变量、日志、备份、启动恢复。
- 真实歌库规模化导入：批量元数据修正、冲突处理、可观测性、导入失败恢复。
- TV 播放体验优化：首次播放用户手势引导、进度展示、播放异常提示和真实电视兼容性。
- 在线 provider 合规接入：真实 provider 边界、kill switch、缓存策略、审计记录。
- 产品化打磨：管理员/手机端 i18n 完整性、视觉密度、空状态和操作反馈。

## Constraints

- **Product scope**: 优先验证“稳定可唱”，复杂增强能力作为后续 milestone。
- **Interaction model**: 手机是唯一控制端，电视端不承载搜索和复杂操作。
- **Playback model**: 播放状态由服务端状态机裁决，避免手机端与电视端状态漂移。
- **Audio chain**: 软件不承担实时人声 DSP，由硬件完成混响、监听、EQ 和最终混音。
- **Media source**: 本地歌库为主，在线歌源只做补歌层。
- **Online playback**: 在线歌曲必须先缓存再播放。
- **Room model**: v1.0 只做单房间，但模型保留 `room`。
- **Search quality**: 中文搜索必须覆盖歌名、歌手、拼音、首字母、别名与繁简体。
- **Compliance**: 真实在线歌源接入需要先锁定 provider 合规边界。

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 中心服务端作为唯一业务真相 | 点歌、队列、切歌、重连恢复都依赖一致状态 | Good |
| TV Player 与 Mobile Controller 分离 | 符合真实 KTV 使用形态，职责边界清晰 | Good |
| 第一版只做单房间，但保留 `room` 数据模型 | 当前场景简单，同时避免未来多房间时推翻模型 | Good |
| 本地歌库优先，在线歌源作为补歌层 | 在线资源不稳定，不适合作为核心依赖 | Good |
| 在线歌曲采用“先缓存再播放” | 有利于稳定播放、失败恢复、资源复用与统一播放器逻辑 | Good |
| `Song` 与 `Asset` 分离建模 | 用户点的是“歌”，系统播的是“资源” | Good |
| 中文搜索优先做“搜得到且不混乱” | 点歌体验的基础优先于推荐和花哨排序 | Good |
| 软件不做实时麦克风 DSP | 避免延迟与复杂度，把音频效果交给硬件链路 | Good |
| 第一版优先使用受控静态资源 URL | 不让电视端直接依赖复杂在线解析流程 | Good |
| TypeScript monorepo | TV、Mobile、API、Worker 共享协议与类型 | Good |

## Evolution

This document evolves at milestone boundaries.

After each milestone:

1. Review whether the core value is still the right priority.
2. Move shipped requirements to Validated.
3. Define new Active requirements only when starting the next milestone.
4. Revisit Out of Scope items that are now candidates for milestone work.
5. Update Current State and Key Decisions.

---
*Last updated: 2026-05-08 after v1.0 milestone*
