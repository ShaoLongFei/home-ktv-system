# Roadmap: 家庭包厢式 KTV 系统

## Milestones

- [x] **v1.0 MVP** — 单房间家庭 KTV 可唱闭环，Phases 1-5，shipped 2026-05-08. Archive: `.planning/milestones/v1.0-ROADMAP.md`
- [ ] **v1.1 Polish** — TV 播放体验、产品化 UI、代码结构与逻辑打磨，Phases 6-8

## Overview

v1.1 不扩大产品边界，重点把 v1.0 已经跑通的家庭 KTV 闭环打磨到更适合长期使用。执行顺序先修 TV 播放体验，因为电视是家庭唱歌时最显眼的界面；随后统一三端 UI 与中文产品体验；最后整理代码结构、状态逻辑和测试，降低后续里程碑继续扩展时的维护成本。

## Phases

**Phase Numbering:**
- v1.0 completed Phases 1-5.
- v1.1 continues with Phases 6-8.
- Decimal phases remain reserved for urgent insertions.

- [x] **Phase 6: TV Playback Experience Polish** - 打磨 TV 播放、空闲、异常、首次播放和远距离观看体验
- [x] **Phase 7: Productized UI Polish** - 统一 Admin、Mobile、TV 的中文文案、状态反馈、视觉层级和关键交互
- [ ] **Phase 8: Code Structure & Logic Hardening** - 整理跨端状态流、播放/任务逻辑、组件边界和回归测试

## Phase Details

### Phase 6: TV Playback Experience Polish
**Goal**: 让 TV 端在真实客厅观看距离下清楚、稳定、少打扰地表达播放状态、歌曲信息、进度时间、入场二维码和异常恢复。
**Depends on**: v1.0 TV runtime, room snapshots, playback commands, realtime sync
**Requirements**: TVUX-01, TVUX-02, TVUX-03, TVUX-04, TVUX-05
**Success Criteria** (what must be TRUE):
  1. TV 空闲、播放中、加载中、失败、重连恢复、播放器冲突状态都有一致且清楚的视觉状态。
  2. 播放中界面稳定显示当前歌曲、下一首、原唱/伴唱模式、状态和 `mm:ss / mm:ss` 时间信息。
  3. 首次播放需要浏览器用户手势时，TV 提示用户可执行操作，并在操作完成后恢复正常播放流程。
  4. 切歌、原唱/伴唱切换、失败回退和重连恢复会给出短暂反馈，不遮挡主要播放体验。
  5. TV 页面在桌面浏览器和常见电视尺寸下没有二维码、状态文案、时间和歌曲信息重叠。
**Plans**: 3 plans

Plans:
- [x] 06-01: 建立 TV 播放体验状态模型、文案和视觉验收基线
- [x] 06-02: 实现 TV 空闲/播放/异常/首播提示和时间信息 UI 打磨
- [x] 06-03: 补齐 TV 体验回归测试、响应式截图验证和真实浏览器 UAT 脚本
**UI hint**: yes

### Phase 7: Productized UI Polish
**Goal**: 让 Admin、Mobile、TV 三端在中文文案、状态提示、空/错/加载状态、按钮反馈和视觉密度上形成一致的产品体验。
**Depends on**: Phase 6, v1.0 Admin/Mobile/TV UI, i18n helpers
**Requirements**: PROD-01, PROD-02, PROD-03, PROD-04, PROD-05
**Success Criteria** (what must be TRUE):
  1. 三端默认中文完整，关键页面和操作没有混杂英文、调试文案或不一致术语。
  2. 空状态、错误状态、加载状态和成功反馈在三端保持一致语气和信息层级。
  3. Mobile 控制台在手机宽度下搜索、队列、当前播放、在线补歌和按钮状态稳定且不溢出。
  4. Admin 导入、歌曲、房间、在线任务视图的按钮状态、刷新反馈、异常提示和信息密度一致。
  5. UI 回归测试覆盖关键中文文案、按钮可点击性、状态变化和空/错误状态。
**Plans**: 3 plans

Plans:
- [x] 07-01: 统一三端文案、状态术语、空/错/加载/成功反馈规范
- [x] 07-02: 打磨 Mobile 和 Admin 的关键布局、按钮状态、刷新反馈和异常提示
- [x] 07-03: 补齐 UI 回归测试和视觉检查脚本
**UI hint**: yes

### Phase 8: Code Structure & Logic Hardening
**Goal**: 整理 v1.0 快速交付过程中形成的跨端状态流、API client、播放控制、在线任务和 UI 组件边界，让后续迭代更可维护。
**Depends on**: Phase 6, Phase 7
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. Mobile、Admin、TV 的页面组件不再承载过多业务逻辑，API client、状态 hook、i18n 和展示组件边界更清楚。
  2. 播放控制命令、房间快照、在线任务更新和错误处理使用一致的命名、结果处理和测试策略。
  3. TV 首播、切换、失败、重连和冲突逻辑有清晰模块边界和针对性回归测试。
  4. 明显重复、过时或调试遗留代码被清理；保留的开发脚本和文档入口清楚可用。
  5. `pnpm typecheck` 和 `pnpm test` 作为 v1.1 收口前的质量门禁持续通过。
**Plans**: 3 plans

Plans:
- [ ] 08-01: 梳理跨端 API client、状态 hook、i18n 和展示组件边界
- [ ] 08-02: 统一播放控制、房间快照、在线任务更新和错误处理逻辑
- [ ] 08-03: 清理遗留代码、补齐回归测试并执行全量质量门禁
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. TV Playback Experience Polish | 3/3 | Complete | 2026-05-08 |
| 7. Productized UI Polish | 3/3 | Complete | 2026-05-09 |
| 8. Code Structure & Logic Hardening | 0/3 | Not started | - |
