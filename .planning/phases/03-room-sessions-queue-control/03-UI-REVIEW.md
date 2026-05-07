# Phase 03 — UI Review

**Audited:** 2026-05-07  
**Baseline:** abstract 6-pillar standards; no `03-UI-SPEC.md` exists for this phase  
**Screenshots:** not captured; dev servers responded on ports 5173, 5174, and 5176, but `pnpm exec playwright --version` failed because the Playwright CLI is not installed  
**UAT context:** `03-UAT.md` reports 10/10 passed, 0 issues  
**Registry:** `NO_SHADCN`; no `components.json`, so third-party registry audit is not applicable

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Consumer flows are understandable, but TV, mobile, and admin mix Chinese, English, and raw fallback terms. |
| 2. Visuals | 3/4 | TV has strong stage hierarchy and QR focus; mobile/admin are functional but visually plain. |
| 3. Color | 3/4 | State colors are meaningful, but colors are hardcoded across surfaces with no shared semantic token layer. |
| 4. Typography | 3/4 | Hierarchy is clear, but TV relies on large fixed pixel sizes and repeated letter spacing. |
| 5. Spacing | 3/4 | Mobile/admin spacing is consistent; TV fixed padding/gaps risk cramped layouts on non-standard screens. |
| 6. Experience Design | 4/4 | Loading, offline, reconnect, conflict, confirmation, undo, and realtime fallback states are covered. |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **Standardize user-facing language by surface** — TV/mobile are living-room consumer surfaces, but still show strings like `now singing`, `queue empty`, `unknown`, and English QR/status copy. Move these through a small copy map and make TV/mobile Chinese-first while keeping admin operator copy intentionally bilingual or fully English.
2. **Make TV typography and spacing viewport-aware** — large fixed values such as 96/108px titles and 72/96px padding can collide with QR, footer metrics, or long song names on laptops, tablets, projectors, and browser zoom. Replace fixed display sizes and major padding with `clamp(...)` and add narrow-height layout handling.
3. **Centralize visual tokens for state, accent, and surface colors** — the current UI uses many hardcoded hex/RGBA values across inline TV styles, mobile CSS, and admin CSS. Introduce local semantic tokens for `online`, `offline`, `warning`, `surface`, `muted`, `accent`, and `danger` so future queue/player states stay visually consistent.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

The mobile controller has clear Chinese primary task copy: `点歌控制台`, `电视在线/电视离线`, `正在播放`, `等待点歌`, `播放队列`, `可点歌曲`, `点歌`, `顶歌`, `删除`, and skip confirmation are all direct and action-oriented in `apps/mobile-controller/src/App.tsx:16`, `apps/mobile-controller/src/App.tsx:18`, `apps/mobile-controller/src/App.tsx:31`, `apps/mobile-controller/src/App.tsx:32`, `apps/mobile-controller/src/App.tsx:54`, `apps/mobile-controller/src/App.tsx:91`, `apps/mobile-controller/src/App.tsx:99`, `apps/mobile-controller/src/App.tsx:69`, `apps/mobile-controller/src/App.tsx:72`, and `apps/mobile-controller/src/App.tsx:107`.

The main issue is inconsistent localization. TV idle/playing/conflict surfaces use English phrases such as `living-room ready`, `Pick a song from your phone.`, `now singing`, `Mode`, `Time`, `Next`, and `queue empty` in `apps/tv-player/src/screens/IdleScreen.tsx:13`, `apps/tv-player/src/screens/IdleScreen.tsx:14`, `apps/tv-player/src/screens/PlayingScreen.tsx:24`, `apps/tv-player/src/screens/PlayingScreen.tsx:30`, `apps/tv-player/src/screens/PlayingScreen.tsx:34`, `apps/tv-player/src/screens/PlayingScreen.tsx:38`, and `apps/tv-player/src/screens/PlayingScreen.tsx:39`. The QR caption is also English in `apps/tv-player/src/components/PairingQr.tsx:33`.

