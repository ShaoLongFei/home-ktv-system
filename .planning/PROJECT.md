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

v1.1 Polish phases 6-11 已完成并验证：TV 播放体验、三端中文产品化 UI、运行时边界、回归测试、可视化验证和审计追踪缺口均已收口。v1.2 已完成并归档：真实 MV 的合同、扫描、旁路元数据、后台审核、正式歌库准入、搜索点歌、TV 播放、音轨切换、评审优先策略、既有 demo/local/online 兼容性和 Android TV 预留边界回归硬化均已收口。v1.3 正在启动，目标是把已建立的真实 KTV 索引和 NAS 媒体库接入产品实际运行链路，并完成真实部署和验证。

Milestone archives:

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
- `.planning/milestones/v1.1-ROADMAP.md`
- `.planning/milestones/v1.1-REQUIREMENTS.md`
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md`
- `.planning/milestones/v1.2-ROADMAP.md`
- `.planning/milestones/v1.2-REQUIREMENTS.md`
- `.planning/milestones/v1.2-MILESTONE-AUDIT.md`

## Current Milestone: v1.3 真实场景接入、部署和验证

**Goal:** 让手机搜索、点歌、后台诊断和 TV 播放实际使用已建立的 `ktv_*` 索引与 `/mnt/nas/KTV歌曲` 真实媒体库，并形成可重复部署与真实场景验证流程。

**Target features:**

- Mobile 搜索能查到真实索引库中的歌曲，并能区分正式歌库结果和 KTV 索引结果。
- 用户点选索引歌曲时，系统把选中的 `ktv_song_assets` 幂等同步成现有 `songs/assets` 正式运行记录，再复用现有队列和播放链路。
- API 能验证 PostgreSQL、`ktv_*` 表、NAS 路径映射、文件可读性和代表性媒体可服务状态。
- Admin 能查看真实索引状态、最新索引运行、有效资产数量、路径健康和真实部署诊断。
- 本地真实场景部署能通过一个清晰命令/profile 启动 API/Admin/TV/Mobile，并保留各端日志。
- 用户可以按 UAT 清单完成真实搜索、点歌、TV 播放、切歌、失败提示和恢复验证。

**Status:** requirements and roadmap created on 2026-05-14; ready for Phase 18 discussion.

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
- v1.2 validated real-MV catalog/player contracts, compatibility states, MediaInfo provenance, playback profiles, and platform-neutral audio-track boundaries.
- v1.2 validated MKV/MPG/MPEG scanner candidates with same-stem covers, same-stem `song.json`, MediaInfo-first metadata, filename fallback, conflict preservation, and unstable-file retry behavior.
- v1.2 validated Admin real-MV review and catalog admission: metadata editing, raw MediaInfo review, original/accompaniment track-role mapping, one Song plus one real-MV Asset, formal `song.json`, and repair guidance for unsupported or incomplete candidates.
- v1.2 validated real-MV Mobile search and queueing, backend-resolved vocal intent, explicit TV playback profiles and selected audio tracks, runtime-gated original/accompaniment switching, and clear preprocessing/failure states.
- v1.2 validated review-first hardening after real-MV integration: reserved auto-admit metadata stays inert, demo/local/online/Admin compatibility remains covered, local media hardening reports are portable, and Android TV remains a contract boundary only.
- v1.2 audit traceability gap was closed by Phase 17 with an aggregate Phase 12 verification and synced milestone metadata.

## Next Milestone Goals

- Use `$gsd-new-milestone` to define the next version once the real post-v1.2 priority is decided.
- Likely directions include actual real-song consumption/read paths, media processing support, or operational polish around the real library.

### Active

- [ ] 真实索引搜索接入：产品搜索能读取 `ktv_*` active assets，不再只依赖 demo/formal catalog。
- [ ] 索引歌曲点歌接入：KTV indexed asset 能安全、幂等进入现有 `songs/assets -> queue -> playback` 链路。
- [ ] 真实媒体路径接入：API 能解析并验证 NAS 路径，清楚区分索引可查、文件可读、浏览器可播和音轨可切。
- [ ] 真实部署接入：四端服务能用真实数据库和真实媒体库一键/单 profile 启动，日志和健康检查可排查。
- [ ] 真实场景验证：形成可重复 smoke/UAT 流程，证明搜索、点歌、播放、切歌和故障反馈闭环。

### Out of Scope

- 多房间 / 多包厢能力 — v1.0 明确只做单房间家庭场景，后续可作为新 milestone 评估。
- 用户账号体系 — v1.0 重点是设备控制与播放闭环，不引入非核心身份系统。
- 软件实时麦克风 DSP / 混响 / 回声 / EQ — 实时音频处理交给硬件链路。
- 唱歌评分、音高分析、AI 人声分离 — 不决定 v1.0 是否能稳定唱起来。
- 在线直通播放 — 与“本地主、在线辅、先缓存再播放”的稳定性原则冲突。
- 复杂后台 CMS — v1.0 后台只保留歌库、资源、设备与任务管理能力。

## Context

项目现在是一个 TypeScript monorepo，包含 Fastify API、React Admin、React Mobile Controller、React TV Player，以及共享 domain/protocol/player-contract packages。v1.0 的主线目标已经完成：家庭单房间场景可以从本地歌库出发完成导入、搜索、扫码、点歌、播放、切换、失败恢复和在线补歌任务闭环。

v1.1 已完成体验和质量打磨，不引入多房间、账号体系、评分、实时音频 DSP 或真实在线 provider。v1.2 的重点是让真实 MV 文件进入既有“扫描 -> 审核 -> 正式歌库 -> 搜索点歌 -> TV 播放”链路。

用户可以提供 MKV、MPG 格式的 MV 文件。每个 MV 文件代表一首歌，文件内通常包含两条音轨，分别用于原声和伴奏。歌曲信息优先从 MediaInfo 读取；文件旁边可以放封面图和 `song.json`，用于预览、补充和修正元数据。播放兼容性不通过系统强制转码解决：系统直接播放可播资源，不能播的文件由用户在服务端提前处理成浏览器或未来 Android TV 可支持的格式。

v1.3 的真实库基础已经存在：PostgreSQL 容器 `home-ktv-postgres` 中有 `ktv_index_runs`、`ktv_artists`、`ktv_songs`、`ktv_song_artists`、`ktv_song_assets`，真实媒体仍位于 NAS `/mnt/nas/KTV歌曲`。当前产品 runtime 仍主要依赖正式 `songs/assets` 表，因此 v1.3 的核心架构是“搜索读 `ktv_*`，点歌时按需同步到正式 `songs/assets`，播放继续复用现有队列和 TV 链路”。

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
| v1.2 优先做真实 MV 歌库，不做 Android TV 原生端 | 先稳定媒体合同、扫描审核和播放链路，Android TV 下个版本再接入会更可控 | Good |
| 一个真实 MV 文件入库为一个 Song 加一个 real-MV Asset | 与用户文件组织方式一致，避免同一 MV 被拆成原声/伴奏两首歌 | Good |
| 原声/伴奏使用审核后的 TrackRef 保存 | 保留 MediaInfo 原始证据，并给 Phase 15 runtime playback payload 留出稳定边界 | Good |
| 真实 MV 点歌不在手机端选择原声/伴奏 | 点歌沿用当前房间播放状态，服务端解析为 selectedTrackRef，避免手机点歌流程增加额外决策 | Good |
| 浏览器 TV 端音轨切换必须运行时确认 | 不假设所有 MKV/MPG 都可切音轨，成功后才提交状态，失败时回退并提示预处理 | Good |
| v1.3 搜索可读 `ktv_*`，但队列和播放继续使用正式 `songs/assets` | 避免让 `queue_entries`、TV snapshot、播放遥测和回退链路混入第二套 ID 体系 | Pending |
| v1.3 部署必须显式验证 NAS 路径可读性 | 数据库中的 `/mnt/nas/KTV歌曲` 路径不保证在所有 API 运行环境都可访问 | Pending |

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
*Last updated: 2026-05-14 after starting v1.3 milestone*
