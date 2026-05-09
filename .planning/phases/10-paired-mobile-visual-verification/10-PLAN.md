---
phase: 10-paired-mobile-visual-verification
plan: 01
type: execute
wave: 1
depends_on: ["09-verification-traceability-closure"]
gap_closure: true
files_modified:
  - scripts/ui-visual-check.mjs
  - scripts/ui-visual-check.test.mjs
  - package.json
  - .planning/phases/10-paired-mobile-visual-verification/10-UAT.md
autonomous: true
requirements:
  - PROD-03
  - PROD-05
requirements_addressed: [PROD-03, PROD-05]
must_haves:
  truths:
    - "Default Mobile visual checks capture a token-paired controller state when MOBILE_VISUAL_URL is not explicitly set"
    - "MOBILE_VISUAL_URL remains a full manual override and does not call the pairing API"
    - "Existing screenshot outputs remain exactly mobile-controller-390x844.png, mobile-controller-375x667.png, admin-1440x900.png, and admin-768x900.png"
    - "Service/pairing failures tell the operator which endpoint failed and that pnpm dev:local restart should be running"
    - "Phase 10 UAT explains that the script obtains a fresh pairing URL from POST /admin/rooms/:roomSlug/pairing-token/refresh"
  artifacts:
    - path: "scripts/ui-visual-check.mjs"
      provides: "Lightweight Chrome screenshot helper with deterministic paired Mobile URL resolution"
      contains: "pairing-token/refresh"
    - path: "scripts/ui-visual-check.test.mjs"
      provides: "Node built-in test coverage for paired URL resolution and failure messaging"
      contains: "MOBILE_VISUAL_URL"
    - path: "package.json"
      provides: "Root script entry for the lightweight script test"
      contains: "ui:visual-check:test"
    - path: ".planning/phases/10-paired-mobile-visual-verification/10-UAT.md"
      provides: "Chinese validation steps for paired Mobile visual verification"
      contains: "已配对"
  key_links:
    - from: "scripts/ui-visual-check.mjs"
      to: "apps/api/src/routes/admin-rooms.ts"
      via: "visual helper refreshes a pairing URL through the existing Admin Rooms route"
      pattern: "/admin/rooms/:roomSlug/pairing-token/refresh"
    - from: "scripts/ui-visual-check.mjs"
      to: "apps/mobile-controller/src/runtime/use-room-controller-runtime.ts"
      via: "tokenized controller URL triggers Mobile control-session creation in a fresh Chrome profile"
      pattern: "initial.pairingToken"
    - from: ".planning/phases/10-paired-mobile-visual-verification/10-UAT.md"
      to: "scripts/dev-local.mjs"
      via: "UAT uses the existing local launcher and explains required running services"
      pattern: "pnpm dev:local restart"
---

<objective>
Close the paired Mobile visual-check gap without redesigning the Mobile UI or adding a heavy browser test stack.

Purpose: Phase 7's screenshot helper currently opens `/controller?room=living-room` in a temporary Chrome profile, so it cannot rely on an existing control-session cookie and can miss the paired controller state. Phase 10 makes the default visual check obtain a fresh pairing URL, capture the same phone-width screenshots in the paired state, and document how to verify it.
Output: a testable `scripts/ui-visual-check.mjs`, a lightweight Node test file, a root test script, and Chinese UAT instructions.
</objective>

