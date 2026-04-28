# Requirements: 家庭包厢式 KTV 系统

**Defined:** 2026-04-28
**Core Value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

## v1 Requirements

Requirements for the initial release. These map to roadmap phases and stay constrained to a single-room, local-first MVP.

### Library & Catalog

- [ ] **LIBR-01**: 管理员可以扫描配置好的本地歌库和导入目录，并生成待处理的候选入库结果
- [ ] **LIBR-02**: 管理员可以审核候选导入项，确认歌手、歌名、语种、原唱/伴唱等元数据，并对每项执行入库、搁置或拒绝
- [ ] **LIBR-03**: 系统可以将用户看到的 `Song` 与实际播放的 `Asset` 分离建模，使一首歌可以关联多个批准的可播放版本
- [ ] **LIBR-04**: 只有同时具备已验证原唱版与伴唱版、且正式资源状态为 `ready` 的歌曲才会进入正式歌库主路径
- [ ] **LIBR-05**: 管理员可以在入库后修改歌曲、歌手、默认资源和资源可用状态
- [ ] **LIBR-06**: 系统可以校验原唱版与伴唱版是否满足同版本、同时轴的正式入库规则，并将不合格资源标记为 `review-required` 或拒绝入库

### Search

- [ ] **SRCH-01**: 用户可以按中文歌名关键词搜索可点歌曲
- [ ] **SRCH-02**: 用户可以按歌手名搜索可点歌曲
- [ ] **SRCH-03**: 用户可以按拼音全拼、拼音首字母、别名或预设 `searchHints` 搜索可点歌曲
- [ ] **SRCH-04**: 搜索结果可以清楚区分本地可播歌曲与在线补歌候选

### Pairing & Controller Sessions

- [ ] **PAIR-01**: 用户可以通过扫描电视上的二维码进入 `living-room` 控制页，二维码必须携带房间上下文和短时有效的 `pairingToken`
- [ ] **PAIR-02**: 用户进入控制页后可以立即看到当前播放状态、当前队列和电视在线状态
- [ ] **PAIR-03**: 已建立的控制会话在短时刷新或短时断线后可以恢复，而无需重新扫码
- [ ] **PAIR-04**: 多个手机控制端可以同时加入同一个房间并共享同一套实时状态

### Queue Control

- [ ] **QUEU-01**: 用户可以从手机端将一首本地可播歌曲加入点歌队列
- [ ] **QUEU-02**: 当一首歌存在多个可播版本时，用户可以在点歌前选择具体资源版本；原唱/伴唱切换通过播放中控制完成
- [ ] **QUEU-03**: 用户可以从手机端删除尚未播放的队列项
- [ ] **QUEU-04**: 用户可以把已点歌曲上移或顶到更靠前的位置
- [ ] **QUEU-05**: 用户可以从手机端切掉当前正在播放的歌曲
- [ ] **QUEU-06**: 用户可以从手机端对当前正在播放的歌曲触发原唱 / 伴唱切换

### Playback & Session

- [ ] **PLAY-01**: TV Player 可以稳定绑定到 `living-room`，接收服务端的播放目标状态，并在重连后优先恢复到接近原进度的正确播放目标
- [ ] **PLAY-02**: TV Player 可以全屏播放目标资源，并展示当前歌曲、下一首和用于手机入场的二维码
- [ ] **PLAY-03**: TV Player 可以向服务端上报心跳、加载中、开始播放、播放结束和播放失败等事实状态
- [ ] **PLAY-04**: 队列顺序、当前播放目标和播放器状态在手机端与电视端之间始终以服务端会话状态为唯一真相
- [ ] **PLAY-05**: 当当前资源播放失败时，系统可以自动切换到同曲目的备用可用资源，或回退到下一首并向控制端提示原因
- [ ] **PLAY-06**: 当第二个 TV Player 试图接管同一个房间时，系统不会静默切换，而是明确暴露播放器冲突状态
- [ ] **PLAY-07**: TV Player 可以在当前歌曲播放过程中在一对已验证的原唱 / 伴唱资源之间近乎无感地切换，并在切换失败时回退到切换前模式并提示用户

### Online Supplement

- [ ] **ONLN-01**: 当本地歌库无法满足点歌需求时，用户可以主动请求在线补歌候选
- [ ] **ONLN-02**: 用户可以把一个在线候选提交到“先缓存、后播放”的流程，而不是直接在线播放
- [ ] **ONLN-03**: 在线候选只有在生成受控且 `ready` 的资源后才可以进入正式点歌队列
- [ ] **ONLN-04**: 管理员可以查看在线候选任务状态、重试失败任务、清理失败任务，并把合适的缓存资源转正为正式歌库内容