Fallback copy leaks technical terms. Mobile and TV both return `unknown` for unsupported vocal modes in `apps/mobile-controller/src/App.tsx:148` and `apps/tv-player/src/screens/PlayingScreen.tsx:59`. Admin Rooms also mixes English labels with Chinese online/offline status in `apps/admin/src/rooms/RoomStatusView.tsx:111`, `apps/admin/src/rooms/RoomStatusView.tsx:115`, `apps/admin/src/rooms/RoomStatusView.tsx:131`, `apps/admin/src/rooms/RoomStatusView.tsx:132`, and `apps/admin/src/rooms/RoomStatusView.tsx:147`. That is acceptable for an internal tool only if bilingual admin copy is intentional; it is less appropriate for TV/mobile.

### Pillar 2: Visuals (3/4)

The TV player has the strongest visual direction in this phase. It uses a full-screen shell with hidden video layers and foreground content in `apps/tv-player/src/App.tsx:174`, `apps/tv-player/src/App.tsx:175`, `apps/tv-player/src/App.tsx:176`, `apps/tv-player/src/App.tsx:178`, and `apps/tv-player/src/App.tsx:179`, then applies a stage-like background and video containment in `apps/tv-player/src/App.tsx:382` through `apps/tv-player/src/App.tsx:415`. The playing screen gives the song title a clear focal point and keeps QR/status/metrics in predictable regions in `apps/tv-player/src/screens/PlayingScreen.tsx:18`, `apps/tv-player/src/screens/PlayingScreen.tsx:19`, `apps/tv-player/src/screens/PlayingScreen.tsx:23`, and `apps/tv-player/src/screens/PlayingScreen.tsx:28`.

The QR implementation is visually purposeful and stable: it renders a quiet zone and fixed module grid from the QR payload in `apps/tv-player/src/components/PairingQr.tsx:17` through `apps/tv-player/src/components/PairingQr.tsx:35`, with large and corner variants in `apps/tv-player/src/components/PairingQr.tsx:81` and `apps/tv-player/src/components/PairingQr.tsx:92`.

The mobile controller is usable and phone-first. It separates current playback, queue, song picker, and confirmation modal into panels in `apps/mobile-controller/src/App.tsx:29`, `apps/mobile-controller/src/App.tsx:53`, `apps/mobile-controller/src/App.tsx:90`, and `apps/mobile-controller/src/App.tsx:107`. The visual treatment is competent, but repeated bordered panels and text buttons make current-vs-next hierarchy weaker than the TV surface.

Admin Rooms is appropriately utilitarian: a summary grid and panels show token expiry, controller count, TV status, current song, and queue preview in `apps/admin/src/rooms/RoomStatusView.tsx:119` through `apps/admin/src/rooms/RoomStatusView.tsx:160`, styled by `apps/admin/src/App.css:218` through `apps/admin/src/App.css:237`. It is clear but visually basic, with no stronger status badge treatment beyond text values.

### Pillar 3: Color (3/4)

Color semantics are mostly sound. Mobile uses green/red status pills for TV presence in `apps/mobile-controller/src/App.css:71` through `apps/mobile-controller/src/App.css:79`, and distinct vocal-mode colors for original, instrumental, dual, and unknown in `apps/mobile-controller/src/App.css:178` through `apps/mobile-controller/src/App.css:199`. Admin has meaningful candidate/status dot colors in `apps/admin/src/App.css:292` through `apps/admin/src/App.css:313`. TV uses warm stage accents and vocal-mode accents in `apps/tv-player/src/screens/PlayingScreen.tsx:62` through `apps/tv-player/src/screens/PlayingScreen.tsx:83`.

The main issue is maintainability and cross-surface consistency. The color scan found hardcoded hex/RGBA values throughout `apps/mobile-controller/src/App.css`, `apps/admin/src/App.css`, and the TV inline styles, including the TV background at `apps/tv-player/src/App.tsx:382` through `apps/tv-player/src/App.tsx:386`, mobile shell/surface colors at `apps/mobile-controller/src/App.css:7`, `apps/mobile-controller/src/App.css:38`, and `apps/mobile-controller/src/App.css:102`, plus admin shell and button colors at `apps/admin/src/App.css:1` through `apps/admin/src/App.css:3` and `apps/admin/src/App.css:336` through `apps/admin/src/App.css:344`.