<execution_context>
@/Users/shaolongfei/.codex/get-shit-done/workflows/execute-plan.md
@/Users/shaolongfei/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/v1.1-MILESTONE-AUDIT.md
@.planning/phases/10-paired-mobile-visual-verification/10-CONTEXT.md
@.planning/phases/07-productized-ui-polish/07-UAT.md
@.planning/phases/07-productized-ui-polish/07-VERIFICATION.md
@scripts/ui-visual-check.mjs
@scripts/dev-local.mjs
@apps/api/src/routes/admin-rooms.ts
@apps/api/src/routes/control-sessions.ts
@apps/api/src/modules/rooms/pairing-token-service.ts
@apps/mobile-controller/src/runtime/use-room-controller-runtime.ts
@apps/mobile-controller/src/api/client.ts
@package.json
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add paired Mobile URL resolution tests</name>
  <files>scripts/ui-visual-check.test.mjs, package.json</files>
  <read_first>
    - scripts/ui-visual-check.mjs
    - package.json
    - apps/api/src/routes/admin-rooms.ts
    - apps/api/src/modules/rooms/pairing-token-service.ts
    - apps/mobile-controller/src/runtime/use-room-controller-runtime.ts
  </read_first>
  <action>
    Create `scripts/ui-visual-check.test.mjs` using Node's built-in `node:test` and `node:assert/strict`; do not add dependencies.

    The tests must import pure helper functions from `scripts/ui-visual-check.mjs`, so the implementation task must make the CLI safe to import by guarding `await main()` behind an entrypoint check.

    Add these tests:
    - `resolveMobileVisualUrl uses MOBILE_VISUAL_URL override without fetch`: pass env `{ MOBILE_VISUAL_URL: "http://phone.local/controller?room=test-room" }`; use a fetch stub that throws if called; assert the returned URL is exactly the override.
    - `resolveMobileVisualUrl refreshes a pairing token when no override exists`: pass env `{ API_VISUAL_URL: "http://127.0.0.1:4000", TV_ROOM_SLUG: "living-room" }`; use a fetch stub that records URL/method and returns `{ ok: true, status: 200, json: async () => ({ pairing: { controllerUrl: "http://127.0.0.1:5176/controller?room=living-room&token=token-visual" } }) }`; assert the request is `POST http://127.0.0.1:4000/admin/rooms/living-room/pairing-token/refresh` and the returned URL contains `token=token-visual`.
    - `resolveMobileVisualUrl reports unavailable pairing endpoint clearly`: use a fetch stub returning `{ ok: false, status: 500, text: async () => "database unavailable" }`; assert the thrown message contains `POST /admin/rooms/living-room/pairing-token/refresh`, `500`, `database unavailable`, and `pnpm dev:local restart`.
    - `resolveMobileVisualUrl rejects malformed pairing payload`: return `{ ok: true, status: 200, json: async () => ({ pairing: {} }) }`; assert the thrown message contains `pairing.controllerUrl`.

    Add a root script to `package.json`:
    - `"ui:visual-check:test": "node --test scripts/ui-visual-check.test.mjs"`
  </action>
  <verify>
    <automated>pnpm ui:visual-check:test</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/ui-visual-check.test.mjs` contains `node:test`.
    - `scripts/ui-visual-check.test.mjs` contains `token=token-visual`.
    - `scripts/ui-visual-check.test.mjs` contains `pnpm dev:local restart`.
    - `package.json` contains `"ui:visual-check:test": "node --test scripts/ui-visual-check.test.mjs"`.
    - `pnpm ui:visual-check:test` exits 0.
  </acceptance_criteria>
  <done>The paired URL resolution behavior is specified before changing the screenshot flow.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Make ui visual check capture a paired Mobile controller by default</name>
  <files>scripts/ui-visual-check.mjs</files>
  <read_first>
    - scripts/ui-visual-check.mjs
    - scripts/ui-visual-check.test.mjs
    - apps/api/src/routes/admin-rooms.ts
    - apps/api/src/routes/control-sessions.ts
    - apps/api/src/modules/rooms/pairing-token-service.ts
    - apps/mobile-controller/src/runtime/use-room-controller-runtime.ts
    - apps/mobile-controller/src/api/client.ts
  </read_first>
  <action>
    Refactor `scripts/ui-visual-check.mjs` without changing the four screenshot filenames or adding dependencies.

    Required exported helpers:
    - `buildVisualConfig(env = process.env)` returning `{ adminUrl, apiBaseUrl, chromeBin, mobileOverrideUrl, roomSlug }`.
    - `resolveMobileVisualUrl({ config, fetchImpl = fetch })` returning the final Mobile URL string.
    - `refreshPairingControllerUrl({ apiBaseUrl, roomSlug, fetchImpl })` returning `pairing.controllerUrl`.

    Required environment behavior:
    - `ADMIN_VISUAL_URL`: unchanged, default `http://127.0.0.1:5174/`.
    - `MOBILE_VISUAL_URL`: full manual override. If set to a non-empty value, return it directly and do not call fetch.
    - `API_VISUAL_URL`: API base URL used only for pairing refresh, default `PUBLIC_BASE_URL` when set, otherwise `http://127.0.0.1:4000`.
    - `TV_ROOM_SLUG`: room slug for pairing refresh, default `living-room`.
    - `CHROME_BIN`: unchanged, default `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

    Required pairing refresh behavior:
    - When `MOBILE_VISUAL_URL` is not set, issue `POST ${apiBaseUrl}/admin/rooms/${encodeURIComponent(roomSlug)}/pairing-token/refresh`.
    - Parse JSON and require `pairing.controllerUrl` to be a non-empty string that includes `/controller?` and `token=`.
    - Use that tokenized URL for both Mobile screenshots.
    - Keep using the temporary Chrome profile under `logs/visual/.chrome-ui-check-*`; do not try to share local browser cookies.

    Required failure messages:
    - Non-OK response: throw an Error whose message includes `POST /admin/rooms/${roomSlug}/pairing-token/refresh`, the HTTP status, the response text when present, `API_VISUAL_URL`, and `pnpm dev:local restart`.
    - Network/fetch failure: throw an Error whose message includes `Unable to resolve paired Mobile visual URL`, `API_VISUAL_URL`, and `pnpm dev:local restart`.
    - Malformed response: throw an Error whose message includes `pairing.controllerUrl`.

    Required help output:
    - Continue to print `ADMIN_VISUAL_URL`, `MOBILE_VISUAL_URL`, and `CHROME_BIN`.
    - Add `API_VISUAL_URL` and `TV_ROOM_SLUG`.
    - State that default Mobile capture obtains a fresh paired controller URL from `POST /admin/rooms/<room>/pairing-token/refresh`.
    - State that `MOBILE_VISUAL_URL` bypasses automatic pairing.
    - Continue to list all four screenshot output filenames.
  </action>
  <verify>
    <automated>pnpm ui:visual-check:test</automated>
    <automated>node scripts/ui-visual-check.mjs --help</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/ui-visual-check.mjs` contains `export function buildVisualConfig`.
    - `scripts/ui-visual-check.mjs` contains `export async function resolveMobileVisualUrl`.
    - `scripts/ui-visual-check.mjs` contains `pairing-token/refresh`.
    - `scripts/ui-visual-check.mjs` contains `API_VISUAL_URL`.
    - `scripts/ui-visual-check.mjs` contains `TV_ROOM_SLUG`.
    - `scripts/ui-visual-check.mjs` still contains `mobile-controller-390x844.png`.
    - `scripts/ui-visual-check.mjs` still contains `mobile-controller-375x667.png`.
    - `scripts/ui-visual-check.mjs` still contains `admin-1440x900.png`.
    - `scripts/ui-visual-check.mjs` still contains `admin-768x900.png`.
    - `pnpm ui:visual-check:test` exits 0.
    - `node scripts/ui-visual-check.mjs --help` exits 0 and prints `pairing-token/refresh`.
  </acceptance_criteria>
  <done>The default Mobile visual URL is deterministic and paired, while the existing override and screenshot outputs remain stable.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Document Phase 10 UAT and run final gates</name>
  <files>.planning/phases/10-paired-mobile-visual-verification/10-UAT.md</files>
  <read_first>
    - .planning/phases/10-paired-mobile-visual-verification/10-CONTEXT.md
    - .planning/phases/07-productized-ui-polish/07-UAT.md
    - scripts/dev-local.mjs
    - scripts/ui-visual-check.mjs
    - package.json
  </read_first>
  <action>
    Create `.planning/phases/10-paired-mobile-visual-verification/10-UAT.md` in Chinese.

    Include these exact sections:
    - `## 1. 启动本地服务`
    - `## 2. 自动配对截图`
    - `## 3. 截图内容检查`
    - `## 4. 覆盖手动 URL 的兜底方式`
    - `## 5. 通过标准`

    Include the startup command:
    `pnpm dev:local restart`

    Include the automated commands:
    - `pnpm ui:visual-check:test`
    - `node scripts/ui-visual-check.mjs --help`
    - `pnpm ui:visual-check`

    Explain the pairing/session mechanism concretely:
    - 默认情况下脚本不会打开裸 `/controller?room=living-room`。
    - 默认情况下脚本会请求 `POST /admin/rooms/living-room/pairing-token/refresh` 获得带 `token=` 的 `pairing.controllerUrl`。
    - 临时 Chrome profile 打开带 token 的 Mobile URL 后，Mobile 运行时代码会创建 control session 并写入控制会话 cookie。
    - 如果设置了 `MOBILE_VISUAL_URL`，脚本会完全使用该 URL 并跳过自动配对。

    Include screenshot file checks:
    - `logs/visual/mobile-controller-390x844.png`
    - `logs/visual/mobile-controller-375x667.png`
    - `logs/visual/admin-1440x900.png`
    - `logs/visual/admin-768x900.png`

    Include visible Mobile screenshot assertions:
    - Mobile 截图中能看到中文点歌控制台内容。
    - Mobile 截图不能停留在 `CONTROL_SESSION_REQUIRED`、`INVALID_PAIRING_TOKEN`、`Failed to fetch` 或空白页。
    - Mobile 截图应处于已配对控制台状态，可见搜索/队列/当前播放或电视状态区域，而不是未配对错误页。

    Run final gates:
    - `pnpm ui:visual-check:test`
    - `node scripts/ui-visual-check.mjs --help`
    - `pnpm -F @home-ktv/mobile-controller test`
    - `pnpm -F @home-ktv/api test -- src/test/control-sessions.test.ts src/test/admin-room-status.test.ts`
    - `pnpm typecheck`

    If local services and Chrome are available, also run:
    - `pnpm dev:local status`
    - `pnpm ui:visual-check`

    Do not mark PROD-03 or PROD-05 complete in `.planning/REQUIREMENTS.md` during execution unless the automated gates pass and the paired Mobile screenshot has been inspected against the Phase 10 UAT criteria.
  </action>
  <verify>
    <automated>pnpm ui:visual-check:test</automated>
    <automated>node scripts/ui-visual-check.mjs --help</automated>
    <automated>pnpm -F @home-ktv/mobile-controller test</automated>
    <automated>pnpm -F @home-ktv/api test -- src/test/control-sessions.test.ts src/test/admin-room-status.test.ts</automated>
    <automated>pnpm typecheck</automated>
    <manual>With local services running, `pnpm ui:visual-check` creates all four PNG files and the two Mobile screenshots show the paired controller instead of a pairing/session error.</manual>
  </verify>
  <acceptance_criteria>
    - `.planning/phases/10-paired-mobile-visual-verification/10-UAT.md` contains `## 2. 自动配对截图`.
    - `.planning/phases/10-paired-mobile-visual-verification/10-UAT.md` contains `POST /admin/rooms/living-room/pairing-token/refresh`.
    - `.planning/phases/10-paired-mobile-visual-verification/10-UAT.md` contains `MOBILE_VISUAL_URL`.
    - `.planning/phases/10-paired-mobile-visual-verification/10-UAT.md` contains `CONTROL_SESSION_REQUIRED`.
    - `pnpm ui:visual-check:test` exits 0.
    - `node scripts/ui-visual-check.mjs --help` exits 0.
    - `pnpm -F @home-ktv/mobile-controller test` exits 0.
    - `pnpm -F @home-ktv/api test -- src/test/control-sessions.test.ts src/test/admin-room-status.test.ts` exits 0.
    - `pnpm typecheck` exits 0.
  </acceptance_criteria>
  <done>Phase 10 has clear automated and manual validation steps for paired Mobile visual coverage.</done>
</task>

</tasks>

<verification>
Before declaring this plan complete:
- [ ] `pnpm ui:visual-check:test`
- [ ] `node scripts/ui-visual-check.mjs --help`
- [ ] `pnpm -F @home-ktv/mobile-controller test`
- [ ] `pnpm -F @home-ktv/api test -- src/test/control-sessions.test.ts src/test/admin-room-status.test.ts`
- [ ] `pnpm typecheck`
- [ ] With local services and Chrome available, `pnpm ui:visual-check` creates the existing four PNG files and Mobile screenshots show the paired controller state.
</verification>

<success_criteria>
- PROD-03: Mobile phone-width visual validation now reaches a paired controller state, so layout checks cover the actual control surface rather than an unpaired/session-error page.
- PROD-05: The paired-state visual path has lightweight regression coverage, help output, and Chinese UAT instructions that cover state/error handling without manual guesswork.
- No Mobile UI redesign, browser-test dependency, or screenshot filename churn is introduced.
</success_criteria>

<output>
After completion, create `.planning/phases/10-paired-mobile-visual-verification/10-SUMMARY.md`.
</output>
