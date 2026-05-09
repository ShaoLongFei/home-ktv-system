# Roadmap: 家庭包厢式 KTV 系统

## Milestones

- [x] **v1.0 MVP** — 单房间家庭 KTV 可唱闭环，Phases 1-5，shipped 2026-05-08. Archive: `.planning/milestones/v1.0-ROADMAP.md`
- [ ] **v1.1 Polish** — TV 播放体验、产品化 UI、代码结构与逻辑打磨，Phases 6-11

## Overview

v1.1 不扩大产品边界，重点把 v1.0 已经跑通的家庭 KTV 闭环打磨到更适合长期使用。执行顺序先修 TV 播放体验，因为电视是家庭唱歌时最显眼的界面；随后统一三端 UI 与中文产品体验；再整理代码结构、状态逻辑和测试；最后用 Phase 9-11 关闭里程碑审计发现的 verification、visual check、Admin runtime boundary 缺口。

## Phases

**Phase Numbering:**
- v1.0 completed Phases 1-5.
- v1.1 continues with Phases 6-11.
- Decimal phases remain reserved for urgent insertions.

- [x] **Phase 6: TV Playback Experience Polish** - 打磨 TV 播放、空闲、异常、首次播放和远距离观看体验
- [x] **Phase 7: Productized UI Polish** - 统一 Admin、Mobile、TV 的中文文案、状态反馈、视觉层级和关键交互
- [x] **Phase 8: Code Structure & Logic Hardening** - 整理跨端状态流、播放/任务逻辑、组件边界和回归测试
- [ ] **Phase 9: Verification & Traceability Closure** - 补齐 Phase 6-8 verification、summary frontmatter 和 requirements traceability
- [ ] **Phase 10: Paired Mobile Visual Verification** - 让 Mobile visual check 覆盖已配对控制台状态
- [ ] **Phase 11: Admin Runtime Boundary Completion** - 收敛 Admin Import/Songs 页面剩余运行时边界

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
- [x] 08-01: 梳理跨端 API client、状态 hook、i18n 和展示组件边界
- [x] 08-02: 统一播放控制、房间快照、在线任务更新和错误处理逻辑
- [x] 08-03: 清理遗留代码、补齐回归测试并执行全量质量门禁
**UI hint**: no

### Phase 9: Verification & Traceability Closure
**Goal**: 关闭 v1.1 milestone audit 中的 phase-level verification 和 requirements 三源对齐缺口，让 Phase 6-8 的验收证据可被 GSD 审计可靠读取。
**Depends on**: Phase 6, Phase 7, Phase 8, `.planning/v1.1-MILESTONE-AUDIT.md`
**Requirements**: TVUX-01, TVUX-02, TVUX-03, TVUX-04, TVUX-05, PROD-01, PROD-02, PROD-04, QUAL-02, QUAL-03, QUAL-04
**Gap Closure**: Closes audit gaps for missing `06-VERIFICATION.md`, `07-VERIFICATION.md`, `08-VERIFICATION.md`, missing `08-SUMMARY.md` requirements frontmatter, and stale requirements traceability.
**Success Criteria** (what must be TRUE):
  1. Phase 6 has `06-VERIFICATION.md` with requirement-by-requirement evidence for TVUX-01 through TVUX-05.
  2. Phase 7 has `07-VERIFICATION.md` with requirement-by-requirement evidence for PROD-01, PROD-02, and PROD-04 plus cross-references to Phase 10 for PROD-03/PROD-05 visual coverage.
  3. Phase 8 has `08-VERIFICATION.md` with requirement-by-requirement evidence for QUAL-02 through QUAL-04 plus cross-reference to Phase 11 for QUAL-01 boundary completion.
  4. `08-SUMMARY.md` has valid YAML frontmatter with `requirements-completed` that GSD summary extraction can read.
  5. `.planning/REQUIREMENTS.md` checkboxes and traceability statuses reflect verified completion or pending gap-closure phases accurately.
**Plans**: TBD
**UI hint**: no

### Phase 10: Paired Mobile Visual Verification
**Goal**: Fix the Phase 7 visual-check gap so Mobile screenshots exercise the paired controller state rather than only the unpaired/error state.
**Depends on**: Phase 7, Phase 9, local dev launcher, control-session/pairing flow
**Requirements**: PROD-03, PROD-05
**Gap Closure**: Closes audit integration gap `G-1` and flow gap `visual-check-mobile-paired-state`.
**Success Criteria** (what must be TRUE):
  1. `scripts/ui-visual-check.mjs` can capture a paired Mobile controller state in a deterministic local run.
  2. The script or UAT docs clearly describe how the pairing token/session is obtained for visual validation.
  3. Mobile visual coverage still captures the existing phone-width viewports and fails clearly when services are unavailable.
  4. Regression tests or script help checks cover the paired-state behavior without requiring manual guesswork.
**Plans**: TBD
**UI hint**: yes

### Phase 11: Admin Runtime Boundary Completion
**Goal**: Close the remaining QUAL-01 structure gap by extracting Admin Import/Songs runtime query and mutation orchestration out of page components.
**Depends on**: Phase 8, Phase 9
**Requirements**: QUAL-01
**Gap Closure**: Closes audit tech-debt item for `ImportWorkbench.tsx` and `SongCatalogView.tsx` carrying too much runtime logic.
**Success Criteria** (what must be TRUE):
  1. Import workbench scan/list/load-error/pending behavior is behind a focused Admin hook or runtime module.
  2. Song catalog list/detail/default-asset/load-error behavior is behind a focused Admin hook or runtime module.
  3. Existing Admin UI labels, layout, and busy/error behavior stay unchanged.
  4. Admin tests and typecheck continue passing, and Phase 8 runtime-boundary intent is reflected in verification evidence.
**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. TV Playback Experience Polish | 3/3 | Complete | 2026-05-08 |
| 7. Productized UI Polish | 3/3 | Complete | 2026-05-09 |
| 8. Code Structure & Logic Hardening | 3/3 | Complete | 2026-05-09 |
| 9. Verification & Traceability Closure | 0/TBD | Not started | - |
| 10. Paired Mobile Visual Verification | 0/TBD | Not started | - |
| 11. Admin Runtime Boundary Completion | 0/TBD | Not started | - |
