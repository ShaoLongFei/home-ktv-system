# Roadmap: 家庭包厢式 KTV 系统

## Overview

这条路线围绕“先稳定唱起来，再扩功能”展开。先建立受控媒体模型、播放中原唱/伴唱切换契约和 TV 播放基础，再把本地歌库整理成满足正式准入规则的可信目录，随后交付扫码入场与手机点歌控制，最后再把中文搜索、在线补歌和运维恢复能力叠加上去。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Media Contract & TV Runtime** - 建立受控媒体模型、切换契约和 TV 播放基础
- [ ] **Phase 2: Library Ingest & Catalog Admin** - 让本地歌库可扫描、可审核、并按切换准入规则维护
- [ ] **Phase 3: Room Sessions & Queue Control** - 交付扫码入场、多人控制、播放中切换和服务端权威队列
- [ ] **Phase 4: Search & Song Selection** - 交付中文优先搜索和版本感知的点歌体验
- [ ] **Phase 5: Online Supplement & Recovery** - 增加安全补歌、失败回退和运维恢复能力

## Phase Details

### Phase 1: Media Contract & TV Runtime
**Goal**: 建立单房间 KTV 的核心媒体与切换契约，让系统能把一对已验证的原唱/伴唱资源稳定地推送到 `living-room` TV Player，并完成播放中切换、恢复和冲突处理主链路
**Depends on**: Nothing (first phase)
**Requirements**: LIBR-03, PLAY-01, PLAY-02, PLAY-03, PLAY-06, PLAY-07
**Success Criteria** (what must be TRUE):
  1. 运维者可以把 `living-room` TV Player 绑定到房间，并在重连后恢复到正确的播放目标
  2. 一对已验证的原唱/伴唱资源可以在电视端全屏稳定播放，并显示当前歌曲、下一首占位和扫码入场二维码
  3. 服务端可以接收到 TV Player 的心跳、加载、播放、结束和失败上报
  4. TV Player 可以在当前歌曲播放过程中近乎无感地完成原唱/伴唱切换，并在失败时回退到切换前模式
  5. 第二个 TV Player 尝试接管同一房间时不会静默成功，而是暴露明确的冲突状态
**Plans**: 3 plans

Plans:
- [x] 01-01: 建立 monorepo、共享 domain/protocol 包和基础数据存储骨架
- [x] 01-02: 落地 `Song` / `Asset` / `Room` / `PlaybackSession` / `switchFamily` 模型与受控资源访问层
- [x] 01-03: 落地 TV Player 绑定、播放中切换、心跳、恢复与冲突状态循环
**UI hint**: yes

### Phase 2: Library Ingest & Catalog Admin
**Goal**: 让本地歌库从“磁盘文件”变成可审核、可维护、并满足正式切换准入规则的歌曲目录
**Depends on**: Phase 1
**Requirements**: LIBR-01, LIBR-02, LIBR-04, LIBR-05, LIBR-06, ADMN-01
**Success Criteria** (what must be TRUE):
  1. 管理员可以扫描本地歌库与导入目录，并在用户可见目录之外看到待审核候选
  2. 管理员可以修正候选项的歌手、歌名、语种和原唱/伴唱信息，并决定入库、搁置或拒绝
  3. 只有满足同版本、同时轴和双资源就绪规则的歌曲会进入正式歌库主路径
  4. 接近合格但未达正式标准的资源会进入 `review-required`，明显不合格的资源会被拒绝
  5. 已批准歌曲会成为可维护的正式目录项，并允许修改默认资源与可用状态
**Plans**: 6 plans

Plans:
- [x] 02-01: 建立歌库导入的数据库、领域和明细契约
- [x] 02-02: 实现扫描、探测、候选生成和调度启动
- [x] 02-03: 实现导入审核、搁置、拒绝删除和准入 API
- [x] 02-04: 实现导入优先的后台审核工作台
- [x] 02-05: 实现正式歌库维护 API 和 song.json 一致性校验
- [x] 02-06: 实现正式歌库维护后台界面
**UI hint**: yes

### Phase 3: Room Sessions & Queue Control
**Goal**: 让用户可以扫码进入房间，并通过服务端状态机安全地共享点歌、切歌和播放中原唱/伴唱切换控制
**Depends on**: Phase 1, Phase 2
**Requirements**: PAIR-01, PAIR-02, PAIR-03, PAIR-04, QUEU-01, QUEU-03, QUEU-04, QUEU-05, QUEU-06, PLAY-04, ADMN-03
**Success Criteria** (what must be TRUE):
  1. 用户可以扫描电视二维码进入正确的 `living-room` 控制页并立即看到实时房间状态
  2. 多个手机控制端可以同时查看同一套队列与播放状态，而不出现本地状态漂移
  3. 用户可以从手机端完成点歌、删歌、顶歌、切歌和播放中原唱/伴唱切换，并让电视端和其他手机实时一致地更新
  4. 控制会话在短时刷新或短时断线后可以恢复，管理员也可以轮换房间入场令牌
**Plans**: 3 plans

Plans:
- [ ] 03-01: 实现二维码配对、`pairingToken` 和控制会话生命周期
- [ ] 03-02: 实现服务端权威 Session Engine 与队列命令处理
- [ ] 03-03: 实现多控制端实时同步、当前歌曲控制和 TV 状态闭环
**UI hint**: yes

### Phase 4: Search & Song Selection
**Goal**: 让用户可以用中文优先的方式快速找到正确歌曲，并在多版本情况下选到想唱的那一版
**Depends on**: Phase 2, Phase 3
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, QUEU-02
**Success Criteria** (what must be TRUE):
  1. 用户可以按中文歌名、歌手、拼音、首字母和别名搜到可点歌曲
  2. 搜索结果可以明确区分本地可播歌曲和在线补歌候选
  3. 同一首歌存在多个批准版本时，用户可以在点歌前选择正确的资源版本，且不会把播放中原唱/伴唱切换误建模成点歌前一次性选择
  4. 原始导入数据和未就绪资源不会污染手机端的正式搜索体验
**Plans**: 2 plans

Plans:
- [ ] 04-01: 构建中文优先搜索读模型、索引字段与排序规则
- [ ] 04-02: 构建版本感知的搜索结果与点歌选择流程
**UI hint**: yes

### Phase 5: Online Supplement & Recovery
**Goal**: 在不破坏本地优先稳定性的前提下，补上安全补歌、失败回退和运维恢复能力
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: ONLN-01, ONLN-02, ONLN-03, ONLN-04, PLAY-05, ADMN-02
**Success Criteria** (what must be TRUE):
  1. 当本地歌库缺歌时，用户可以发起在线补歌请求并看到候选进入缓存流程
  2. 在线候选只有在形成受控且 `ready` 的资源后才会变成可播放队列项
  3. 当前歌曲播放失败时，系统可以切换备用资源或安全跳过，并向控制端说明原因
  4. 管理员可以查看房间状态、播放器事件和在线任务状态，并执行重试、清理或资源转正
**Plans**: 3 plans

Plans:
- [ ] 05-01: 实现在线候选发现、缓存队列和 ready 资源生成
- [ ] 05-02: 实现播放失败回退、任务重试和资源转正流
- [ ] 05-03: 实现房间/播放器/在线任务的运维恢复视图
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Media Contract & TV Runtime | 3/3 | Awaiting UAT | - |
| 2. Library Ingest & Catalog Admin | 6/6 | Complete | 2026-04-30 |
| 3. Room Sessions & Queue Control | 0/3 | Not started | - |
| 4. Search & Song Selection | 0/2 | Not started | - |
| 5. Online Supplement & Recovery | 0/3 | Not started | - |
