# Phase 6: TV Playback Experience Polish - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 only polishes the TV Player playback experience for the existing single-room KTV flow. It must make idle, loading, playing, failed, recovering, conflict, and first-play blocked states clear, stable, readable from a living-room distance, and minimally disruptive while singing.

This phase does not add new queue capabilities, multi-room behavior, accounts, production deployment, real online providers, scoring, audio DSP, or broad cross-app UI restructuring. Phase 7 owns productized UI consistency across Admin/Mobile/TV. Phase 8 owns larger code boundary hardening.

</domain>

<decisions>
## Implementation Decisions

### TV Information Hierarchy
- **D-01:** Keep the TV view video-dominant. Playback overlays must be restrained, stable, and positioned so the MV/lyrics remain the primary surface.
- **D-02:** The playing view must persistently show current song, artist, next song, vocal mode, playback state, and `mm:ss / mm:ss` time text. Do not introduce a progress bar for Phase 6.
- **D-03:** The idle view keeps a large QR entry surface. The playing view keeps the existing small corner QR affordance, but it must not compete with song information or status feedback.
- **D-04:** New or revised TV-facing copy should default to Chinese in this phase. Full three-app copy consistency and language-switch polish remain Phase 7 scope.

### State Presentation
- **D-05:** TV states must be modeled from `RoomSnapshot.state`, `RoomSnapshot.notice`, conflict data, and runtime playback results. The TV should not invent a separate business state that can drift from the server truth.
- **D-06:** `idle`, `loading`, `playing`, `recovering`, `error/offline`, and `conflict` need visually consistent state treatments, with clear hierarchy between persistent page states and short transient feedback.
- **D-07:** Offline/error and conflict states are persistent until the underlying state changes. They should be productized and actionable without exposing raw technical internals as the main message.
- **D-08:** Local runtime notices are allowed only as temporary UI feedback layered on top of the latest server snapshot; they should not overwrite long-lived server state.

### First-Play Browser Gesture
- **D-09:** When browser autoplay blocks the first song, the TV must show an explicit actionable prompt such as "点击电视开始播放" instead of silently staying idle or implying playback has started.
- **D-10:** The first-play prompt should be prominent enough to be seen from the couch and should disappear after the user clicks/taps/presses the TV page and playback resumes.
- **D-11:** Do not hide the browser limitation behind fake autoplay success. Continue reporting the blocked state through existing telemetry so Admin/Mobile can stay consistent with TV behavior.

### Playback Feedback
- **D-12:** Successful vocal switch, skip, reconnect, and similar transitions should use short, non-blocking feedback. They must not obscure the song title, QR, or main video for long.
- **D-13:** Failure feedback should include both the problem and the recovery result, for example that playback failed and the system skipped or restarted as applicable.
- **D-14:** Vocal-mode switching remains a normal playback control, not a dangerous action. The TV should reflect the final mode clearly and show switch failure/revert feedback when rollback happens.
- **D-15:** During switch or reconnect polish, reduce visible time regressions where practical. The visible time text should favor a stable user perception over exposing every intermediate runtime jump.

### Living-Room Readability
- **D-16:** Optimize for desktop Chrome connected to a TV, carrying forward the Phase 1 target. The primary validation baseline is 1920x1080 plus a smaller desktop viewport such as 1366x768.
- **D-17:** Song title, artist, next song, status, time, and QR must have stable layout constraints so long Chinese/English text wraps or truncates professionally without overlap.
- **D-18:** Avoid decorative visual effects that compete with playback or make the TV surface harder to read. The phase should feel like a practical KTV screen, not a marketing page.

### Verification Expectations
- **D-19:** Add focused tests for TV rendering states, first-play blocked prompt behavior, time text, notice severity, conflict/offline screens, and switch/recovery feedback.
- **D-20:** Include real-browser visual validation for the TV screen at the Phase 6 baseline viewports. Screenshots should specifically check for non-overlap and readable information hierarchy.

### the agent's Discretion
- Exact component decomposition, CSS implementation, Chinese wording, feedback animation timing, and iconography can be decided during planning/implementation as long as the decisions above hold.
- The planner may decide whether to implement the first-play prompt as a full-screen gate, a centered overlay, or a state-specific panel, provided it is clearly actionable and does not permanently block normal playback.
- The planner may decide whether visual validation uses existing test tooling or a new lightweight Playwright script, provided the verification covers common desktop/TV dimensions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Requirements
- `.planning/ROADMAP.md` — Phase 6 goal, dependencies, success criteria, and planned breakdown.
- `.planning/REQUIREMENTS.md` — `TVUX-01` through `TVUX-05`; `QUAL-03` is relevant background but belongs primarily to Phase 8.
- `.planning/PROJECT.md` — Single-room family KTV scope, TV/Mobile split, server-authoritative playback state, local-first media model, and v1.1 polish goal.

### Prior Locked Decisions
- `.planning/phases/01-media-contract-tv-runtime/01-CONTEXT.md` — Web TV first, future Android TV shell boundary, idle large QR, playing small QR, playback failure/conflict/recovery UX, and strict vocal switch expectations.
- `.planning/phases/03-room-sessions-queue-control/03-CONTEXT.md` — WebSocket as main sync path, server state as source of truth, queue command semantics, and mobile as the only control surface.
- `.planning/phases/05-online-supplement-recovery/05-CONTEXT.md` — Playback failure should recover by skipping when appropriate and show both reason and result.

