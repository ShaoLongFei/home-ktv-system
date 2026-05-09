# Phase 07 UAT

## 1. 启动

在仓库根目录执行：

```bash
DATABASE_URL=postgres://ktv:ktv@127.0.0.1:5432/home_ktv MEDIA_ROOT=/Users/shaolongfei/OtherProjects/home-ktv-system/home-ktv-media PUBLIC_BASE_URL=http://10.91.130.150:4000 pnpm dev:local restart
```

启动完成后打开这些地址：

- Admin: `http://10.91.130.150:5174/`
- Mobile: `http://10.91.130.150:5176/controller?room=living-room`
- TV: `http://10.91.130.150:5173/?apiBaseUrl=http://10.91.130.150:4000&roomSlug=living-room&deviceName=Living%20Room%20TV`

## 2. 默认中文

1. 分别打开 Admin、Mobile、TV 页面。
2. 确认三端默认都是中文。
3. Admin 和 Mobile 右上角都有语言切换按钮。
4. 切到 English 后再切回中文，确认页面文案恢复中文。

## 3. 手机点歌控制台

1. 打开 Mobile 页面。
2. 确认页面显示 `电视在线`。
3. 搜索一首本地歌曲，确认能看到本地结果。
4. 点 `点歌`，确认歌曲进入队列。
5. 点 `顶歌`，确认歌曲被提升到更前面。
6. 点 `删除`，确认队列项消失，再点 `撤销` 看能否恢复。
7. 点 `切歌`，确认有确认弹窗并能提交。
8. 在当前是原唱时，确认按钮显示 `切到伴唱`；在当前是伴唱时，确认按钮显示 `切到原唱`。
9. 搜索一首不存在的歌，确认会显示 `暂未找到在线补歌候选`。
10. 如果出现在线候选，点 `请求补歌`，确认按钮会进入 `提交中`，成功后变成 `已准备`。
11. 检查手机宽度下按钮文字居中，没有横向滚动。

## 4. 后台控制台

1. 打开 Admin 页面。
2. 先看 `导入审核工作台`、`歌曲目录`、`房间状态` 三个视图。
3. 在 Imports 里点 `扫描导入目录`，确认有 `扫描中...` 的反馈。
4. 在 Songs 里切换筛选、点 `重新校验歌曲`、点 `校验 song.json`，确认按钮可点击且有状态反馈。
5. 在 Rooms 里点 `刷新房间状态`、`刷新配对 token`，确认页面直接更新。
6. 在 Rooms 里对在线任务点 `入库`、`重试`、`清理`，确认结果能立刻反映，不需要手动刷新网页。
7. 确认房间状态里能看到 `电视在线` / `电视离线` 的中文状态。

## 5. TV 页面

1. 打开 TV 页面。
2. 确认空闲时显示 `扫码点歌`。
3. 如果浏览器需要点击开始播放，确认会出现 `点击电视开始播放`。
4. 播放中确认能看到 `mm:ss / mm:ss` 的时间。
5. 确认异常恢复时仍然显示中文提示，例如 `播放失败，已跳到下一首`。
6. 确认有房间冲突时显示 `已有电视端在线`。

## 6. 视觉截图检查

1. 确保 `pnpm dev:local restart` 正在运行。
2. 执行：

```bash
pnpm ui:visual-check
pnpm tv:visual-check
```

3. 检查 `logs/visual/` 下是否生成截图：
   - `mobile-controller-390x844.png`
   - `mobile-controller-375x667.png`
   - `admin-1440x900.png`
   - `admin-768x900.png`
   - `tv-player-1920x1080.png`
   - `tv-player-1366x768.png`
4. 确认截图里没有文字重叠、按钮溢出或空白页面。

## 7. 通过标准

1. 三端默认中文。
2. Mobile 能正常点歌、顶歌、删除、撤销、切歌、切换原唱/伴唱、请求补歌。
3. Admin 的扫描、校验、刷新、入库、重试、清理都能看到即时反馈。
4. TV 继续保持 Phase 6 的播放体验和中文提示。
5. `pnpm ui:visual-check` 和 `pnpm tv:visual-check` 都能生成截图。
6. `pnpm -F @home-ktv/mobile-controller test`、`pnpm -F @home-ktv/admin test`、`pnpm -F @home-ktv/tv-player test`、`pnpm typecheck` 全部通过。
