# TV Controller UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the approved dark home-theater UI design to the TV player and mobile controller without changing playback or command behavior.

**Architecture:** Keep the existing React/Vite apps and runtime hooks. Extract TV visual tokens into a small TypeScript theme module, use CSS custom properties for the mobile controller, and update presentational components around the existing `RoomSnapshot`, `TvDisplayState`, and `RoomControlSnapshot` models.

**Tech Stack:** React 19, Vite, TypeScript, CSS, Vitest, Testing Library, existing Chrome screenshot scripts.

---

### Task 1: TV Visual Tokens And Shell

**Files:**
- Create: `apps/tv-player/src/theme.ts`
- Create: `apps/tv-player/src/test/theme.test.ts`
- Modify: `apps/tv-player/src/App.tsx`

**Step 1: Write the failing test**

Create `apps/tv-player/src/test/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tvTheme } from "../theme.js";

describe("tvTheme", () => {
  it("uses the approved dark home-theater palette", () => {
    expect(tvTheme.colors.background).toBe("#05070D");
    expect(tvTheme.colors.surface).toBe("rgba(15, 23, 42, 0.82)");
    expect(tvTheme.colors.accent).toBe("#22D3EE");
    expect(tvTheme.colors.success).toBe("#34D399");
  });
});
```

**Step 2: Run red test**

Run:

```bash
pnpm -F @home-ktv/tv-player test -- src/test/theme.test.ts
```

Expected: fail because `apps/tv-player/src/theme.ts` does not exist.

**Step 3: Implement TV theme and shell**

Create `apps/tv-player/src/theme.ts`:

```ts
export const tvTheme = {
  colors: {
    background: "#05070D",
    backgroundElevated: "#0B1020",
    surface: "rgba(15, 23, 42, 0.82)",
    border: "rgba(148, 163, 184, 0.22)",
    text: "#F8FAFC",
    textMuted: "#CBD5E1",
    textWeak: "#94A3B8",
    accent: "#22D3EE",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#F87171"
  },
  fonts: {
    heading: "Outfit, Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif",
    body: "Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
  },
  radii: {
    panel: 8,
    pill: 999
  }
} as const;
```

Update `apps/tv-player/src/App.tsx` to import `tvTheme` and replace the current black/gold shell with the approved near-black and blue-cyan palette. Keep the two video elements, runtime hook, and `renderScreen` logic unchanged.

**Step 4: Run green test**

Run:

```bash
pnpm -F @home-ktv/tv-player test -- src/test/theme.test.ts
pnpm -F @home-ktv/tv-player typecheck
```

Expected: tests and typecheck pass.

**Step 5: Commit**

```bash
git add apps/tv-player/src/theme.ts apps/tv-player/src/test/theme.test.ts apps/tv-player/src/App.tsx
git commit -m "feat(tv): add dark home theater visual shell"
```

### Task 2: TV Screen Components

**Files:**
- Modify: `apps/tv-player/src/screens/IdleScreen.tsx`
- Modify: `apps/tv-player/src/screens/PlayingScreen.tsx`
- Modify: `apps/tv-player/src/components/PairingQr.tsx`
- Modify: `apps/tv-player/src/components/PlaybackStatusBanner.tsx`
- Modify: `apps/tv-player/src/test/playing-screen.test.tsx`
- Modify: `apps/tv-player/src/test/tv-screen-states.test.tsx`

**Step 1: Write failing tests**

Extend existing tests to prove:

- `PlayingScreen` still shows title, artist, mode, time, and next song after the visual refactor.
- the first-play prompt remains an actionable `role="status"` message.
- idle state still exposes the large pairing QR by its current accessible label.
- long song titles remain rendered and the time text remains visible.

Run:

```bash
pnpm -F @home-ktv/tv-player test -- src/test/playing-screen.test.tsx src/test/tv-screen-states.test.tsx
```

Expected: pass before edits, then use these tests as a regression guard while changing markup and style.

**Step 2: Implement visual refactor**

Update TV components to use `tvTheme`:

- `IdleScreen`: deep home-theater background, left-aligned state copy, large QR with dark panel frame.
- `PlayingScreen`: full-screen MV remains primary; bottom playback rail uses low-brightness surface, cyan/success/warning status accents, and stable grid sizing.
- `PairingQr`: keep QR module generation unchanged, change frame/caption colors to the dark design.
- `PlaybackStatusBanner`: use restrained cyan/warning pill styling and keep ellipsis behavior.

Do not change runtime behavior, API calls, playback recovery, QR generation, or display-state derivation.

**Step 3: Verify**

Run:

```bash
pnpm -F @home-ktv/tv-player test
pnpm -F @home-ktv/tv-player typecheck
```

Expected: all TV tests and typecheck pass.

**Step 4: Commit**

```bash
git add apps/tv-player/src/screens apps/tv-player/src/components apps/tv-player/src/test
git commit -m "feat(tv): restyle player screens for home theater UI"
```

### Task 3: Mobile Controller Layout And Tokens

**Files:**
- Modify: `apps/mobile-controller/src/App.css`
- Modify: `apps/mobile-controller/src/App.tsx`
- Modify: `apps/mobile-controller/src/test/controller.test.tsx`

**Step 1: Write failing layout test**

Add a test to `apps/mobile-controller/src/test/controller.test.tsx` that renders `<App />` and verifies the phone-first flow:

```ts
expect(screen.getByRole("region", { name: "当前播放" })).toBeTruthy();
expect(screen.getByRole("region", { name: "搜索歌曲" })).toBeTruthy();
expect(screen.getByRole("region", { name: "播放队列" })).toBeTruthy();
```

If the implementation reorders DOM sections, also assert the search region appears before the queue region:

```ts
const search = screen.getByRole("region", { name: "搜索歌曲" });
const queue = screen.getByRole("region", { name: "播放队列" });
expect(search.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

Run:

```bash
pnpm -F @home-ktv/mobile-controller test -- src/test/controller.test.tsx
```

Expected: fail if the current DOM order still places queue before search.

**Step 2: Implement CSS tokens**

Update `apps/mobile-controller/src/App.css` root variables:

```css
:root {
  --ktv-bg: #05070d;
  --ktv-bg-raised: #0b1020;
  --ktv-surface: rgba(15, 23, 42, 0.88);
  --ktv-border: rgba(148, 163, 184, 0.22);
  --ktv-text: #f8fafc;
  --ktv-muted: #cbd5e1;
  --ktv-weak: #94a3b8;
  --ktv-accent: #22d3ee;
  --ktv-success: #34d399;
  --ktv-warning: #fbbf24;
  --ktv-danger: #f87171;
}
```

Replace the current light UI with dark mobile-first styling:

- app background uses `--ktv-bg`;
- panels use `--ktv-surface`;
- buttons have 48px touch targets for primary commands;
- status chips use success/warning/danger colors;
- text has clear primary/muted hierarchy.

**Step 3: Reorder sections**

In `apps/mobile-controller/src/App.tsx`, keep the same runtime state and handlers but render the main flow as:

1. top bar;
2. reconnect/error banners;
3. current playback panel;
4. search panel;
5. queue panel;
6. dialogs.

Keep the online supplement block inside the search panel, because it is an extension of search rather than a separate primary workflow.

**Step 4: Verify**

Run:

```bash
pnpm -F @home-ktv/mobile-controller test -- src/test/controller.test.tsx
pnpm -F @home-ktv/mobile-controller typecheck
```

Expected: tests and typecheck pass.

**Step 5: Commit**

```bash
git add apps/mobile-controller/src/App.css apps/mobile-controller/src/App.tsx apps/mobile-controller/src/test/controller.test.tsx
git commit -m "feat(controller): apply dark mobile control layout"
```

### Task 4: Mobile Controller Cards And Dialogs

**Files:**
- Modify: `apps/mobile-controller/src/App.css`
- Modify: `apps/mobile-controller/src/test/controller.test.tsx`

**Step 1: Write regression tests**

Extend tests to confirm:

- duplicate queued songs still open the duplicate confirmation dialog;
- skip still opens the skip confirmation dialog;
- online supplement empty state still appears when no local result and no candidates.

Run:

```bash
pnpm -F @home-ktv/mobile-controller test -- src/test/controller.test.tsx
```

Expected: existing behavior should pass before CSS changes and remain passing after.

**Step 2: Style cards and dialogs**

Update CSS for:

- `.current-panel`
- `.search-panel`
- `.queue-row`
- `.song-row`
- `.online-panel`
- `.online-candidate-row`
- `.modal-backdrop`
- `.modal`

Constraints:

- no card inside card effect;
- no emoji icons;
- disabled buttons visibly disabled;
- long song titles wrap or ellipsize cleanly;
- destructive actions use danger styling.

**Step 3: Verify**

Run:

```bash
pnpm -F @home-ktv/mobile-controller test
pnpm -F @home-ktv/mobile-controller typecheck
```

Expected: all mobile controller tests and typecheck pass.

**Step 4: Commit**

```bash
git add apps/mobile-controller/src/App.css apps/mobile-controller/src/test/controller.test.tsx
git commit -m "feat(controller): restyle song cards and dialogs"
```

### Task 5: Visual Verification

**Files:**
- Generated: `logs/visual/*.png`

**Step 1: Start local dev stack**

Run:

```bash
pnpm dev:local
```

Expected: API, TV player, mobile controller, and admin app are available on their configured local ports.

**Step 2: Capture TV screenshots**

Run in another shell:

```bash
pnpm tv:visual-check
```

Expected: screenshots are written to:

- `logs/visual/tv-player-1920x1080.png`
- `logs/visual/tv-player-1366x768.png`

Inspect for:

- nonblank video/player surface;
- no text overlap;
- QR visible and scannable;
- bottom rail readable at 1366x768 and 1920x1080.

**Step 3: Capture mobile screenshots**

Run:

```bash
pnpm ui:visual-check
```

Expected: screenshots are written to:

- `logs/visual/mobile-controller-390x844.png`
- `logs/visual/mobile-controller-375x667.png`
- `logs/visual/admin-1440x900.png`
- `logs/visual/admin-768x900.png`

Inspect only mobile controller screenshots for this phase. Admin screenshots are produced by the existing script but are not part of this design change.

**Step 4: Final package verification**

Run:

```bash
pnpm -F @home-ktv/tv-player test
pnpm -F @home-ktv/mobile-controller test
pnpm -F @home-ktv/tv-player typecheck
pnpm -F @home-ktv/mobile-controller typecheck
```

Expected: all commands pass.

**Step 5: Commit verification adjustments if needed**

If visual review requires small CSS fixes:

```bash
git add apps/tv-player apps/mobile-controller
git commit -m "fix(ui): polish tv and controller visual details"
```

Do not commit generated files under `logs/visual` unless project policy changes.