### Architecture Guide
- `docs/KTV-ARCHITECTURE.md` §API 与实时协议设计 — Command / State / Event separation and TV reporting facts instead of deciding business state.
- `docs/KTV-ARCHITECTURE.md` §Session Engine 状态机设计 — Server-side playback state, recovery, idempotency, and full-state recovery principles.
- `docs/KTV-ARCHITECTURE.md` §二维码展示策略 — Idle large QR and playing corner QR options.
- `docs/KTV-ARCHITECTURE.md` §TV Player 冲突处理 — Single active TV Player conflict behavior.
- `docs/KTV-ARCHITECTURE.md` §原唱 / 伴唱切换策略 — Dual-resource switching, same-position re-entry, and rollback expectations.
- `docs/KTV-ARCHITECTURE.md` §在线歌源的失败回退策略 — Failure fallback principles relevant to TV feedback.

### Existing TV Runtime and Tests
- `packages/player-contracts/src/index.ts` — `RoomSnapshot`, `PlaybackTarget`, `PlaybackNotice`, `PlayerConflictState`, and recovery/switch contracts.
- `apps/tv-player/src/App.tsx` — TV app state routing, local notice merge, first-play blocked telemetry, heartbeat, recovery, and switch synchronization.
- `apps/tv-player/src/screens/IdleScreen.tsx` — Current idle screen and large QR layout.
- `apps/tv-player/src/screens/PlayingScreen.tsx` — Current playing overlay, time text, vocal mode, next-song, and corner QR layout.
- `apps/tv-player/src/screens/ConflictScreen.tsx` — Current TV conflict presentation.
- `apps/tv-player/src/components/PlaybackStatusBanner.tsx` — Current notice banner and fallback copy.
- `apps/tv-player/src/runtime/active-playback-controller.ts` — Runtime autoplay/blocked/playback start boundary.
- `apps/tv-player/src/runtime/switch-controller.ts` — Vocal switch commit/revert runtime behavior.
- `apps/tv-player/src/runtime/recovery-controller.ts` — Reconnect recovery runtime behavior.
- `apps/tv-player/src/runtime/use-room-snapshot.ts` — Snapshot bootstrap, realtime sync, and polling fallback.
- `apps/tv-player/src/test/playing-screen.test.tsx` — Existing rendering coverage for vocal mode and `mm:ss / mm:ss`.
- `apps/tv-player/src/test/app-runtime.test.tsx` — Existing runtime coverage for switch ordering, ended telemetry, playing telemetry, and autoplay blocked telemetry.
- `apps/tv-player/src/test/playback-status-banner.test.tsx` — Existing notice rendering coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PlayingScreen`: already renders current song, artist, vocal mode, next song, time text, and corner QR; Phase 6 should evolve it rather than replace it wholesale.
- `IdleScreen`: already provides the large QR entry state; Phase 6 can refine copy, spacing, and readiness/status language.
- `ConflictScreen`: already isolates active-player conflict into a dedicated screen; Phase 6 should productize the copy and visual state.
- `PlaybackStatusBanner`: existing notice component can become the shared transient feedback surface for loading, recovery, switch failure, skip/failure, and first-play-adjacent notices.
- `PairingQr`: existing large/corner variants support the Phase 1 QR decisions.
- `DualVideoPool`, `ActivePlaybackController`, `SwitchController`, and `RecoveryController`: existing runtime boundary for playback start, switch, rollback, and reconnect behavior.

### Established Patterns
- TV app uses React function components with inline `CSSProperties` style objects.
- `RoomSnapshot` is the main TV state input; realtime WebSocket updates are preferred, with polling fallback.
- `App.tsx` merges temporary local notices into the latest snapshot instead of changing server state.
- Runtime playback reports facts through telemetry (`loading`, `playing`, `ended`, `switch_failed`, recovery notices), matching the architecture rule that TV reports facts and the server decides state.
- Existing tests use Vitest and Testing Library for component/runtime behavior.

### Integration Points
- First-play prompt connects to `ActivePlaybackController.ensurePlaying()` returning `blocked` in `App.tsx`.
- Time display currently uses active video `currentTime` and duration fallback in `App.tsx`, then renders in `PlayingScreen`.
- Switch feedback connects to `SwitchController.switchVocalMode()` results and `RoomSnapshot.targetVocalMode`.
- Reconnect feedback connects to `RecoveryController.recover()` and `PlaybackNotice`.
- Persistent offline/error/conflict presentation connects through `renderScreen()` in `App.tsx` and `RoomSnapshot.conflict`.

</code_context>

<specifics>
## Specific Ideas

- 用户已经明确不需要进度条，只需要稳定展示 `mm:ss / mm:ss`。
- 首次点歌不能自动播放是浏览器网页端限制，Phase 6 应把这个限制变成清楚的 TV 可操作提示，而不是继续让用户误以为系统坏了。
- 播放中原唱 / 伴唱切换的目标仍然是尽量接近无感；如果做不到，也要避免明显黑屏、明显回退或让用户不知道最终模式。
- TV 屏幕重点是远距离可读、状态清楚、少打扰，不追求装饰性大改。

</specifics>

<deferred>
## Deferred Ideas

- 三端完整中文文案、语言切换体验、按钮状态和跨端 UI 术语统一属于 Phase 7。
- 跨端 API client、状态 hook、i18n、播放控制模块边界的大范围整理属于 Phase 8。
- Android TV 原生壳、电视遥控器适配、生产化部署、备份恢复、真实在线 provider、唱歌评分、录音和实时音频 DSP 都不属于 Phase 6。

</deferred>

---

*Phase: 06-tv-playback-experience-polish*
*Context gathered: 2026-05-08*