This does not currently create a usability failure, but it will make future queue/player states harder to keep consistent. A small token layer is enough; this phase does not need a full design system migration.

### Pillar 4: Typography (3/4)

Typography communicates hierarchy well. TV title and artist sizes establish the room display focal point in `apps/tv-player/src/screens/PlayingScreen.tsx:118` through `apps/tv-player/src/screens/PlayingScreen.tsx:134`; mobile uses compact panel headings and badges in `apps/mobile-controller/src/App.css:55` through `apps/mobile-controller/src/App.css:68` and `apps/mobile-controller/src/App.css:110` through `apps/mobile-controller/src/App.css:113`; admin uses a dense 12/13/15/16/20px range suitable for repeated operational work in `apps/admin/src/App.css:83` through `apps/admin/src/App.css:92`, `apps/admin/src/App.css:239` through `apps/admin/src/App.css:255`, and `apps/admin/src/App.css:277` through `apps/admin/src/App.css:283`.

The TV display layer is the risk. Fixed title sizes appear at 108px in `apps/tv-player/src/screens/PlayingScreen.tsx:120`, 96px in `apps/tv-player/src/screens/IdleScreen.tsx:44`, 96px in `apps/tv-player/src/screens/ConflictScreen.tsx:37`, and 96px in `apps/tv-player/src/App.tsx:432`. These are appropriate for a 16:9 TV at normal zoom, but not robust for small browser windows, projectors, narrow split-screen testing, or high zoom. Several all-caps labels also use positive letter spacing in `apps/tv-player/src/screens/PlayingScreen.tsx:114`, `apps/tv-player/src/screens/PlayingScreen.tsx:159`, `apps/tv-player/src/screens/IdleScreen.tsx:38`, `apps/tv-player/src/screens/ConflictScreen.tsx:31`, and `apps/tv-player/src/App.tsx:426`; if the project follows the stricter local UI guidance, these should be normalized to `0`.

### Pillar 5: Spacing (3/4)

Mobile and admin generally follow a restrained spacing scale. Mobile uses 8/10/12/14/16/18/28px-like values across panels, buttons, rows, modal, and shell in `apps/mobile-controller/src/App.css:31` through `apps/mobile-controller/src/App.css:47`, `apps/mobile-controller/src/App.css:98` through `apps/mobile-controller/src/App.css:107`, `apps/mobile-controller/src/App.css:123` through `apps/mobile-controller/src/App.css:129`, and `apps/mobile-controller/src/App.css:226` through `apps/mobile-controller/src/App.css:240`. Admin similarly stays compact, with 6/8/10/12/14/16/20px patterns around tabs, headers, summary cards, and queue rows in `apps/admin/src/App.css:40` through `apps/admin/src/App.css:80` and `apps/admin/src/App.css:218` through `apps/admin/src/App.css:237`.

The TV surface is less flexible. Idle uses a 72px gap and 72px/96px padding in `apps/tv-player/src/screens/IdleScreen.tsx:26` and `apps/tv-player/src/screens/IdleScreen.tsx:29`; conflict uses 72px padding in `apps/tv-player/src/screens/ConflictScreen.tsx:25`; playing uses 48px/64px screen padding and a 24px-radius footer in `apps/tv-player/src/screens/PlayingScreen.tsx:98` and `apps/tv-player/src/screens/PlayingScreen.tsx:139`. These choices look intentional for TV, but should become viewport-aware so the footer metrics, QR, and long titles remain stable in smaller browser testing windows.

### Pillar 6: Experience Design (4/4)

State coverage is strong and was verified through UAT. `03-UAT.md` records all 10 tests passing, including cold start, QR/token refresh, mobile scan/session restore, WebSocket fanout, queue add/promote/delete/undo, skip confirmation, vocal switch, admin room status, and active TV conflict safety in `.planning/phases/03-room-sessions-queue-control/03-UAT.md:23` through `.planning/phases/03-room-sessions-queue-control/03-UAT.md:67`.

