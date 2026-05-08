---
phase: 07
slug: productized-ui-polish
status: approved
shadcn_initialized: false
preset: none
created: 2026-05-08
---

# Phase 07 - Productized UI Polish UI Design Contract

> Visual and interaction contract for the cross-app product polish phase. This file is the design input for `$gsd-plan-phase 7` and `$gsd-execute-phase 7`.

---

## Design System

| Property | Admin | Mobile | TV |
|----------|-------|--------|----|
| Tool | none | none | none |
| Component library | existing React components only | existing React components only | existing React components only |
| Icon library | none required | none required | none required |
| Styling | `apps/admin/src/App.css` | `apps/mobile-controller/src/App.css` | inline `CSSProperties` |
| Default language | Chinese | Chinese | Chinese |

Do not introduce shadcn, Tailwind, MUI, or another UI framework in Phase 7. The polish should evolve the existing low-radius, operational UI language.

Admin and Mobile already have `I18nProvider`, `LanguageSwitch`, and local dictionaries. Keep these switches. Shared helpers are allowed only when they remove real duplicate terminology or status mapping without forcing a broad Phase 8-style restructure.

---

## Product Personality

The system should feel like a quiet family KTV control surface: clear, practical, and ready to use during a song. It should not feel like a landing page, marketing site, or decorative dashboard.

| Surface | Personality |
|---------|-------------|
| Mobile | Fast controller. Phone-first, thumb-friendly, clear current state, no clutter that slows point-and-sing flow. |
| Admin | Operational console. Dense, scannable, predictable, with clear task and recovery feedback. |
| TV | Playback screen. Video-dominant, distant-readable, short Chinese copy, no admin diagnostics as primary text. |

---

## Global Copy Contract

Chinese is the primary product path. English remains available in Admin/Mobile through the existing switch.

### Shared Glossary

| Concept | Chinese Copy | Notes |
|---------|--------------|-------|
| TV online | `电视在线` | Use on Mobile status pill and Admin room summary. |
| TV offline | `电视离线` | Use on Mobile status pill and Admin room summary. |
| Controller | `点歌控制台` | Mobile page title. |
| Queue | `播放队列` | Mobile queue and Admin queue summary where space allows. |
| Now playing | `正在播放` | Mobile/TV current playback label. |
| Current playback | `当前播放` | Admin/Mobile section label where operational wording is better. |
| Waiting | `等待点歌` | Mobile empty current state. |
| Original vocal | `原唱` | Never show `original` in Chinese default UI. |
| Instrumental | `伴唱` | Never show `instrumental` in Chinese default UI. |
| Unknown | `未知` | Never show `unknown` in Chinese default UI. |
| Online supplement | `在线补歌` | Mobile/Admin task area. |
| Request supplement | `请求补歌` | Mobile candidate button. |
| Ready | `已准备` | Online task and resource ready state. |
| Promote | `入库` | Admin online task action. |
| Refreshing | `刷新中...` | Busy refresh buttons. |
| Loading | `加载中...` | Loading placeholders. |
| Empty | `暂无...` | Empty states should name the missing object. |

### Raw Text Restrictions

The Chinese default UI must not expose these as primary visible text:

- Backend enum values such as `idle`, `playing`, `loading`, `error`, `unknown`, `original`, `instrumental`, `review_required`.
- English aria labels that appear in tests or visible accessibility flows when a Chinese equivalent exists.
- Raw task/event names such as `player.failed` as the only label. They may remain as secondary diagnostics below a Chinese product label.
- Raw error codes as the first line of an error message.

---

## State Feedback Contract

Use a consistent information hierarchy:

1. **Primary label:** short Chinese user-facing state.
2. **Detail:** one sentence explaining what happened or what to do, only when helpful.
3. **Diagnostics:** raw IDs, provider names, event names, or error codes as secondary small text only.

