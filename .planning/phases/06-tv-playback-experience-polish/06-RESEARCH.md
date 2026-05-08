# Phase 06: TV Playback Experience Polish - Research

**Researched:** 2026-05-08
**Domain:** React TV playback UI polish, browser video runtime feedback, room snapshot state presentation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- Exact component decomposition, CSS implementation, Chinese wording, feedback animation timing, and iconography can be decided during planning/implementation as long as the decisions above hold.
- The planner may decide whether to implement the first-play prompt as a full-screen gate, a centered overlay, or a state-specific panel, provided it is clearly actionable and does not permanently block normal playback.
- The planner may decide whether visual validation uses existing test tooling or a new lightweight Playwright script, provided the verification covers common desktop/TV dimensions.

### Deferred Ideas (OUT OF SCOPE)
- 三端完整中文文案、语言切换体验、按钮状态和跨端 UI 术语统一属于 Phase 7。
- 跨端 API client、状态 hook、i18n、播放控制模块边界的大范围整理属于 Phase 8。
- Android TV 原生壳、电视遥控器适配、生产化部署、备份恢复、真实在线 provider、唱歌评分、录音和实时音频 DSP 都不属于 Phase 6。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TVUX-01 | TV 端在空闲、播放中、加载中、播放失败、重连恢复和播放器冲突状态下都有清楚且一致的视觉状态。 | Use `RoomSnapshot.state`, `RoomSnapshot.notice`, `RoomSnapshot.conflict`, `useRoomSnapshot.status`, and local runtime notices to route persistent screens vs transient banners. |
| TVUX-02 | TV 播放中界面可以稳定展示当前歌曲、下一首、原唱/伴唱模式、播放状态和 `mm:ss / mm:ss` 时间信息。 | `PlayingScreen` already renders current song, artist, next song, vocal mode, and time; plan should preserve this surface and add explicit playback state labeling/copy. |
| TVUX-03 | 当浏览器首次播放需要用户手势时，TV 端提供明确的可操作提示，并在用户完成操作后恢复正常播放流程。 | `ActivePlaybackController.ensurePlaying()` returns `blocked`; `App.tsx` already sends `loading` telemetry and retries on `pointerdown`. Add a visible first-play prompt and test that it clears after resume. |
| TVUX-04 | 原唱/伴唱切换、切歌、播放失败回退和重连恢复都能在 TV 端给出短暂但不干扰唱歌的反馈。 | Existing `PlaybackStatusBanner`, `SwitchController`, `RecoveryController`, and `PlaybackNoticeKind` are the correct integration points; avoid blocking modals for normal feedback. |
| TVUX-05 | TV 端布局在客厅电视距离下可读，二维码、歌曲信息、状态文案和时间信息不会互相遮挡。 | Component CSS must use fixed rails, max widths, truncation/wrap constraints, and real Chrome checks at 1920x1080 and 1366x768. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Product scope prioritizes stable singing over adding broad new capabilities.
- Mobile is the only control surface; TV must not add search or complex playback controls.
- Playback business state is server-authoritative; TV reports facts and displays snapshots.
- Software does not do realtime vocal DSP; original/instrumental mode is resource switching, not audio processing.
- Local library is primary; online supplement remains auxiliary and cache-before-play.
- Room model remains present even though v1.1 is single-room.
- Chinese search and product copy are important, but Phase 6 only owns TV-facing copy touched in this phase.
- Before file-changing work, stay within the GSD workflow; this research artifact is part of the requested GSD phase workflow.
- Follow existing codebase patterns until stronger conventions are mapped.

## Summary

Phase 6 should be planned as a focused TV polish pass over an already functional runtime, not as a playback architecture rewrite. The current TV player already has the important boundaries: `App.tsx` routes server snapshots to screens, merges local notices over the latest snapshot, reports autoplay-blocked/loading/playing telemetry, retries after pointer input, and delegates switch/recovery behavior to dedicated runtime controllers.

The planner should preserve the server-authoritative model and improve the TV-facing state layer: Chinese copy, persistent state screens, non-blocking feedback, first-play blocked prompt, stable time display, and layout constraints for couch-distance readability. The highest-risk implementation areas are long text/QR/status overlap, local notices accidentally masking persistent error/conflict state, and visual validation relying only on happy-dom tests.

