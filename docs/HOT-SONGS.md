# 热门歌曲榜单工具

这个工具用于定期生成 KTV 曲库的热门歌曲候选列表。它会从多个音乐平台和 KTV 榜单拉取公开榜单数据，统一歌名和歌手写法，再按来源权重与榜单排名融合成一个 CSV 总榜。

最终给人看的文件是：

```text
ranked-songs.csv
```

字段保持精简：

```text
rank,title,artist,score
```

## 最快使用

在项目根目录运行：

```bash
pnpm hot-songs:update
```

默认会读取：

```text
packages/hot-songs/config/sources.example.json
```

默认输出到：

```text
.planning/reports/hot-songs/run-<timestamp>/
```

指定输出目录：

```bash
pnpm hot-songs:update -- --out .planning/reports/hot-songs/latest
```

本地确定性检查，不访问网络：

```bash
pnpm hot-songs:update -- --fixture --out .planning/reports/hot-songs/fixture-check
```

## 输出文件

一次 `hot-songs:update` 会把完整流水线产物写到同一个目录：

```text
source-rows.json
source-report.json
sources/<source-id>.json
candidate-snapshot.json
ranked-songs.csv
ranked-songs.audit.json
near-duplicates.csv
```

`ranked-songs.csv` 是日常使用的最终总榜。

`source-report.json` 记录每个来源的状态、行数、是否可用、是否用了 Cookie，以及失败原因。

`candidate-snapshot.json` 是归一化后的候选歌曲快照，适合排查歌名和歌手合并问题。

`ranked-songs.audit.json` 包含每首歌来自哪些榜单、各榜单贡献了多少分，适合调试权重。

`near-duplicates.csv` 列出疑似同歌名但没有自动合并的歌曲。这个文件用于人工补 alias，不会直接影响最终榜。

## 服务器定时运行

建议固定输出到 `latest`，这样后续下载器或其它程序只需要读取一个稳定路径：

```bash
cd /Users/shaolongfei/OtherProjects/home-ktv-system
pnpm hot-songs:update -- --out .planning/reports/hot-songs/latest
```

每周运行一次的 cron 示例：

```cron
20 4 * * 1 cd /Users/shaolongfei/OtherProjects/home-ktv-system && pnpm hot-songs:update -- --out .planning/reports/hot-songs/latest >> .planning/reports/hot-songs/latest.log 2>&1
```

如果你在其它地方完成采集，只想复用本项目的归一化和融合：

```bash
pnpm hot-songs:update -- \
  --source-rows /path/to/source-rows.json \
  --source-report /path/to/source-report.json \
  --out .planning/reports/hot-songs/latest
```

`--source-report` 可选，但建议提供。提供后程序会过滤掉不可用来源的歌曲行，避免失败来源污染最终榜。

## Cookie 和代理

部分榜单在未登录时可能只返回平台限制数量。可以通过环境变量提供 Cookie：

```bash
export QQ_MUSIC_COOKIE='...'
export KUGOU_COOKIE='...'
export NETEASE_COOKIE='...'
```

具体哪些来源需要 Cookie，可查看 `packages/hot-songs/config/sources.example.json` 中的 `authCookieEnv` 字段。

如果服务器需要代理，可使用 Node/HTTP 常见代理环境变量：

```bash
export HTTPS_PROXY='http://127.0.0.1:7890'
export HTTP_PROXY='http://127.0.0.1:7890'
```

程序会自动把 `music.163.com` 和 `www.51vv.com` 加入 `NO_PROXY`，因为这两个站点在当前环境下直接访问更稳定。

## 工作原理

流程分三步：

1. 采集：每个榜单由一个 adapter 拉取，输出统一的 `SourceRow`。
2. 归一化：清理歌名、歌手、版本信息，把同一首歌归到同一个候选项。
3. 融合：每个来源按权重贡献积分，排名越靠前贡献越高，同一来源对同一首歌只保留最佳证据。

当前单条来源贡献分：

```text
source.weight * 10 * 60 / (60 + rank)
```

这不是百分制。它是可累加积分：多个高质量来源都出现的歌曲会自然靠前，单个强来源的冠军也有较高权重，但不会压过多榜单共识。

同名处理是保守的。程序会自动归一化常见空格、符号、大小写和版本标记，但不会强行合并相似歌名。疑似重复会进入 `near-duplicates.csv`，确认后可以通过 alias 文件显式合并：

```json
{
  "titleAliases": {
    "run wild 向风而野": ["run wild"]
  },
  "artistAliases": {
    "邓紫棋": ["g e m 邓紫棋"]
  }
}
```

使用 alias：

```bash
pnpm hot-songs:update -- --aliases .planning/reports/hot-songs/fusion-aliases.json
```

## 调试命令

一键命令适合日常使用。排查问题时，可以单独运行三段：

```bash
pnpm hot-songs:sources -- \
  --manifest packages/hot-songs/config/sources.example.json \
  --out .planning/reports/hot-songs/sources-debug
```

```bash
pnpm hot-songs:normalize -- \
  --source-rows .planning/reports/hot-songs/sources-debug/source-rows.json \
  --source-report .planning/reports/hot-songs/sources-debug/source-report.json \
  --out .planning/reports/hot-songs/candidates-debug
```

```bash
pnpm hot-songs:fuse -- \
  --manifest packages/hot-songs/config/sources.example.json \
  --candidate-snapshot .planning/reports/hot-songs/candidates-debug/candidate-snapshot.json \
  --out .planning/reports/hot-songs/fused-debug
```

只拉取某个来源：

```bash
pnpm hot-songs:update -- --source kugou-top500 --out .planning/reports/hot-songs/kugou-debug
```

## 常见问题

榜单数量低于预期：先看 `source-report.json`。如果状态是 `platform_cap`，通常是平台公开接口限制；如果是 `failed_below_min_rows`，可能需要 Cookie、代理或更新 adapter。

最终榜少了某个平台的歌：检查该来源在 `source-report.json` 里是否 `usable: true`。归一化阶段默认只使用可用来源。

同一首歌出现多个版本：先看 `near-duplicates.csv`。确认确实是同一首歌后，加 alias 文件，不建议在代码里硬编码个案。

分数看起来不是 100 分制：这是预期行为。分数是积分，方便多来源累加，绝对值不代表百分比。

网络失败：先用 `--source <id>` 缩小范围，再调整代理或 Cookie。
