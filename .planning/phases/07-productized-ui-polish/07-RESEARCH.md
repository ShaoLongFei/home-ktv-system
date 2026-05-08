# Phase 07: Productized UI Polish - Research

**Researched:** 2026-05-08  
**Status:** Ready for planning  
**Question:** What needs to be known to plan cross-app UI polish well?

---

## Summary

Phase 7 can be implemented with the existing React/CSS/i18n patterns. There is no need for a new UI framework or a broad shared i18n package. The highest-value work is to centralize small status/copy maps where they already exist, remove visible raw enum/debug text from the Chinese default path, tighten Mobile small-width layouts, improve Admin action feedback, and extend UI regression/visual checks.

The phase should be split into:

1. Copy/status glossary and localized feedback helpers.
2. Mobile/Admin layout, button state, refresh, and task feedback polish.
3. Regression tests, visual checks, and Chinese UAT.

---

## Current Implementation Facts

### Admin

- `apps/admin/src/App.tsx` wraps the app in `I18nProvider defaultLanguage="zh"` and shows `LanguageSwitch`.
- `apps/admin/src/i18n.tsx` already contains English and Chinese dictionaries plus helpers:
  - `statusText(status, t)`
  - `languageName(language, t)`
  - `vocalModeName(mode, t)`
- Admin still renders raw values in some user-facing places:
  - `RoomStatusView.tsx` renders `roomStatus.room.status`.
  - `RoomStatusView.tsx` renders `roomStatus.current.vocalMode`.
  - `RoomStatusView.tsx` renders raw event type as the main event label.
  - `SongCatalogView.tsx` renders `song.language`, `song.status`, and some asset fields directly.
  - `ImportWorkbench.tsx` uses raw probe/root details as compact metadata.
- Admin Rooms already uses realtime snapshot messages and targeted refresh after task actions. Tests already cover promote causing the task row to disappear without browser reload.

### Mobile

- `apps/mobile-controller/src/App.tsx` wraps the app in `I18nProvider defaultLanguage="zh"` and shows `LanguageSwitch`.
- `apps/mobile-controller/src/i18n.tsx` has a smaller dictionary and `vocalModeName()`.
- Mobile still exposes raw or English-like values in Chinese mode:
  - `current.aria`: `Current playback`
  - `queue.aria`: `Queue`
  - `search.aria`: `Song search`
  - `online.aria`: `Online supplement`
  - `vocal.unknown`: `unknown`
  - current meta renders `snapshot?.state` directly.
  - online candidate metadata renders `candidate.candidateType`, `candidate.reliabilityLabel`, `candidate.riskLabel`, and `candidate.taskState` directly.
- Mobile CSS already stacks `.search-form`, `.queue-row`, `.song-row`, and `.version-row` below 520px, but online candidate metadata and action widths need explicit non-overflow handling.

### TV

- Phase 6 created `apps/tv-player/src/screens/tv-display-model.ts` with Chinese display labels, notice copy, first-play prompt, and clock formatting.
- Phase 6 TV tests and visual helper already exist:
  - `apps/tv-player/src/test/tv-screen-states.test.tsx`
  - `apps/tv-player/src/test/playing-screen.test.tsx`
  - `scripts/tv-visual-check.mjs`
- TV should not be redesigned in Phase 7. It only needs regression preservation and any glossary/copy consistency fixes discovered while planning.

---

## Recommended Technical Approach

### Copy and Status Mapping

Keep dictionaries local to each app for Phase 7, but add controlled helpers where a page currently renders raw values. This is less risky than introducing a shared package before Phase 8.

Recommended helper additions:

- Admin:
  - extend `statusText()` to cover all statuses seen in import/catalog/online tasks.
  - add `roomStateText()`, `playbackStateText()`, and `eventTypeText()` in `apps/admin/src/i18n.tsx`.
  - reuse `vocalModeName()` when rendering current song or asset vocal mode if the value is visible to users.
- Mobile:
  - add `playbackStateName()`, `onlineTaskStateName()`, `candidateTypeName()`, `reliabilityName()`, and `riskName()` in `apps/mobile-controller/src/i18n.tsx`.
  - update Chinese aria labels to Chinese.
  - map `unknown` to `未知`.

Do not build a generic translation engine. Existing `t(key, replacements)` is enough.

### Layout and Interaction

Mobile:

- Keep panels and row structure.
- Add stronger `min-width: 0`, `overflow-wrap: anywhere`, `width: 100%`, and row action stacking for online candidate rows.
- Keep button min-height 44px and centered text.
- Ensure the search submit button stacks at small widths.
- Avoid showing raw metadata in a single long chip group that can overflow.

Admin:

- Keep workbench/list-detail layouts.
- Ensure header actions wrap and compact task buttons show busy state.
- After task actions, keep the targeted `refreshRoomStatus()` call; tests should verify the UI state changes without page reload.
- Productize events/status first label; keep IDs as secondary diagnostics.

TV:

- Keep Phase 6 behavior.
- Run existing TV tests and visual check from Phase 7 final verification.

### Visual Checks

The existing `scripts/tv-visual-check.mjs` pattern is a good fit. For Phase 7, add a similar dependency-light script rather than adding Playwright:

- Start local dev services externally with `pnpm dev:local start/restart`.
- Use local Chrome via `CHROME_BIN` or `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- Capture:
  - `logs/visual/mobile-controller-390x844.png`
  - `logs/visual/mobile-controller-375x667.png`
  - `logs/visual/admin-1440x900.png`
  - `logs/visual/admin-768x900.png`
- Keep `pnpm tv:visual-check` unchanged and add a new root script such as `ui:visual-check`.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Raw enums remain visible after partial copy fixes | Add regression tests that assert absence of `unknown`, `original`, `instrumental`, and raw state text in Chinese default flows. |
| Small phone layout still overflows in online supplement rows | Add CSS constraints and visual screenshots at `390x844` and `375x667`. |
| Admin task actions still require browser refresh in edge cases | Tests should click promote/retry/clean and assert updated visible state after command response/refresh. |
| A shared i18n refactor grows beyond Phase 7 | Keep helpers local; document full boundary cleanup for Phase 8. |
| Visual script is flaky without dev servers | The script should provide clear help/error output and UAT should state that `pnpm dev:local restart` must be running first. |

---

## Validation Architecture

### Automated

- `pnpm -F @home-ktv/admin test`
- `pnpm -F @home-ktv/mobile-controller test`
- `pnpm -F @home-ktv/tv-player test`
- `pnpm typecheck`
- `node scripts/ui-visual-check.mjs --help`
- `node scripts/tv-visual-check.mjs --help`

### Visual / Manual

- `pnpm ui:visual-check` after local dev services are running.
- `pnpm tv:visual-check` after local dev services are running.
- Chinese UAT doc for Phase 7 with explicit click-by-click validation.

---

## Planning Notes

- Plan 07-01 should focus on copy/status helpers and tests that fail on raw UI text.
- Plan 07-02 should focus on Mobile/Admin layout and interaction polish.
- Plan 07-03 should add visual script, UAT, and final verification gates.

No external research or new dependencies are needed for Phase 7.