**Primary recommendation:** Reuse the existing React/Vite/Vitest TV stack; add small presentational/state-derivation helpers around current components, and verify layout in real Chrome at 1920x1080 and 1366x768.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React / React DOM | 19.2.5 | TV screen rendering | Already used by `@home-ktv/tv-player`; no need for a new UI framework. |
| Vite | 8.0.10 | TV dev/build server | Existing app build/dev baseline with `vite.config.ts` host/port config. |
| TypeScript | 6.0.3 root, app uses `tsc` | Shared type safety across contracts and TV runtime | Prevents contract drift between `RoomSnapshot`, runtime controllers, and UI screens. |
| `@home-ktv/player-contracts` | workspace | Playback snapshot, notice, conflict, target contracts | The TV state surface must be typed from these contracts, not duplicated locally. |
| `qrcode` | 1.5.4 | QR module generation | Already used by `PairingQr`; keep QR rendering centralized. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 4.1.5 | Unit/component/runtime regression tests | Use for TV rendering states, first-play prompt, notices, switch, and recovery behavior. |
| Testing Library React | 16.3.2 | Component assertions | Use for accessible copy/status checks and screen-state rendering assertions. |
| happy-dom | 20.9.0 | Vitest DOM environment | Use for fast component tests; do not rely on it for visual overlap/layout validation. |
| Desktop Chrome | `/Applications/Google Chrome.app` present | Real-browser visual validation | Use for baseline screenshots/UAT at 1920x1080 and 1366x768. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing inline `CSSProperties` | CSS modules or design-system extraction | Defer broad styling abstraction to Phase 7/8 unless a tiny helper removes real duplication. |
| Existing Vitest stack | Add Playwright | Playwright is not currently installed. Add only if Plan 06-03 chooses automated browser screenshots; otherwise use documented Chrome UAT screenshots. |
| Existing `PairingQr` | Canvas/image QR renderer | Current module-grid QR is testable and sufficient; replacing it risks churn without solving Phase 6 issues. |

**Installation:** No new package is required for the core Phase 6 UI polish.

```bash
pnpm install
```

**Version verification:** Versions were verified from `package.json`, `pnpm list --filter @home-ktv/tv-player --depth 0`, and `pnpm -F @home-ktv/tv-player exec vitest --version` on 2026-05-08. No registry lookup was needed because the task is constrained to local code evidence.

## Architecture Patterns

### Recommended Project Structure

Keep changes inside the existing TV app boundary:

```text
apps/tv-player/src/
├── App.tsx                         # Snapshot routing, local runtime notices, gesture retry, telemetry boundary
├── screens/
│   ├── IdleScreen.tsx              # Large QR idle/readiness state
│   ├── PlayingScreen.tsx           # Video-dominant now-playing overlay and footer metrics
│   └── ConflictScreen.tsx          # Persistent conflict state
├── components/
│   ├── PairingQr.tsx               # Central QR renderer
│   └── PlaybackStatusBanner.tsx    # Shared transient status/notice feedback
├── runtime/                        # Playback, switching, recovery, snapshot sync controllers
└── test/                           # Focused Vitest regression tests
```

### Pattern 1: Snapshot-Derived Screen State

**What:** Render persistent TV states from `useRoomSnapshot.status`, `RoomSnapshot.state`, `RoomSnapshot.conflict`, and `RoomSnapshot.notice`.

**When to use:** All idle/loading/playing/recovering/error/conflict UI decisions.

**Example:**

```tsx
// Source: apps/tv-player/src/App.tsx
if (snapshot.conflict) {
  return <ConflictScreen conflict={snapshot.conflict} />;
}

if (snapshot.state === "playing" || snapshot.state === "loading" || snapshot.state === "recovering") {
  return <PlayingScreen snapshot={snapshot} playbackPositionMs={playbackPositionMs} durationMs={durationMs} />;
}

return <IdleScreen pairing={snapshot.pairing} />;
```

**Planning implication:** Add helper functions only if they make this mapping clearer. Do not create a parallel TV-only business state enum.

### Pattern 2: Local Runtime Notices Overlay Server Snapshot

**What:** Local runtime notices may temporarily decorate the latest server snapshot.

**When to use:** Autoplay blocked prompts, switch failure/revert messages, recovery results, and short transition feedback.

**Example:**

```tsx
// Source: apps/tv-player/src/App.tsx
function mergeLocalNotice(snapshot: RoomSnapshot | null, localNotice: PlaybackNotice | null): RoomSnapshot | null {
  if (!snapshot || !localNotice) {
    return snapshot;
  }

  return {
    ...snapshot,
    notice: localNotice
  };
}
```