The mobile controller covers reconnect and error banners in `apps/mobile-controller/src/App.tsx:23` through `apps/mobile-controller/src/App.tsx:27`, disabled actions in `apps/mobile-controller/src/App.tsx:44`, `apps/mobile-controller/src/App.tsx:47`, `apps/mobile-controller/src/App.tsx:69`, and `apps/mobile-controller/src/App.tsx:72`, undo affordance in `apps/mobile-controller/src/App.tsx:66` and `apps/mobile-controller/src/App.tsx:75` through `apps/mobile-controller/src/App.tsx:78`, and skip confirmation in `apps/mobile-controller/src/App.tsx:107` through `apps/mobile-controller/src/App.tsx:120`. Tests cover session restore, reconnect polling, skip confirmation, undo, vocal switching, and visible current mode in `apps/mobile-controller/src/test/controller.test.tsx:102` through `apps/mobile-controller/src/test/controller.test.tsx:262`.

The TV player covers booting, error, missing snapshot, conflict, playing/loading/recovering, and idle screens in `apps/tv-player/src/App.tsx:191` through `apps/tv-player/src/App.tsx:211`. Autoplay-blocked behavior is surfaced as a notice in `apps/tv-player/src/App.tsx:248` through `apps/tv-player/src/App.tsx:252`. The playing screen test verifies vocal mode and `mm:ss / mm:ss` display in `apps/tv-player/src/test/playing-screen.test.tsx:7` through `apps/tv-player/src/test/playing-screen.test.tsx:13`.

Admin Rooms includes initial load, realtime WebSocket updates, fallback polling, refresh disabled/loading state, and refresh error handling in `apps/admin/src/rooms/RoomStatusView.tsx:13` through `apps/admin/src/rooms/RoomStatusView.tsx:81` and `apps/admin/src/rooms/RoomStatusView.tsx:83` through `apps/admin/src/rooms/RoomStatusView.tsx:105`. Tests cover Rooms tab navigation, token refresh, and realtime snapshot updates in `apps/admin/src/test/room-status.test.tsx:17` through `apps/admin/src/test/room-status.test.tsx:77`.

The only residual risk is visual-only: screenshots were not captured because the local Playwright CLI is unavailable, so this audit cannot confirm actual rendered overlap or responsive layout at multiple viewport sizes.

---

## Files Audited

- `.planning/phases/03-room-sessions-queue-control/03-CONTEXT.md`
- `.planning/phases/03-room-sessions-queue-control/03-01-SUMMARY.md`
- `.planning/phases/03-room-sessions-queue-control/03-02-SUMMARY.md`
- `.planning/phases/03-room-sessions-queue-control/03-03-SUMMARY.md`
- `.planning/phases/03-room-sessions-queue-control/03-04-SUMMARY.md`
- `.planning/phases/03-room-sessions-queue-control/03-05-SUMMARY.md`
- `.planning/phases/03-room-sessions-queue-control/03-06-SUMMARY.md`
- `.planning/phases/03-room-sessions-queue-control/03-07-SUMMARY.md`
- `.planning/phases/03-room-sessions-queue-control/03-08-SUMMARY.md`
- `.planning/phases/03-room-sessions-queue-control/03-UAT.md`
- `apps/mobile-controller/src/App.tsx`
- `apps/mobile-controller/src/App.css`
- `apps/mobile-controller/src/test/controller.test.tsx`
- `apps/tv-player/src/App.tsx`
- `apps/tv-player/src/screens/PlayingScreen.tsx`
- `apps/tv-player/src/screens/IdleScreen.tsx`
- `apps/tv-player/src/screens/ConflictScreen.tsx`
- `apps/tv-player/src/components/PairingQr.tsx`
- `apps/tv-player/src/components/PlaybackStatusBanner.tsx`
- `apps/tv-player/src/test/playing-screen.test.tsx`
- `apps/admin/src/rooms/RoomStatusView.tsx`
- `apps/admin/src/App.css`
- `apps/admin/src/test/room-status.test.tsx`