| State | Required UI Behavior |
|-------|----------------------|
| Empty | Show a Chinese title plus one useful detail when the user can act. Avoid blank sections. |
| Loading | Show stable localized text and keep layout dimensions stable. |
| Busy action | Disable the triggering button, keep button size stable, and show a localized busy label if the wait is visible. |
| Success | Prefer updated row/badge/list state; use short non-blocking status copy only when the result is otherwise invisible. |
| Error | Show Chinese first-line product copy; include technical detail only as secondary text. |
| Reconnecting | Show a concise banner and let realtime/polling recovery update visible state. |

No new modal confirmation should be added unless the action is destructive or already uses a confirmation pattern.

---

## Admin Contract

### Layout

| Area | Contract |
|------|----------|
| Top navigation | Keep compact tab bar plus language switch. Text must fit at 320px minimum browser width. |
| Headers | Use small operational title and one-line description. Header actions wrap without overlapping title. |
| Import workbench | Keep status filters + candidate list + detail pane. Empty groups show localized `暂无候选`. |
| Song catalog | Keep filter/list/detail structure. Song rows should productize language/status labels in Chinese. |
| Rooms | Keep summary cards, current song, queue, online tasks, and recent events. Prioritize status clarity over decoration. |

### Admin Interaction Requirements

- Scan, save, approve, reject/delete, refresh, retry, clean, promote, revalidate, validate JSON, and set-default actions must have stable disabled/busy behavior.
- Rooms task actions must refresh or update enough local state that a successful `入库`/`重试`/`清理` result is visible without reloading the browser page.
- Task rows lead with song/task state in Chinese; provider/task IDs remain secondary.
- Recent events lead with a productized Chinese event label when known, followed by raw event type as secondary diagnostics.
- Filters and status chips should use `statusText()` or an equivalent controlled map rather than raw enum display.

### Admin Density

Admin can stay dense. Keep panels 6px to 8px radius, small labels, compact rows, and restrained colors. Do not nest cards inside cards.

---

## Mobile Contract

### Target Viewports

| Viewport | Required Result |
|----------|-----------------|
| 390x844 | Primary phone baseline. No horizontal scroll, clipped button text, or off-center labels. |
| 375x667 | Smaller phone fallback. Search, queue rows, dialogs, and online rows remain usable. |
| 760px wide | Existing centered controller layout remains readable. |

### Layout

| Area | Contract |
|------|----------|
| Header | Room slug/title, TV status, and language switch wrap cleanly without hiding status. |
| Current playback | Shows localized current state, song, artist, current vocal mode, and controls. Raw snapshot state must not be visible. |
| Command row | Buttons remain at least 44px tall and centered. Disabled states should be visibly disabled. |
| Queue rows | Song/artist and actions stack on small widths without overflow. |
| Search | Input and search button stack when needed; search button text stays centered. |
| Search results | Local results remain before online candidates when both exist. |
| Online supplement | Empty, candidate, pending, ready, failed/review states are localized/productized. |
| Dialogs | Bottom modal style may remain; buttons centered and not overflowing. |

### Mobile Copy

- `current.aria`, `queue.aria`, `search.aria`, `online.aria`, and mode aria copy should have Chinese defaults.
- The visible current state should map `idle/loading/playing/recovering/error/conflict` to Chinese labels.
- Online metadata should map task states and risk/reliability where known. Unknown provider-specific labels can remain secondary but should not dominate the row.

---

## TV Contract

Phase 7 should preserve Phase 6 TV behavior and visual hierarchy.

| Area | Contract |
|------|----------|
| Idle | Keep large QR and concise Chinese entry copy. |
| Playing | Keep video-dominant overlay, `mm:ss / mm:ss`, mode, state, next song, and small QR. |
| First-play prompt | Keep `点击电视开始播放` behavior and do not hide browser autoplay truth. |
| Notices | Keep short Chinese notice banner. |
| Conflict/offline | Keep persistent Chinese state, no raw conflict/debug text as primary message. |

Only change TV files when a cross-app glossary or visible copy regression requires it. Do not redesign TV layout in Phase 7.

---

## Color and Typography

### Admin

Keep the existing quiet operational palette:

- Dark nav: `#1f2933`
- Background: `#f4f6f8`
- Primary action: `#146c6c`
- Danger: `#b32738`
- Borders: `#d7dde2`
- Text: `#1e252b`

