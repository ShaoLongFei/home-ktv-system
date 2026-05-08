# Phase 6: TV Playback Experience Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 06-TV Playback Experience Polish
**Mode:** discuss, auto-resolved from prior decisions and recommended defaults because interactive selection was unavailable in the current Codex mode.
**Areas discussed:** TV information hierarchy, state presentation, first-play browser gesture, playback feedback, living-room readability, verification expectations

---

## TV Information Hierarchy

| Option | Description | Selected |
|--------|-------------|----------|
| Video-dominant compact HUD | Keep MV/lyrics primary; show current song, artist, next song, vocal mode, state, time, and small QR in stable overlay positions. | ✓ |
| Status-rich dashboard | Make TV show more room/session/queue diagnostics persistently. | |
| Minimal overlay | Hide almost everything except video and transient prompts. | |

**User's choice:** Inferred recommended default: video-dominant compact HUD.
**Notes:** Prior Phase 1 decisions require playing-state small QR and standard information density. User already rejected a progress bar and requested `mm:ss / mm:ss` only.

---

## State Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Server snapshot with local transient notices | Use `RoomSnapshot.state` and `RoomSnapshot.notice` as truth; local notices only decorate runtime feedback temporarily. | ✓ |
| Client-derived TV state machine | TV infers more state locally from video/runtime events. | |
| Pure visual banners only | Avoid state-specific screens and just show banners. | |

**User's choice:** Inferred recommended default: server snapshot with local transient notices.
**Notes:** This carries forward the architecture rule that TV reports facts and the server decides state. It also avoids state drift between Mobile/Admin/TV.

---

## First-Play Browser Gesture

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit actionable prompt | Show a clear TV prompt such as "点击电视开始播放" when browser autoplay blocks first play; resume after user gesture. | ✓ |
| Small non-blocking notice | Keep the main playing UI and show a small notice only. | |
| Silent retry | Keep retrying without telling the user why playback is blocked. | |

**User's choice:** Inferred recommended default: explicit actionable prompt.
**Notes:** User accepted the browser limitation as a real constraint, but the TV must make the required action obvious. Existing telemetry for `autoplay_blocked` should remain.

---

## Playback Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Transient successes, persistent failures | Show short feedback for switch/skip/reconnect success; keep failure/offline/conflict visible until resolved. | ✓ |
| All feedback persistent | Leave every state notice on screen until replaced. | |
| Only show failures | Hide successful operation feedback. | |

**User's choice:** Inferred recommended default: transient successes, persistent failures.
**Notes:** This matches Phase 6 success criteria: feedback should be clear but not interrupt singing. Failure feedback should include the recovery result, such as skipped or restarted.

---

## Living-Room Readability

| Option | Description | Selected |
|--------|-------------|----------|
| 1080p TV first plus desktop fallback | Validate at 1920x1080 and a smaller desktop viewport such as 1366x768; prioritize couch-distance readability. | ✓ |
| Fully responsive mobile TV page | Treat TV like a normal responsive web app across phone sizes. | |
| Single fixed canvas | Optimize only for one fixed TV resolution. | |

**User's choice:** Inferred recommended default: 1080p TV first plus desktop fallback.
**Notes:** Phase 1 locked desktop Chrome / mini PC connected to TV as the first validation environment.

---

## Verification Expectations

| Option | Description | Selected |
|--------|-------------|----------|
| DOM tests plus browser screenshot checks | Cover state rendering and runtime prompts with tests, then verify layout/non-overlap in real browser viewports. | ✓ |
| Unit tests only | Keep coverage to component/runtime tests. | |
| Manual UAT only | Rely on user visual testing after deployment. | |

**User's choice:** Inferred recommended default: DOM tests plus browser screenshot checks.
**Notes:** Phase 6 is visual and runtime-facing; screenshots are needed to catch overlap/readability issues that unit tests miss.

---

## the agent's Discretion

- Exact component split, CSS details, Chinese copy phrasing, animation timing, and screenshot tooling are left to planning/implementation.
- The first-play prompt may be full-screen, centered overlay, or state panel as long as it is clearly actionable and disappears after playback resumes.

## Deferred Ideas

- Full cross-app Chinese/i18n polish belongs to Phase 7.
- Broad runtime/module refactor belongs to Phase 8.
- Android TV native shell, production deployment, real provider, scoring, recording, and DSP remain out of scope for Phase 6.