**Planning implication:** Add timeout/clearing behavior for transient notices, but never let local notices hide `conflict`, offline, or server `error` as the main state.

### Pattern 3: First-Play Blocked as Prompt + Telemetry

**What:** Browser autoplay rejection is a runtime fact. It should produce visible TV action copy and still be reported as telemetry.

**When to use:** `ActivePlaybackController.ensurePlaying()` returns `{ status: "blocked" }`.

**Example:**

```tsx
// Source: apps/tv-player/src/App.tsx
if (result.status === "blocked") {
  setLocalNotice({
    kind: "loading",
    message: "Playback is ready. Click the TV page once to start the song."
  });
  await sendPlaybackTelemetryOnce({ stage: "autoplay_blocked", ... });
}
```

**Planning implication:** Replace the English local notice with a prominent Chinese actionable prompt such as `点击电视开始播放`, clear it after successful `playing`, and keep the telemetry path intact.

### Pattern 4: Video-Dominant Layout With Stable Rails

**What:** Treat the MV as the primary surface; overlays should have predictable top/bottom rails and bounded text.

**When to use:** `PlayingScreen`, `PlaybackStatusBanner`, QR placement, and state panels.

**Example:**

```tsx
// Source: apps/tv-player/src/screens/PlayingScreen.tsx
<div style={styles.topRail}>
  <PlaybackStatusBanner notice={snapshot.notice} />
  <PairingQr pairing={snapshot.pairing} variant="corner" />
</div>
```

**Planning implication:** Make status, QR, and footer measurements stable before copy polish. Use `minWidth: 0`, max widths, line clamping/truncation, and predictable grid columns where text can grow.

### Anti-Patterns to Avoid

- **Parallel TV state machine:** It will drift from the server and violates project constraints. Use snapshot state plus transient UI-only notice state.
- **Replacing the TV runtime during polish:** The current runtime already handles dual video, switch rollback, recovery, telemetry, and snapshot sync. Plan small targeted changes.
- **Blocking modal for normal transitions:** Switch/reconnect/skip feedback should be short and non-blocking.
- **Progress bar creep:** Explicitly out of scope for Phase 6; use stable `mm:ss / mm:ss` text only.
- **Only happy-dom for layout confidence:** happy-dom does not validate real browser text wrapping, QR overlap, or viewport composition.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Playback business truth | A TV-local state enum/state machine | `RoomSnapshot.state`, `RoomSnapshot.notice`, `RoomSnapshot.conflict` | Server state machine is the source of truth. |
| QR encoding/rendering | Ad hoc QR drawing or external image generation | Existing `PairingQr` + `qrcode` | Already tested and supports large/corner variants. |
| Vocal-mode switch runtime | Single-video src swapping in the UI layer | `SwitchController` + `DualVideoPool` | Existing code preloads standby, commits, rolls back, and reports telemetry. |
| Reconnect recovery | UI guessing resume/restart behavior | `RecoveryController` + backend `ReconnectRecoveryResult` | Backend decides recovery result; TV displays it. |
| Autoplay handling | Fake successful playback state | `ActivePlaybackController.ensurePlaying()` blocked result + prompt + telemetry | Keeps Admin/Mobile consistent with real browser behavior. |
| Visual layout validation | DOM unit tests pretending to verify TV readability | Real Chrome viewport screenshots/UAT | Actual text/QR overlap is a browser rendering concern. |

**Key insight:** Phase 6 complexity is not in new algorithms; it is in preserving the existing playback contracts while making state, copy, timing, and layout clear from a living-room distance.

## Common Pitfalls

### Pitfall 1: Local Notice Masks Persistent State

**What goes wrong:** A temporary message remains visible across conflict/offline/error transitions.

**Why it happens:** `mergeLocalNotice()` blindly overlays `notice` when one exists.

**How to avoid:** Clear local notices on target/session/state transitions where they are no longer relevant, and render conflict/offline before playing-state overlays.

**Warning signs:** Conflict screen still shows playback prompt, or offline screen looks like a recoverable loading notice.

### Pitfall 2: Autoplay Block Looks Like Idle

**What goes wrong:** The TV has a selected song but appears idle or "loading forever" because browser gesture is required.

