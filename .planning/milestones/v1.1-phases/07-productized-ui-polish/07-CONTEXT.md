# Phase 7: Productized UI Polish - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 polishes the existing Admin, Mobile Controller, and TV Player UI into one consistent Chinese-first product experience. It covers visible copy, terminology, empty/error/loading/success feedback, button states, layout stability, information density, and focused UI regression/visual checks for the already-built single-room KTV flow.

This phase does not add new business capabilities, multi-room behavior, accounts, production deployment, real online providers, scoring, audio DSP, or broad code architecture restructuring. Phase 6 already handled TV playback-specific experience polish. Phase 8 owns larger API client, state hook, component boundary, and logic hardening work.

</domain>

<decisions>
## Implementation Decisions

### Chinese-First Copy and Terminology
- **D-01:** All three apps must default to Chinese. Admin and Mobile keep their existing language switches, and any touched TV copy stays Chinese-first.
- **D-02:** Phase 7 should remove mixed English/debug wording from key user-facing Chinese surfaces, including aria labels where they are visible to tests or assistive flows, status chips, task states, event summaries, online supplement metadata, current playback state, and vocal-mode labels.
- **D-03:** Use one cross-app glossary for shared terms: `电视在线/电视离线`, `点歌控制台`, `播放队列`, `当前播放/正在播放`, `原唱/伴唱`, `在线补歌`, `请求补歌`, `已准备`, `入库`, `刷新中`, `加载中`, `暂无...`.
- **D-04:** English remains supported where the existing switch exists, but the Chinese path is the primary product path and must be the default tested path.
- **D-05:** Do not introduce a full new i18n package in Phase 7 unless it is needed to remove meaningful duplication. A shared copy/glossary helper is allowed if it is small and improves consistency; larger i18n boundary work belongs to Phase 8.

### State Feedback Model
- **D-06:** Empty, loading, error, reconnecting, success, and disabled states should use consistent tone and hierarchy across Admin, Mobile, and TV: short title, useful detail only when needed, no raw backend codes as the primary message.
- **D-07:** Command feedback should be immediate and visible without requiring a page reload. Mobile queue/search/online supplement actions and Admin room task actions should update from command responses, realtime snapshots, or a targeted refresh.
- **D-08:** Busy buttons should keep stable width/height, show a localized in-progress label when the action may take noticeable time, and prevent duplicate submissions.
- **D-09:** Error messages may retain technical details as secondary text when useful for debugging, but the first line must be product copy in Chinese.
- **D-10:** Success feedback should be restrained. Prefer state changes, refreshed rows, short banners, or updated badges over modal confirmations unless the action is destructive.

### Mobile Controller Layout and Interactions
- **D-11:** Mobile polish should focus on real phone widths first. Search, current playback, queue rows, version rows, online supplement rows, and command buttons must not overflow, misalign, or place text off center.
- **D-12:** The mobile screen should remain a practical controller, not a marketing page. Keep dense but readable panels; avoid decorative hero sections or ornamental backgrounds.
- **D-13:** Search results must preserve the existing local-first behavior: local results appear before online candidates when both exist, and no-result online supplement empty states remain explicit.
- **D-14:** Online supplement candidate metadata must be localized or productized. Provider/raw state/risk labels should not look like unresolved debug tokens in the Chinese default path.
- **D-15:** Current playback state should present localized playback and vocal-mode information instead of exposing raw `playing`, `idle`, `unknown`, or similar backend enum values as visible text.

### Admin Layout and Interactions
- **D-16:** Admin remains an operational console with higher information density than Mobile. Polish should make imports, songs, rooms, online tasks, and recent events easier to scan without turning sections into decorative cards.
- **D-17:** Admin buttons for scanning, saving, approving, rejecting, refreshing, retrying, cleaning, and promoting must have stable disabled/busy states and clear localized failure feedback.
- **D-18:** Rooms view must continue to update online tasks and room status through realtime snapshots and targeted refreshes. Promote/retry/clean actions should reflect their result immediately enough that manual page reload is not needed.
- **D-19:** Admin task/event rows should productize status and event display. Raw provider IDs, task IDs, or event names can remain as secondary diagnostics, but should not be the primary label when a Chinese product label exists.
- **D-20:** Import and catalog views should keep the existing workbench/list-detail model; this phase tunes copy, spacing, empty states, and action feedback rather than redesigning the entire workflow.

### TV Consistency Scope
- **D-21:** TV should carry forward Phase 6's video-dominant layout, first-play prompt, `mm:ss / mm:ss` time text, and Chinese display model. Phase 7 only fixes copy/terminology inconsistencies or shared visual feedback gaps discovered while aligning the three apps.
- **D-22:** Do not rework TV playback runtime behavior or layout foundations unless a Phase 7 regression test exposes a visible product inconsistency.
- **D-23:** TV copy should stay suitable for living-room viewing: short, high-contrast, and not overloaded with admin-style diagnostic detail.