Admin text should remain compact: page title around 20px, section headings around 15px to 18px, row metadata around 12px to 13px. Letter spacing stays `0` except existing small uppercase operational labels.

### Mobile

Keep the current light controller palette but reduce raw single-hue dominance where touched:

- Background: `#f4f7fb`
- Panel: `#ffffff`
- Text: `#18181b`
- Borders: `#dbe3ef`
- Online/success: green accents
- Warning/duplicate/queued: amber/orange accents
- Error/offline: red accents
- Search/neutral badges: blue or neutral accents

Mobile text should prioritize readability: current song heading can stay around 1.7rem; compact metadata should remain readable at phone width. Do not scale font size directly with viewport width.

### TV

Keep Phase 6 dark stage palette and typography. No new decorative gradients, orbs, bokeh, or illustrative backgrounds.

---

## Spacing and Dimensions

All new spacing should use multiples of 4 where practical.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline metadata gap |
| sm | 8px | Button groups, chip gaps |
| md | 12px | Compact panel padding |
| lg | 16px | Standard panel padding |
| xl | 20px | Admin page horizontal padding |
| 2xl | 28px | Wider mobile shell padding |

Rules:

- Buttons in Mobile stay at least 44px high.
- Buttons in Admin stay at least 36px high except compact task buttons, which may stay 28px high.
- Cards/panels stay 8px radius or less.
- Fixed-format controls such as status pills, language switch buttons, task action buttons, and command buttons need stable min-height and centered text.
- Long Chinese/English song titles, provider labels, task IDs, and event details must wrap, truncate, or use `overflow-wrap: anywhere` without causing horizontal scroll.

---

## Accessibility and Interaction

- Language switches must keep `aria-pressed` behavior and localized group labels.
- Buttons must use real `button` elements, preserve disabled state, and expose localized accessible names.
- Status banners should use suitable semantic text or roles when already established.
- Do not use color alone to communicate status; pair color with Chinese labels.
- Destructive actions continue to require confirmation where already implemented.

---

## Verification Contract

Automated tests must cover:

- Admin defaults to Chinese and can switch to English and back.
- Mobile defaults to Chinese and can switch to English and back.
- Mobile does not show visible `unknown`, `idle`, `playing`, `original`, or `instrumental` raw values in Chinese current playback.
- Mobile online supplement empty, candidate, pending, and ready states have localized/productized visible copy.
- Mobile key controls are clickable/enabled when allowed: 点歌, 加点/确认加点, 顶歌, 删除, 撤销, 切歌, 切到原唱/伴唱, 请求补歌.
- Admin import scan, catalog actions, room refresh, pairing token refresh, retry, clean, and promote buttons remain clickable and show busy/updated state.
- Admin Rooms task promote/retry/clean result becomes visible without browser reload.
- TV Phase 6 copy tests continue to pass.

Visual validation must cover:

- Mobile phone viewport `390x844`.
- Mobile small phone viewport `375x667`.
- Admin desktop viewport `1440x900`.
- Admin narrow viewport at least `768x900` if the current layout supports it; if not, document the minimum supported admin width in UAT.
- TV existing `1920x1080` and `1366x768` checks from Phase 6.

Screenshots should be written under `logs/visual/` and named by app and viewport, for example:

- `logs/visual/mobile-controller-390x844.png`
- `logs/visual/mobile-controller-375x667.png`
- `logs/visual/admin-1440x900.png`
- `logs/visual/admin-768x900.png`

---

## Manual UAT Contract

The Phase 7 UAT doc must be written in Chinese and must include:

1. Which local dev command to run.
2. URLs for Admin, Mobile, and TV.
3. Chinese default-language checks for all three apps.
4. Mobile point-song, queue, switch, skip, delete, undo, duplicate, and online supplement checks.
5. Admin import, song catalog, room refresh, token refresh, online task promote/retry/clean checks.
6. Visual checks for small mobile width and Admin layout.
7. Expected results after each click, so the user does not need to infer what to validate.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| third-party | none | not allowed for Phase 7 without a new plan |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-05-08