**Why it happens:** The blocked result is reported as loading telemetry but current UI only has a small banner message.

**How to avoid:** Plan a prominent first-play prompt tied to blocked runtime result and pointer/keyboard retry.

**Warning signs:** Test can assert telemetry was sent but cannot find `点击电视开始播放` or equivalent prompt.

### Pitfall 3: Long Titles Break the TV Overlay

**What goes wrong:** Chinese/English titles, next-song text, status copy, QR, and time overlap at 1366x768.

**Why it happens:** Current footer uses `auto auto 1fr`, title size is 108px, and QR/status share a top rail without browser screenshot coverage.

**How to avoid:** Set explicit layout budgets, use `minWidth: 0`, bounded line counts/truncation, and verify both target viewports.

**Warning signs:** A long next-song title pushes time/mode boxes, or corner QR competes with status banner.

### Pitfall 4: Time Display Regresses During Switch/Recovery

**What goes wrong:** Visible time jumps backward or flashes `00:00 / 00:00` during standby/recovery transitions.

**Why it happens:** `durationMs` depends on active video duration, and `playbackPositionMs` updates from the active video immediately.

**How to avoid:** Plan stable display-time derivation: clamp impossible negative values, use snapshot resume position while video duration is unknown, and suppress brief regressions around switch/recovery when practical.

**Warning signs:** Tests pass for a static time pair but manual switch UAT shows obvious time reset.

### Pitfall 5: Copy Polish Exceeds Phase Boundary

**What goes wrong:** Implementation grows into cross-app i18n, Admin/Mobile terminology, or language-switch infrastructure.

**Why it happens:** Phase 6 touches Chinese copy but Phase 7 owns full productized copy consistency.

**How to avoid:** Change only TV-facing text needed for this phase; leave shared i18n/component boundary work to Phase 7/8.

**Warning signs:** Plan includes Admin/Mobile copy audits or shared i18n refactors.

## Code Examples

### Existing Time Text Pattern

```tsx
// Source: apps/tv-player/src/screens/PlayingScreen.tsx
<span style={styles.metricValue}>
  {formatTime(playbackPositionMs)} / {formatTime(durationMs ?? 0)}
</span>
```

Use this as the base, but plan how unknown duration should display so first-load/recovery does not misleadingly show `00:00 / 00:00` for long.

### Existing Switch Failure Feedback

```tsx
// Source: apps/tv-player/src/App.tsx
if (result.status === "reverted") {
  input.setLocalNotice({
    kind: "switch_failed_reverted",
    message: result.message
  });
}
```

Keep switch failure as a transient TV notice and preserve rollback telemetry from `SwitchController`.

### Existing Recovery Notice Flow

```tsx
// Source: apps/tv-player/src/App.tsx
void recoveryController.recover({ roomSlug: snapshot.roomSlug, deviceId: client.deviceId }).then((result) => {
  setLocalNotice(result.notice);
});
```

Display the recovery result in product copy; do not let TV infer a different recovery outcome from video behavior alone.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| English TV demo copy | Chinese TV-facing copy for touched states | Phase 6 decision, 2026-05-08 | Plan copy updates in TV only; full cross-app consistency remains Phase 7. |
| Small banner for autoplay blocked | Couch-visible actionable first-play prompt | Phase 6 decision, 2026-05-08 | Prevents users from thinking playback is broken on first song. |
| Static component tests for layout | Real Chrome visual validation at 1920x1080 and 1366x768 | Phase 6 decision, 2026-05-08 | Catches overlap that happy-dom cannot. |
| Exposing every runtime jump | Stable user-perceived time text | Phase 6 decision, 2026-05-08 | Reduces perceived glitches during switch/recovery. |

**Deprecated/outdated:**
- English default TV state copy in touched components: replace with practical Chinese TV copy for Phase 6 states.
- Treating `loading` as enough for autoplay block: blocked playback needs explicit action copy.
- Decorative atmosphere competing with playback: keep overlays restrained and video-dominant.

## Open Questions

1. **Should visual validation be automated or manual for Phase 6?**
   - What we know: Chrome is available locally; Playwright is not installed in `@home-ktv/tv-player`.
   - What's unclear: Whether the planner wants a new dev dependency for repeatable screenshots.
   - Recommendation: Start with documented Chrome UAT screenshots; add Playwright only in Plan 06-03 if automation is needed.

