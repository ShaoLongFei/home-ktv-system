# Phase 10 UAT：已配对 Mobile 视觉验证

## 1. 启动本地服务

在仓库根目录启动本地 API、Admin、TV 和 Mobile 服务：

```bash
pnpm dev:local restart
```

启动后确认 API、Admin 和 Mobile Controller 都在运行。默认房间是 `living-room`，默认 API 地址是 `http://127.0.0.1:4000`。

## 2. 自动配对截图

先运行轻量回归测试和帮助输出检查：

```bash
pnpm ui:visual-check:test
node scripts/ui-visual-check.mjs --help
```

然后生成 Admin 和 Mobile 截图：

```bash
pnpm ui:visual-check
```

默认情况下脚本不会打开裸 `/controller?room=living-room`。因为截图脚本使用临时 Chrome profile，裸 Mobile URL 没有现成控制会话 cookie，容易停在未配对或会话错误页。

默认情况下脚本会请求 `POST /admin/rooms/living-room/pairing-token/refresh`，从返回值中读取带 `token=` 的 `pairing.controllerUrl`。临时 Chrome profile 打开这个带 token 的 Mobile URL 后，Mobile 运行时代码会调用 control session 创建接口，并写入控制会话 cookie，随后进入已配对控制台状态。

如果设置了 `MOBILE_VISUAL_URL`，脚本会完全使用该 URL 并跳过自动配对。这是本地调试或临时复现问题时的兜底方式。

## 3. 截图内容检查

检查 `logs/visual/` 下生成的四个文件：

- `logs/visual/mobile-controller-390x844.png`
- `logs/visual/mobile-controller-375x667.png`
- `logs/visual/admin-1440x900.png`
- `logs/visual/admin-768x900.png`

Mobile 截图中能看到中文点歌控制台内容。Mobile 截图不能停留在 `CONTROL_SESSION_REQUIRED`、`INVALID_PAIRING_TOKEN`、`Failed to fetch` 或空白页。

Mobile 截图应处于已配对控制台状态，可见搜索、队列、当前播放或电视状态区域，而不是未配对错误页。手机宽度下按钮文字应居中，不应出现横向滚动、文字溢出或主要控制区域被遮挡。

## 4. 覆盖手动 URL 的兜底方式

如果需要绕过自动配对，可以手动提供完整 Mobile URL：

```bash
MOBILE_VISUAL_URL="http://127.0.0.1:5176/controller?room=living-room&token=<token>" pnpm ui:visual-check
```

设置 `MOBILE_VISUAL_URL` 后，脚本不会请求 `POST /admin/rooms/living-room/pairing-token/refresh`，也不会改写该 URL。该模式只用于临时诊断；标准验收应优先使用默认自动配对路径。

## 5. 通过标准

自动门禁全部通过：

```bash
pnpm ui:visual-check:test
node scripts/ui-visual-check.mjs --help
pnpm -F @home-ktv/mobile-controller test
pnpm -F @home-ktv/api test -- src/test/control-sessions.test.ts src/test/admin-room-status.test.ts
pnpm typecheck
```

视觉门禁在本地服务和 Chrome 可用时通过：

```bash
pnpm dev:local status
pnpm ui:visual-check
```

通过时必须同时满足：

1. 四个截图文件都存在且不是空文件。
2. 两张 Mobile 截图显示中文点歌控制台内容。
3. 两张 Mobile 截图显示已配对控制台状态，可见搜索、队列、当前播放或电视状态区域。
4. 两张 Mobile 截图没有 `CONTROL_SESSION_REQUIRED`、`INVALID_PAIRING_TOKEN`、`Failed to fetch` 或空白页。
5. `MOBILE_VISUAL_URL` 仍然可以作为完整手动 URL 覆盖，并且会跳过自动配对。