### Admin Operations

- [ ] **ADMN-01**: 管理员可以在后台浏览歌曲和资源，并查看歌词模式、原唱/伴唱模式、资源状态等维护信息
- [ ] **ADMN-02**: 管理员可以在后台查看房间状态、当前队列、当前 TV Player、在线控制端数量和最近播放事件
- [ ] **ADMN-03**: 管理员可以查看二维码 / `pairingToken` 状态，并主动刷新房间入场令牌

## v2 Requirements

Deferred features acknowledged by research or the architecture note, but intentionally kept out of the current roadmap.

### Discovery & Convenience

- **DISC-01**: 用户可以按歌手、语种、热门榜单、收藏或历史记录浏览歌曲
- **DISC-02**: 用户可以查看最近唱过的歌曲并一键重新点唱

### Advanced Singing Controls

- **CTRL-02**: 用户可以在受支持的资源与硬件链路下调整歌曲升降调
- **LYRC-01**: TV Player 可以提供比硬字幕更丰富的外部歌词展示与高亮体验

### Online & Multi-Room Expansion

- **ONLN-05**: 系统可以在合规前提下自动完成更多在线歌曲的获取、缓存与转正
- **ROOM-01**: 系统可以支持多个房间的独立播放器、独立队列和独立扫码入场流程
- **AUTH-01**: 系统可以区分访客控制与管理员控制等更细粒度权限

### Entertainment Features

- **ENTR-01**: 系统可以支持评分、录音或对战等娱乐玩法
- **ENTR-02**: 系统可以提供更丰富的 KTV 氛围视觉效果或派对模式

## Out of Scope

Explicit exclusions for the current roadmap.

| Feature | Reason |
|---------|--------|
| 软件实时麦克风 DSP / 混响 / 回声 / EQ | 音频效果链路明确交给硬件，避免软件与硬件重复处理 |
| AI 人声分离 / 自动修音 | 复杂度高且不影响第一版是否能稳定唱起来 |
| 在线直通播放 | 与“本地主、在线辅、先缓存再播放”的稳定性原则冲突 |
| 浏览器内复杂媒体编辑器 | 不是第一版核心闭环，维护成本过高 |
| 企业级 RBAC / 多角色审批流 | 当前主要是家庭自用系统，不值得在 MVP 提前承受复杂度 |

## Traceability

Which phases cover which requirements. This will be updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LIBR-01 | Phase 2 | Pending |
| LIBR-02 | Phase 2 | Pending |
| LIBR-03 | Phase 1 | Pending |
| LIBR-04 | Phase 2 | Pending |
| LIBR-05 | Phase 2 | Pending |
| LIBR-06 | Phase 2 | Pending |
| SRCH-01 | Phase 4 | Pending |
| SRCH-02 | Phase 4 | Pending |
| SRCH-03 | Phase 4 | Pending |
| SRCH-04 | Phase 4 | Pending |
| PAIR-01 | Phase 3 | Pending |
| PAIR-02 | Phase 3 | Pending |
| PAIR-03 | Phase 3 | Pending |
| PAIR-04 | Phase 3 | Pending |
| QUEU-01 | Phase 3 | Pending |
| QUEU-02 | Phase 4 | Pending |
| QUEU-03 | Phase 3 | Pending |
| QUEU-04 | Phase 3 | Pending |
| QUEU-05 | Phase 3 | Pending |
| QUEU-06 | Phase 3 | Pending |
| PLAY-01 | Phase 1 | Pending |
| PLAY-02 | Phase 1 | Pending |
| PLAY-03 | Phase 1 | Pending |
| PLAY-04 | Phase 3 | Pending |
| PLAY-05 | Phase 5 | Pending |
| PLAY-06 | Phase 1 | Pending |
| PLAY-07 | Phase 1 | Pending |
| ONLN-01 | Phase 5 | Pending |
| ONLN-02 | Phase 5 | Pending |
| ONLN-03 | Phase 5 | Pending |
| ONLN-04 | Phase 5 | Pending |
| ADMN-01 | Phase 2 | Pending |
| ADMN-02 | Phase 5 | Pending |
| ADMN-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-28*
*Last updated: 2026-04-28 after initialization*