2. **How should unknown duration render?**
   - What we know: Current code renders `durationMs ?? 0`, which can show `00:00`.
   - What's unclear: Exact desired Chinese copy for unknown duration.
   - Recommendation: Plan a small formatting decision such as `00:12 / --:--` or preserving target duration when known; test it.

3. **How long should transient notices stay visible?**
   - What we know: Current local notices do not have an explicit TTL.
   - What's unclear: Exact timing preference.
   - Recommendation: Use short, non-blocking windows around 2-4 seconds for success/recovery feedback, while failures may remain slightly longer but still not override persistent states.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Build/test/dev server | yes | v25.8.0 installed; project docs cite Node 24 LTS | Use installed Node for local planning; flag if CI requires Node 24. |
| pnpm | Workspace commands | yes | 10.33.2 | None needed. |
| Vitest | TV automated tests | yes | 4.1.5 | None needed. |
| Vite | TV dev server / preview | yes | 8.0.10 | None needed. |
| Google Chrome | Real-browser TV screenshots/UAT | yes | App present at `/Applications/Google Chrome.app` | Browser command may need explicit app path on macOS. |
| Playwright | Optional automated screenshots | no | Not installed for tv-player | Use manual Chrome screenshots, or add Playwright in Plan 06-03 if chosen. |
| ffmpeg | Demo media generation if needed for UAT | yes | 8.1 | Existing seeded media script can use it if visual/video demo data is needed. |

**Missing dependencies with no fallback:**
- None for research/planning. Automated screenshot testing is not currently available unless a plan adds Playwright.

**Missing dependencies with fallback:**
- Playwright: fallback is manual Chrome visual validation at required viewports.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/06-tv-playback-experience-polish/06-CONTEXT.md` - locked Phase 6 decisions, scope, and verification expectations.
- `.planning/REQUIREMENTS.md` - TVUX-01 through TVUX-05 requirement definitions.
- `.planning/ROADMAP.md` - Phase 6 goal, success criteria, and planned breakdown.
- `.planning/PROJECT.md` and `CLAUDE.md` - project constraints: single-room, mobile-only control, server-authoritative playback, local-first media.
- `apps/tv-player/src/App.tsx` - state routing, local notice merge, autoplay-blocked telemetry, gesture retry, switch/recovery hooks.
- `apps/tv-player/src/screens/PlayingScreen.tsx` - current now-playing overlay, time text, vocal mode, next song, corner QR.
- `apps/tv-player/src/screens/IdleScreen.tsx` - current large QR idle surface.
- `apps/tv-player/src/screens/ConflictScreen.tsx` - current conflict screen.
- `apps/tv-player/src/components/PlaybackStatusBanner.tsx` - current notice kinds/copy surface.
- `apps/tv-player/src/components/PairingQr.tsx` - QR variants and `qrcode` use.
- `apps/tv-player/src/runtime/*.ts` - playback, switch, recovery, snapshot, and video-pool runtime contracts.
- `packages/player-contracts/src/index.ts` - `RoomSnapshot`, `PlaybackNotice`, `PlaybackTarget`, `PlayerConflictState`, `ReconnectRecoveryResult`, and switch contracts.
- `apps/tv-player/src/test/*` - existing Vitest coverage for time text, notice rendering, runtime telemetry, switch rollback, recovery, QR, client, heartbeat, and snapshot sync.
- `docs/KTV-ARCHITECTURE.md` - command/state/event separation, server-authoritative state, QR strategy, conflict strategy, switch and recovery principles.

### Secondary (MEDIUM confidence)

- Local environment probes on 2026-05-08: `pnpm list --filter @home-ktv/tv-player --depth 0`, `pnpm -F @home-ktv/tv-player exec vitest --version`, `node --version`, `pnpm --version`, `/Applications/Google Chrome.app`, and `ffmpeg -version`.

### Tertiary (LOW confidence)

- None. Web research was not needed; local code and planning artifacts were sufficient.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all recommended libraries are already installed and used by the TV app.
- Architecture: HIGH - current code directly matches the project architecture: TV displays snapshots and reports runtime facts.
- Pitfalls: HIGH - derived from current code paths, existing tests, and Phase 6 locked decisions.
- Visual validation approach: MEDIUM - Chrome is available, but automated screenshot tooling is not installed and should be chosen during planning.

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 for local architecture findings; re-check dependency versions if adding new browser automation packages.

## RESEARCH COMPLETE
