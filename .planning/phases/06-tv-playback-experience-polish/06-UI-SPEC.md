---
phase: 06
slug: tv-playback-experience-polish
status: approved
shadcn_initialized: false
preset: none
created: 2026-05-08
---

# Phase 06 - TV Playback Experience Polish UI Design Contract

> Visual and interaction contract for the TV Player polish phase. This file is the design input for `$gsd-plan-phase 6` and `$gsd-execute-phase 6`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none |
| Icon library | none for TV Phase 6 unless already available |
| Font | system sans stack: `Avenir Next, Futura, Gill Sans, Trebuchet MS, sans-serif` |

Phase 6 must stay inside the existing TV Player React/Vite app and inline `CSSProperties` style pattern. Do not introduce a UI framework for this phase.

---

## Spacing Scale

Declared values, all multiples of 4:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | QR cell gaps and micro offsets |
| sm | 8px | Compact caption gaps |
| md | 16px | Metric label/value gaps |
| lg | 24px | Banner and footer internal padding |
| xl | 32px | State detail spacing |
| 2xl | 48px | TV screen top/bottom rails |
| 3xl | 64px | Desktop TV page padding |
| 4xl | 96px | 1080p idle page horizontal padding |

Exceptions: existing QR borders may remain 5px and 10px because they are part of QR scan contrast.

---

## Typography

TV typography is optimized for a living-room viewing distance, not mobile density.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Status label | 18px to 22px | 850 to 900 | 1.1 |
| Body/detail | 28px to 34px | 750 to 850 | 1.22 to 1.28 |
| Metric value | 26px to 34px | 850 to 950 | 1.0 to 1.12 |
| Heading | 72px to 96px | 900 to 950 | 0.94 to 1.0 |
| Now-playing display | 88px to 108px | 920 to 950 | 0.94 to 1.0 |

Rules:

- Letter spacing must be `0` for Chinese headings and long titles.
- Uppercase English kicker labels may be replaced with Chinese labels where the component is touched.
- Long song titles and next-song text must use bounded line counts, truncation, or `overflowWrap: "anywhere"` plus stable width constraints.
- Do not scale font size directly with viewport width.

---

## Color

The TV screen should keep the existing high-contrast dark stage style while reducing decoration that competes with video.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#050604` | Video backdrop and darkest page background |
| Secondary (30%) | `rgba(17, 20, 15, 0.76)` | Bottom rail, status surfaces, persistent state panels |
| Text primary | `#fff8e7` | Main title, primary status text, QR caption |
| Text secondary | `#d9d0b8` | Artist, details, secondary state copy |
| Success/recovered | `#8fe6ad` | Reconnected or ready accents only |
| Warning/loading | `#f2c84b` | Loading, first-play prompt, active mode accent |
| Failure/conflict | `#ff9b72` | Playback failure, conflict, offline/error accents |

Accent reserved for: status pills, vocal-mode badge, first-play action prompt, persistent error/conflict headings. Accent color must not be used for all text or all borders.

Do not add gradient orbs, bokeh, decorative SVG backgrounds, or heavily saturated single-hue themes. Existing subtle background texture may remain only if it does not reduce text contrast.

---

## Layout Contract

### Target Viewports

| Viewport | Required Result |
|----------|-----------------|
| 1920x1080 | Primary TV baseline; all states readable from couch distance |
| 1366x768 | Smaller desktop/TV fallback; QR, title, status, and time do not overlap |

### Persistent Regions

| Region | Behavior |
|--------|----------|
| Video plane | Full viewport, `objectFit: "contain"`, visually primary |
| Top rail | Status banner on left, corner QR on right; both have bounded max width |
| Center/now playing | Current title and artist; title supports long Chinese/English strings without covering footer |
| Bottom rail | Vocal mode, playback state, `mm:ss / mm:ss`, and next song; stable grid and no horizontal overflow |
| Idle screen | Large QR plus concise Chinese readiness copy |
| Conflict/offline/error | Persistent full-screen state with action-oriented Chinese copy |

### Non-Overlap Requirements

- Corner QR must never overlap the status banner.
- Bottom rail must never overlap current title.
- Time text must remain visible as a single compact pair, for example `00:12 / 03:00` or `00:12 / --:--`.
- Next-song text can truncate before pushing mode/time off-screen.
- First-play prompt can overlay the playing view, but it must leave enough context to show which song is ready.

---

## Copywriting Contract

TV copy touched in Phase 6 defaults to Chinese.

| Element | Copy |
|---------|------|
| Idle heading | `扫码点歌` |
| Idle body | `用手机扫码进入点歌台，电视只负责播放和显示状态。` |
| Loading state | `正在准备播放` |
| Playing state | `播放中` |
| Recovering state | `正在恢复播放` |
| First-play prompt heading | `点击电视开始播放` |
| First-play prompt body | `浏览器需要一次点击授权播放声音，点击后会继续当前歌曲。` |
| Offline/error heading | `电视端离线` |
| Offline/error body | `请检查后台服务和电视网络，然后刷新电视页面。` |
| Conflict heading | `已有电视端在线` |
| Conflict body | `请先关闭当前在线的电视端，再刷新这个页面。` |
| Switch success | `已切换到{mode}` |
| Switch failure | `切换失败，已恢复到原模式` |
| Skip feedback | `已切歌` |
| Playback failed skipped | `播放失败，已跳到下一首` |
| Recovery fallback | `已恢复播放，本首从头开始` |

Do not show raw phrases like `unknown`, `loading`, `active-player-conflict`, or `TV player request failed: 500` as the primary TV message.

---

## Interaction Contract

| Interaction | Required Behavior |
|-------------|-------------------|
| First-play blocked | Show explicit prompt; any pointer click/tap on TV page retries playback |
| Playback resumes | Prompt disappears and normal playing overlay returns |
| Vocal switch in progress | Keep video dominant; show final mode when committed |
| Vocal switch failed | Roll back through existing runtime and show short failure/revert feedback |
| Reconnect recovery | Show short recovery feedback from backend notice |
| Offline/error | Persistent state until snapshot/bootstrap succeeds |
| Conflict | Persistent state until active TV is disconnected and page refreshed/reconnected |

Feedback timing: success/recovery notices should be short and non-blocking, target 2 to 4 seconds. Persistent failure/offline/conflict states are not timed out.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| third-party | none | not allowed for Phase 6 without a new plan |

---

## Verification Contract

Automated tests must cover:

- Idle, loading, playing, recovering, error/offline, conflict rendering.
- `mm:ss / mm:ss` and unknown duration handling.
- First-play prompt appears on blocked playback and clears after playback starts.
- Notice copy for switch failure, playback failed skipped, recovery fallback, and successful mode switch if implemented.
- Long title/next-song strings remain bounded in DOM-visible text.

Visual validation must cover:

- 1920x1080 TV view.
- 1366x768 smaller desktop/TV view.
- Idle, playing with long title, first-play prompt, conflict, and offline/error states.
- Screenshot files or documented manual screenshots under `logs/visual/` or the Phase 6 summary.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-05-08