### Verification Expectations
- **D-24:** Add UI regression tests for default Chinese copy, language switch behavior, key button clickability, disabled/busy states, empty states, error states, and state changes after Mobile/Admin actions.
- **D-25:** Extend the lightweight visual-check approach where practical. Mobile/Admin checks should focus on non-overlap and stable layout at representative desktop and phone-sized viewports; TV visual checks should keep the Phase 6 baseline.
- **D-26:** Manual UAT instructions for Phase 7 should be in Chinese and should tell the user exactly what to open, what to click, and what visible content to verify.

### the agent's Discretion
- Exact glossary key names, copy wording, status chip colors, spacing tokens, and component extraction are left to planning/implementation as long as the decisions above hold.
- The planner may decide whether Mobile/Admin visual checks use the existing Chrome script style, component screenshots, or another lightweight browser check already compatible with the repo.
- The planner may decide how much duplicated i18n dictionary structure to centralize in Phase 7, but large state/API refactors must be deferred to Phase 8.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Requirements
- `.planning/ROADMAP.md` — Phase 7 goal, dependencies, success criteria, and planned breakdown.
- `.planning/REQUIREMENTS.md` — `PROD-01` through `PROD-05`; `QUAL-01` through `QUAL-04` are relevant background but belong primarily to Phase 8.
- `.planning/PROJECT.md` — v1.1 polish goal, single-room family KTV scope, Chinese-first Admin/Mobile state, and out-of-scope constraints.

### Prior Locked Decisions
- `.planning/phases/03-room-sessions-queue-control/03-CONTEXT.md` — Mobile is the only control surface, server snapshot is the source of truth, WebSocket is the main sync path, and Admin can refresh pairing tokens.
- `.planning/phases/04-search-song-selection/04-CONTEXT.md` — Chinese-first search, version-aware mobile selection, duplicate confirmation, and local-first song search behavior.
- `.planning/phases/05-online-supplement-recovery/05-CONTEXT.md` — Online supplement entry, task status flow, local-first ordering, Admin Rooms task recovery view, and ready/promoted task semantics.
- `.planning/phases/06-tv-playback-experience-polish/06-CONTEXT.md` — TV display hierarchy, first-play prompt, Chinese TV copy, transient feedback, and visual validation baseline.
- `.planning/phases/06-tv-playback-experience-polish/06-02-SUMMARY.md` — Implemented TV Chinese display model, first-play UI, bounded footer, and notice banner behavior.
- `.planning/phases/06-tv-playback-experience-polish/06-03-SUMMARY.md` — Implemented TV regression tests, Chrome visual screenshot helper, and Chinese UAT pattern.

### Architecture Guide
- `docs/KTV-ARCHITECTURE.md` §API 与实时协议设计 — Command / State / Event separation and server-authored snapshots.
- `docs/KTV-ARCHITECTURE.md` §Session Engine 状态机设计 — Server-side playback state, recovery, idempotency, and full-state recovery principles.
- `docs/KTV-ARCHITECTURE.md` §后台的角色定位 — Admin is a lightweight system-admin console, not a complex CMS.
- `docs/KTV-ARCHITECTURE.md` §第一版后台必须包含的能力 — Song library, import review, task viewing, and room operations.
- `docs/KTV-ARCHITECTURE.md` §在线缓存生命周期 — Online task status semantics that must be productized in Mobile/Admin.
- `docs/KTV-ARCHITECTURE.md` §`candidate.updated` / `system.notice` / `player.failed` — Event/status model relevant to UI feedback.

### Existing Admin UI
- `apps/admin/src/App.tsx` — Admin navigation, default Chinese provider, language switch, and view routing.
- `apps/admin/src/i18n.tsx` — Admin dictionary, language persistence, status/language/vocal helpers, and existing fallback behavior.
- `apps/admin/src/App.css` — Admin layout, buttons, status chips, workbench density, room/task/event rows, and responsive gaps.
- `apps/admin/src/imports/ImportWorkbench.tsx` — Import scan, status filters, candidate list/detail layout, loading/empty states, and mutation feedback points.
- `apps/admin/src/imports/CandidateEditor.tsx` — Candidate action buttons, metadata forms, conflict handling, and confirmation paths.
- `apps/admin/src/songs/SongCatalogView.tsx` — Catalog filters, song list/detail empty state, revalidation, song JSON validation, and status display.
- `apps/admin/src/songs/SongDetailEditor.tsx` — Formal song/resource editing and action feedback surface.
- `apps/admin/src/rooms/RoomStatusView.tsx` — Room summary, TV presence, pairing refresh, online task list, recent events, realtime snapshot handling, and task action refresh behavior.
- `apps/admin/src/test/import-workbench.test.tsx` — Existing import UI regression coverage.
- `apps/admin/src/test/song-catalog.test.tsx` — Existing catalog UI regression coverage.
- `apps/admin/src/test/room-status.test.tsx` — Existing room status, language, realtime, and task action regression coverage.

