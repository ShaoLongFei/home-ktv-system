# Requirements: 家庭包厢式 KTV 系统 v1.1 Polish

**Defined:** 2026-05-08  
**Core Value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

## v1.1 Requirements

v1.1 不新增大范围产品能力，重点打磨 v1.0 已交付闭环的 TV 播放体验、产品化 UI、代码结构和回归质量。

### TV Playback Experience

- [x] **TVUX-01**: TV 端在空闲、播放中、加载中、播放失败、重连恢复和播放器冲突状态下都有清楚且一致的视觉状态。
- [x] **TVUX-02**: TV 播放中界面可以稳定展示当前歌曲、下一首、原唱/伴唱模式、播放状态和 `mm:ss / mm:ss` 时间信息。
- [x] **TVUX-03**: 当浏览器首次播放需要用户手势时，TV 端提供明确的可操作提示，并在用户完成操作后恢复正常播放流程。
- [x] **TVUX-04**: 原唱/伴唱切换、切歌、播放失败回退和重连恢复都能在 TV 端给出短暂但不干扰唱歌的反馈。
- [x] **TVUX-05**: TV 端布局在客厅电视距离下可读，二维码、歌曲信息、状态文案和时间信息不会互相遮挡。

### Productized UI

- [x] **PROD-01**: Admin、Mobile、TV 三端默认中文文案完整、一致，并保留可切换到英文的能力。
- [x] **PROD-02**: Admin、Mobile、TV 三端的空状态、错误状态、加载状态和成功反馈使用统一语气和一致的信息层级。
- [ ] **PROD-03**: Mobile 控制台的搜索、点歌、队列、当前播放、在线补歌和操作按钮在手机宽度下布局稳定，文字居中且不溢出。
- [x] **PROD-04**: Admin 后台的导入、歌曲、房间和在线任务视图在信息密度、按钮状态、刷新反馈和异常提示上保持一致。
- [ ] **PROD-05**: UI 回归测试覆盖关键中文文案、关键按钮可点击性、状态变化和空/错误状态展示。

### Code Structure & Logic

- [ ] **QUAL-01**: Mobile、Admin、TV 的 API client、状态 hook、i18n 和展示组件边界清晰，避免页面组件承载过多业务逻辑。
- [x] **QUAL-02**: 播放控制命令、房间快照、在线任务更新和错误处理的前后端状态流有统一的命名、结果处理和测试覆盖。
- [x] **QUAL-03**: TV 播放运行时的首播、切换、失败、重连和冲突逻辑有可读的模块边界和针对性回归测试。
- [x] **QUAL-04**: 项目移除明显重复、过时或调试遗留代码，并保留必要的开发脚本和文档入口。

## Future Requirements

Deferred candidates for later milestones.

### Deployment & Operations

- **OPS-01**: 系统可以在家庭服务器/LXC/NAS 拓扑中用生产化配置启动、恢复和查看日志。
- **OPS-02**: 系统可以备份和恢复数据库、歌库元数据、在线缓存任务和关键配置。

### Library Scale

- **LIBS-01**: 管理员可以高效处理大规模真实歌库导入、批量修正元数据和批量处理冲突。
- **LIBS-02**: 导入和歌库维护流程具备更强的可观测性、失败恢复和批处理能力。

### Online Provider

- **ONLP-01**: 系统可以接入真实在线 provider，并保留明确合规边界、kill switch、缓存审计和失败隔离。

## Out of Scope

| Feature | Reason |
|---------|--------|
| 多房间 / 多包厢 | v1.1 聚焦单房间体验和质量打磨，不扩大状态模型范围 |
| 用户账号体系 / 权限系统 | 当前家庭自用场景不需要，且会分散 Polish 目标 |
| 软件实时麦克风 DSP / 混响 / EQ | 音频效果链路继续交给硬件 |
| 唱歌评分、录音、AI 人声分离 | 属于娱乐增强，不影响 v1.1 的体验和质量目标 |
| 真实在线 provider 接入 | v1.1 只打磨现有 demo/local provider 边界和任务体验 |
| 部署生产化 | 重要但单独成体系，留给后续 ops milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TVUX-01 | Phase 9 | Complete |
| TVUX-02 | Phase 9 | Complete |
| TVUX-03 | Phase 9 | Complete |
| TVUX-04 | Phase 9 | Complete |
| TVUX-05 | Phase 9 | Complete |
| PROD-01 | Phase 9 | Complete |
| PROD-02 | Phase 9 | Complete |
| PROD-03 | Phase 10 | Pending |
| PROD-04 | Phase 9 | Complete |
| PROD-05 | Phase 10 | Pending |
| QUAL-01 | Phase 11 | Pending |
| QUAL-02 | Phase 9 | Complete |
| QUAL-03 | Phase 9 | Complete |
| QUAL-04 | Phase 9 | Complete |

**Coverage:**
- v1.1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-05-08*
*Last updated: 2026-05-09 after Phase 9 verification traceability closure*
