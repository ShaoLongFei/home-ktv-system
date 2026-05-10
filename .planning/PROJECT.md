# 家庭包厢式 KTV 系统

## What This Is

这是一个面向家庭客厅场景的单房间包厢式 KTV 系统。电视只负责全屏播放和入场展示，手机是唯一控制端，中心服务端统一管理点歌、队列、播放状态、本地歌库和在线补歌任务。

## Core Value

在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

## Current State

v1.1 Polish 已于 2026-05-10 shipped。系统已经具备：

- TV Player 绑定、全屏播放、播放遥测、重连恢复、播放器冲突保护和原唱/伴唱切换。
- 本地歌库扫描、导入审核、正式歌库准入、`song.json` 校验和后台歌库维护。
- 扫码入场、控制会话恢复、多手机实时同步、点歌、删歌、顶歌、切歌和播放中原唱/伴唱切换。
- 中文优先搜索，覆盖歌名、歌手、拼音、首字母、别名、搜索提示和多版本点歌选择。
- 在线补歌候选、先缓存后播放任务流、失败回退、后台恢复视图和任务级重试/清理/转正。
- Admin 和 Mobile 默认中文界面，并保留语言切换能力。

v1.1 Polish phases 6-11 已完成并验证：TV 播放体验、三端中文产品化 UI、运行时边界、回归测试、可视化验证和审计追踪缺口均已收口。v1.2 聚焦先生成热门歌曲候选名单，用于后续决定哪些网盘歌曲值得下载补入歌库。

Milestone archives:

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v1.1-ROADMAP.md`
- `.planning/milestones/v1.1-REQUIREMENTS.md`
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md`

## Current Milestone: v1.2 热门歌曲候选名单

**Goal:** 单次运行脚本，从音乐平台和可用 KTV 榜单来源拉取歌曲名单，生成一份可排序的热门 KTV 候选歌曲列表。

**Target features:**

- 支持单次运行，不做历史比较、不生成新增差异报告。
- 优先接入 KTV 更相关的榜单来源；如果公开来源不足，再补 QQ 音乐、网易云、酷狗等流媒体榜单/歌单。
- 合并同名同歌手歌曲，按来源类型、榜单排名、多平台出现次数生成分数。
- 输出 Markdown、CSV、JSON 排名列表，包含 `rank`、`title`、`artist`、`score`、`sources`、`sourceRanks` 等 review 信息。
- 为后续每周运行、增量比较和 OpenList 匹配预留稳定候选 ID 与结构化 source evidence，但不在第一步实现这些工作流。
- 暂不接 OpenList 文件匹配，也不自动下载。

## Requirements

### Validated

- v1.0 validated controlled media contracts, TV runtime binding, playback telemetry, switch rollback, reconnect behavior, and explicit player conflict handling.
- v1.0 validated local library scanning, import candidate review, strict formal catalog admission, `song.json` consistency validation, and admin maintenance for songs/resources.
- v1.0 validated QR entry, control-session restore, realtime room-state fanout, queue commands, current-song controls, and admin pairing-token refresh.
- v1.0 validated Chinese-first song search by title, artist, pinyin, initials, aliases, and search hints, plus version-aware mobile song selection.
- v1.0 validated local-first online supplement, cache-before-play boundaries, playback failure recovery, and admin recovery operations.
- v1.1 validated TV playback state readability, progress time display, first-play guidance, switch feedback, and responsive TV layout.
- v1.1 validated Chinese-first product polish across Admin, Mobile, and TV, including empty/error/loading states and key action feedback.
- v1.1 validated clearer runtime boundaries for Mobile, Admin, and TV, including Phase 11 Admin Import/Songs runtime hooks for `QUAL-01`.

### Active

- [ ] 单次运行脚本可以从配置的公开榜单/歌单来源和手工快照文件收集歌曲元数据。
- [ ] KTV/K歌相关来源优先于普通流媒体热榜，QQ 音乐 `K歌金曲榜` 和手工 CAVCA 金麦榜可作为高权重来源。
- [ ] 歌曲候选可以保留原始来源证据，并进行保守的中文标题、歌手、版本标记归一化与去重。
- [ ] 候选歌曲可以按 KTV 相关性、多来源共识、榜单新鲜度、元数据可信度和噪音惩罚生成确定性分数。
- [ ] 输出 Markdown、CSV、JSON 和 source health report，作为后续人工下载/补歌决策依据。

### Out of Scope

- 多房间 / 多包厢能力 — v1.0 明确只做单房间家庭场景，后续可作为新 milestone 评估。
- 用户账号体系 — v1.0 重点是设备控制与播放闭环，不引入非核心身份系统。
- 软件实时麦克风 DSP / 混响 / 回声 / EQ — 实时音频处理交给硬件链路。
- 唱歌评分、音高分析、AI 人声分离 — 不决定 v1.0 是否能稳定唱起来。
- 在线直通播放 — 与“本地主、在线辅、先缓存再播放”的稳定性原则冲突。
- 复杂后台 CMS — v1.0 后台只保留歌库、资源、设备与任务管理能力。

## Context

项目现在是一个 TypeScript monorepo，包含 Fastify API、React Admin、React Mobile Controller、React TV Player，以及共享 domain/protocol/player-contract packages。v1.0 的主线目标已经完成：家庭单房间场景可以从本地歌库出发完成导入、搜索、扫码、点歌、播放、切换、失败恢复和在线补歌任务闭环。

v1.1 已完成体验和质量打磨，不引入多房间、账号体系、评分、实时音频 DSP 或真实在线 provider。v1.2 的重点是先回答“哪些歌曲值得补入本地 KTV 歌库”，再由后续 milestone 连接 OpenList 文件匹配、下载任务和每周增量比较。

用户已经能通过 OpenList 看到百度网盘中的大量歌曲资源，但十几万首里只有少部分会被家庭 KTV 场景实际使用。v1.2 需要优先利用 KTV 点唱/唱歌相关榜单；当公开 KTV 来源不足时，再用 QQ 音乐、网易云音乐、酷狗音乐等平台榜单作为补充信号。第一步只要求单次运行生成 review artifacts，不做历史比较、调度、OpenList 匹配或自动下载。

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
| v1.1 优先打磨体验和结构，不扩大产品边界 | 让 v1.0 可唱闭环从“能用”提升到“稳定、清楚、顺手、可维护” | Good |
| 保持 app-local runtime hook，不急于抽共享状态包 | 当前跨端重复还不足以抵消 shared package 的抽象和维护成本 | Good |
| Mobile visual check 默认走配对 URL | 临时 Chrome profile 无法依赖已有 cookie，必须用 tokenized controller URL 验证真实控制台状态 | Good |
| Admin Import/Songs 运行时逻辑收敛到 feature-local hooks | 关闭 QUAL-01 审计缺口，同时避免引入产品行为变化 | Good |
| v1.2 先做单次热门歌曲候选名单，不做增量比较和自动下载 | 先验证来源、去重和评分质量，再把名单接入 OpenList 下载链路 | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

After each phase transition:

1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. "What This Is" still accurate? Update if drifted.

After each milestone:

1. Review whether the core value is still the right priority.
2. Move shipped requirements to Validated.
3. Define new Active requirements only when starting the next milestone.
4. Revisit Out of Scope items that are now candidates for milestone work.
5. Update Current State and Key Decisions.

---
*Last updated: 2026-05-10 after creating v1.2 热门歌曲候选名单 roadmap*