### Existing Mobile UI
- `apps/mobile-controller/src/App.tsx` — Mobile controller shell, current playback, queue, search, online supplement, dialogs, and button surfaces.
- `apps/mobile-controller/src/i18n.tsx` — Mobile dictionary, language persistence, vocal labels, and existing fallback behavior.
- `apps/mobile-controller/src/App.css` — Mobile layout, panels, buttons, badges, rows, modals, and small-width behavior.
- `apps/mobile-controller/src/runtime/use-room-controller.ts` — Mobile snapshot/session/realtime/search/command state handling that drives visible feedback.
- `apps/mobile-controller/src/test/controller.test.tsx` — Existing controller tests for language switching, search, queue actions, online supplement, reconnecting, and dialogs.

### Existing TV UI and Visual Checks
- `apps/tv-player/src/App.tsx` — TV app state routing and local notice merge.
- `apps/tv-player/src/screens/tv-display-model.ts` — Central TV display labels, first-play prompt copy, notice copy, and clock formatting.
- `apps/tv-player/src/screens/IdleScreen.tsx` — Idle QR and readiness screen.
- `apps/tv-player/src/screens/PlayingScreen.tsx` — Playing overlay, state/mode/time/next-song/QR layout.
- `apps/tv-player/src/components/PlaybackStatusBanner.tsx` — Transient feedback banner and notice copy.
- `apps/tv-player/src/test/tv-screen-states.test.tsx` — TV visible copy and state regression coverage.
- `scripts/tv-visual-check.mjs` — Existing dependency-light Chrome screenshot helper pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Admin and Mobile both already have `I18nProvider`, `LanguageSwitch`, `t()`, and localized dictionaries with default `zh`; Phase 7 can extend these without adding a new framework.
- Admin has `statusText()`, `languageName()`, and `vocalModeName()` helpers; Mobile has `vocalModeName()` but still exposes some raw state/aria copy in Chinese mode.
- TV already has `deriveTvDisplayState()`, `noticeCopyFor()`, and `formatPlaybackClock()` from Phase 6, making it the most mature copy/state model today.
- Existing Admin/Mobile tests already use Testing Library and user-event for language switching, buttons, realtime updates, task actions, search, and dialogs.
- `scripts/tv-visual-check.mjs` establishes a lightweight Chrome-based visual validation style that can be copied or generalized for Admin/Mobile without adding heavy dependencies.

### Established Patterns
- UI apps are React + TypeScript with direct CSS files and component-local rendering logic.
- Admin uses TanStack Query for import/catalog pages, while Rooms uses local state plus WebSocket/fallback polling.
- Mobile uses a runtime hook (`useRoomController`) for session restore, realtime snapshots, search debounce, command submission, and local dialogs.
- UI state is expected to follow server snapshots and command responses; frontends should not invent durable business state.
- Existing design is operational and compact: low-radius panels, restrained colors, dense rows, and no landing/marketing surface.

### Integration Points
- Admin copy polish connects through `apps/admin/src/i18n.tsx` plus visible raw enum rendering in `RoomStatusView.tsx`, `ImportWorkbench.tsx`, and `SongCatalogView.tsx`.
- Mobile copy polish connects through `apps/mobile-controller/src/i18n.tsx`, visible raw snapshot state in `App.tsx`, online candidate metadata rendering, and command error handling in `use-room-controller.ts`.
- Layout polish connects primarily through `apps/mobile-controller/src/App.css` and `apps/admin/src/App.css`.
- UI regression additions connect to `apps/admin/src/test/*.test.tsx`, `apps/mobile-controller/src/test/controller.test.tsx`, `apps/tv-player/src/test/*.test.tsx`, and any new visual script added under `scripts/`.
- Manual Phase 7 UAT should live in `.planning/phases/07-productized-ui-polish/07-UAT.md` once implementation plans complete.

</code_context>

<specifics>
## Specific Ideas

- 用户已经明确希望所有页面默认中文，同时保留语言切换能力。
- 用户之前多次反馈 Mobile 上“电视离线”、按钮文字不居中、在线补歌看不到/点击无反应、Admin task promote 后需要刷新等问题；Phase 7 应把这些变成产品化反馈和回归测试覆盖。
- TV 端 Phase 6 已经通过 UAT，Phase 7 不应重做 TV，只补齐术语一致性和可见回归测试。
- Mobile 是家庭唱歌时使用频率最高的交互面，优先保证手机宽度下点歌、队列、在线补歌、切歌、原伴唱切换都清楚、可点、状态即时。
- Admin 是运维控制台，应该安静、紧凑、可扫描，重点提升刷新/任务/异常反馈，而不是做大面积视觉重设计。

</specifics>

<deferred>
## Deferred Ideas

- 跨端 API client、状态 hook、i18n 边界、组件边界的大规模整理属于 Phase 8。
- 生产化部署、一键运维、备份恢复、真实 provider、多房间、账号、评分、录音、Android TV 原生壳和实时音频 DSP 都不属于 Phase 7。

</deferred>

---

*Phase: 07-productized-ui-polish*
*Context gathered: 2026-05-08*
