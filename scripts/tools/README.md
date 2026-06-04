# scripts/tools 工具脚本说明

这个目录放项目级工具脚本，主要用于部署自检、真实服务器 smoke、视觉截图、封面批处理、风格标签批处理和仓库卫生检查。这里的脚本不是业务运行时主流程，但很多会被 `package.json`、`deploy/source/ktv.sh` 或 `deploy/docker/ktv.sh` 调用。

原则：

- 正式可复用工具放在这里，并配套测试或 runbook。
- 临时调研输出、日志、截图和批处理结果不要放进这个目录；它们应写到 `runtime/`、`logs/` 或其它已忽略目录。
- Python 批处理脚本负责长任务和外部接口批量调用；Node 脚本主要负责部署、Web smoke 和浏览器截图检查。

## 脚本总览

| 文件 | 作用 | 常用入口 |
| --- | --- | --- |
| `deploy-doctor.mjs` | 部署环境自检，检查 env、CORS、媒体路径、服务状态和公开 URL。 | `pnpm deploy:doctor` / `bash deploy/source/ktv.sh doctor` |
| `web-deploy-smoke.mjs` | 部署后的公开入口 smoke，验证 CORS、TV bootstrap、heartbeat、控制端看到 TV 在线、推荐列表非空。 | `pnpm deploy:smoke` / `bash deploy/source/ktv.sh smoke` |
| `repo-hygiene-check.mjs` | 提交前仓库卫生检查，区分 tracked dirty、高风险未跟踪文件和本地运行产物。 | `pnpm repo:hygiene` |
| `music_metadata_sidecar.mjs` | 本地 Node 元数据 sidecar，统一查询 `netease / tencent / kugou / kuwo` 的歌曲候选元数据，并查询网易云/酷狗歌单证据，供封面抓取和标签批处理复用。 | `node scripts/tools/music_metadata_sidecar.mjs` |
| `fetch_song_covers.py` | 批量查询、下载并缓存歌曲封面，也支持单首歌封面探测；把本地公开封面 URL 写回 `ktv_songs.cover_image_url`。 | `bash deploy/source/ktv.sh fetch-covers -- ...` / `python3 scripts/tools/fetch_song_covers.py probe 夜之光 花姐` |
| `run_style_tagging_llm_batch.py` | 离线批量给歌曲补风格标签，先生成 JSONL，再导入 `ktv_songs.style_tags`。 | `pnpm ktv:tags:llm-batch:py -- ...` |
| `ui-visual-check.mjs` | 控制端和 Admin 的 Chrome 截图检查。 | `pnpm ui:visual-check` |
| `tv-visual-check.mjs` | Web TV 的 Chrome 截图检查。 | `pnpm tv:visual-check` |
| `real-mv-playback-risk-spike.mjs` | 真实 MV 播放兼容性调研，输出 Markdown 风险报告。 | `pnpm real-mv:risk-spike -- ...` |
| `source-deployment-docs.test.mjs` | 源码部署文档和部署脚本的契约测试。 | `node --test scripts/tools/source-deployment-docs.test.mjs` |

`*.test.mjs` 和 `*_test.py` 是对应工具的测试文件，不是生产脚本入口。

## 测试文件清单

| 文件 | 覆盖内容 |
| --- | --- |
| `deploy-doctor.test.mjs` | 部署 doctor 的 env 解析、CORS、媒体路径、网络重试、服务状态和 KTV 索引诊断输出。 |
| `web-deploy-smoke.test.mjs` | Web smoke 的 CORS、页面可达性、TV bootstrap/heartbeat、控制端 session 和 discovery 检查。 |
| `repo-hygiene-check.test.mjs` | Git 状态解析、高风险未跟踪路径识别和 dirty 报告。 |
| `music_metadata_sidecar.test.mjs` | 元数据 sidecar 的 JSONL 协议、provider 归一化、候选缓存和最佳匹配选择。 |
| `fetch_song_covers_test.py` | 封面路径、公开 URL、并发调度、图片校验、历史跳过、匹配评分、provider fallback、单首探测和 JSONL 历史读取。 |
| `run_style_tagging_llm_batch_test.py` | LLM 标签批处理的短 ID prompt、返回校验、标签过滤和导入 SQL。 |
| `ui-visual-check.test.mjs` | 控制端视觉截图 URL 的 pairing token 刷新和错误处理。 |
| `real-mv-playback-risk-spike.test.mjs` | MV 播放风险报告的 controlled/local sample 输出。 |
| `source-deployment-docs.test.mjs` | 源码部署文档、部署 wrapper、Vite preview 端口和旧 Docker app 停止策略。 |

## deploy-doctor.mjs

`deploy-doctor.mjs` 用来回答“当前部署环境是否具备启动和访问 HomeKTV 的基本条件”。它支持 Docker 和源码部署两种模式。

核心逻辑：

1. 读取部署 `.env`。
2. 组装 API、Admin、Controller、TV Web、媒体路径和路径映射配置。
3. 检查必需环境变量是否存在。
4. 检查 CORS 是否包含前端来源。
5. 检查媒体路径和 NAS 映射。
6. 可选执行服务状态命令。
7. 可选访问公开 URL 和 KTV 索引诊断。

常用命令：

```bash
node scripts/tools/deploy-doctor.mjs --mode source --env-file deploy/source/.env
node scripts/tools/deploy-doctor.mjs --mode docker --env-file deploy/docker/.env --json
```

源码部署 wrapper 会调用它：

```bash
bash deploy/source/ktv.sh doctor
```

相关测试：

```bash
node --test scripts/tools/deploy-doctor.test.mjs
```

## web-deploy-smoke.mjs

`web-deploy-smoke.mjs` 是每次部署后通知测试前要跑的公开入口 smoke。它不是只检查页面 200，而是会模拟 TV 和控制端的最小联动。

核心逻辑：

1. 检查 Controller 和 TV Web 来源的 CORS。
2. 检查 TV Web 和 Controller 静态页面可访问。
3. 检查前端构建产物里嵌入的默认 API base URL。
4. 调用 `/player/bootstrap` 注册一台临时 TV。
5. 调用 `/player/heartbeat` 上报 TV 在线。
6. 用 pairing token 创建控制端 session，并确认控制端看到 TV 在线。
7. 调用歌曲 discovery，确认推荐列表非空。

常用命令：

```bash
node scripts/tools/web-deploy-smoke.mjs \
  --api-base-url https://ktv-api.shaolongfei.com \
  --controller-base-url https://ktv-controller.shaolongfei.com \
  --tv-web-base-url https://ktv-tv.shaolongfei.com \
  --room living-room
```

源码部署 wrapper 会调用它：

```bash
bash deploy/source/ktv.sh smoke
```

相关测试：

```bash
node --test scripts/tools/web-deploy-smoke.test.mjs
```

## repo-hygiene-check.mjs

`repo-hygiene-check.mjs` 用于提交或部署前检查仓库是否混入了不该提交的内容。

核心逻辑：

1. 读取 `git status --porcelain`。
2. 区分 tracked dirty 和 untracked。
3. 把 `apps/`、`clients/`、`packages/`、`deploy/`、`scripts/`、`docs/` 等目录下的未跟踪文件标为高风险。
4. 列出 `runtime/`、`logs/`、`songs-sample/` 等本地运行目录。
5. `--fail-on-dirty` 模式下，如果存在 tracked dirty 或高风险未跟踪文件，就以非 0 退出。

常用命令：

```bash
pnpm repo:hygiene
pnpm repo:hygiene -- --fail-on-dirty
```

详细规则见 [仓库卫生 Runbook](../../docs/runbooks/repo-hygiene.md)。

相关测试：

```bash
node --test scripts/tools/repo-hygiene-check.test.mjs
```

## fetch_song_covers.py

`fetch_song_covers.py` 用于批量补歌曲封面。当前只处理 NAS 曲库，把图片下载到本地缓存目录，再把公开图片地址写回 `ktv_songs.cover_image_url`。

核心逻辑：

1. 从 `ktv_songs` 读取 `missing_at is null`、歌名和主歌手非空的歌曲。
2. 读取历史 JSONL，默认跳过上次 `failed` 或 `not_found` 的歌曲，避免重复打外部源。
3. 如果本地已有封面文件但数据库 URL 不一致，只修复数据库 URL。
4. 如果数据库已有外部图片 URL，优先尝试下载该外链。
5. 否则按 provider 顺序查询：`netease`、`cloud`、`tencent`、`kugou`、`kuwo`、`spotify`。
6. 默认会先尝试启动本地 `music_metadata_sidecar.mjs`，统一为 `netease / tencent / kugou / kuwo` 提供候选元数据；如果 sidecar 启动失败或单次查询失败，脚本会自动退回原来的 Python provider 逻辑。
7. 候选结果先在全部 provider 中按歌名和歌手严格匹配；严格匹配都没有命中时，再按 provider 顺序退回只按歌名匹配。
8. 下载图片到 `$MEDIA_ROOT/covers/nas/<song-id>.jpg`。
9. 写回 `ktv_songs.cover_image_url` 和 `cover_updated_at`。
10. 每首歌向 JSONL 追加一行结果，并周期性刷新 state 文件。

子命令：

- `fetch`：实际下载封面并写数据库。
- `coverage`：只测 provider 覆盖率，不写数据库。
- `probe`：单首歌探测，按同一套 provider 顺序返回首个可用封面，可选下载图片。
- `status`：打印数据库覆盖情况和历史任务摘要。

常用命令：

```bash
bash deploy/source/ktv.sh cover-status
bash deploy/source/ktv.sh cover-coverage -- --limit 100 --concurrency 4 --delay-ms 200
bash deploy/source/ktv.sh fetch-covers -- --limit 1000 --concurrency 4 --delay-ms 150
python3 scripts/tools/fetch_song_covers.py probe 冲动的惩罚 刀郎 --providers netease,cloud --netease-base-url http://127.0.0.1:4300
python3 scripts/tools/fetch_song_covers.py probe 夜之光 花姐 --providers cloud --download runtime/probes/night-light.jpg
bash deploy/source/ktv.sh cover-coverage -- --providers netease,cloud,spotify --limit 100 --delay-ms 100
python3 scripts/tools/fetch_song_covers.py coverage --metadata-sidecar-providers netease,tencent,kugou,kuwo --limit 50
```

`spotify` provider 会优先使用 `SpotifyScraper` 的公开接口读取 track 信息和专辑图片。如果当前 Python 环境未安装该库，脚本仍可使用 Spotify 搜索结果里的封面 URL 作为兜底；需要启用完整能力时安装：

```bash
python3 -m pip install --user spotifyscraper
```

服务器如果提示 `externally-managed-environment`，使用：

```bash
python3 -m pip install --user --break-system-packages spotifyscraper
```

详细运行和重跑策略见 [歌曲封面缓存 Runbook](../../docs/runbooks/song-cover-fetching.md)。

相关测试：

```bash
python3 scripts/tools/fetch_song_covers_test.py
```

## run_style_tagging_llm_batch.py

`run_style_tagging_llm_batch.py` 用于离线批量给歌曲补风格标签。它不在 API 请求链路里调用 LLM，而是先批量生成 JSONL，再显式导入数据库，降低长任务失败对数据库的影响。

核心逻辑：

1. 从 `ktv_songs` 选择当前标签数量少于阈值的歌曲，同时带上 `artist_names / file_name / relative_path`。
2. 默认尝试启动本地 `music_metadata_sidecar.mjs`。
3. 先按歌名查询网易云/酷狗歌单证据，从歌单标题、描述和平台标签中聚合标签；证据分数足够时直接写 `playlist-style-v1` 结果。
4. 歌单证据不足时，再按 `netease / tencent / kugou / kuwo` 查询最匹配的歌曲元数据；元数据能直接给出足够标签时写 `provider-style-v1` 结果。
5. 歌单证据和歌曲元数据都不足时，按 batch 组装给 LLM 的 prompt，并把短 ID、本地路径线索、sidecar 命中的专辑/歌手信息、歌单证据、以及从标题路径里提取的弱提示一起送给模型。
6. prompt 内使用短 ID，避免把真实 song id 暴露给模型或让模型回写错误长 ID。
7. 校验 LLM 返回 JSON，只保留预定义 taxonomy 里的标签。
8. 把结果追加到 JSONL，并刷新 state 文件。
9. `import` 阶段验证 JSONL 后，把标签写入 `ktv_songs.style_tags`。

子命令：

- `status`：查看候选数量和任务状态。
- `run`：调用 LLM 生成标签 JSONL。
- `import`：导入 JSONL 到数据库；默认 dry-run，必须显式 `--apply` 才写库。
- `run-and-import`：先 run 再 import。

常用命令：

```bash
python3 scripts/tools/run_style_tagging_llm_batch.py status --env-file deploy/source/.env
python3 scripts/tools/run_style_tagging_llm_batch.py run --env-file deploy/source/.env --max-existing-tags 1 --batch-size 30
python3 scripts/tools/run_style_tagging_llm_batch.py run --env-file deploy/source/.env --metadata-sidecar-providers netease,tencent,kugou,kuwo --metadata-search-limit 5
python3 scripts/tools/run_style_tagging_llm_batch.py run --env-file deploy/source/.env --playlist-evidence-providers netease,kugou --playlist-evidence-limit 10 --min-playlist-tag-score 2
python3 scripts/tools/run_style_tagging_llm_batch.py import --env-file deploy/source/.env --dry-run
python3 scripts/tools/run_style_tagging_llm_batch.py import --env-file deploy/source/.env --apply
```

默认策略：

- `--concurrency 10`：并行处理 10 个 batch。
- `--playlist-evidence-first`：默认开启，先用歌单证据打标签。
- `--playlist-evidence-providers netease,kugou`：当前歌单证据源只启用网易云和酷狗。
- `--min-playlist-tag-score 2`：普通标签至少 2 分；`热门 / 网络歌曲 / 伤感 / 甜蜜 / 浪漫` 等弱标签需要更高证据分。
- `--provider-first`：默认开启，歌单证据不足时用平台歌曲元数据补一次。
- LLM 兜底：歌单证据和平台元数据都不足时才调用。

相关测试：

```bash
python3 scripts/tools/run_style_tagging_llm_batch_test.py
```

## ui-visual-check.mjs

`ui-visual-check.mjs` 用 Chrome headless 截图检查控制端和 Admin 的基本视觉状态。

核心逻辑：

1. 读取 Admin URL、API URL、控制端 URL 和 Chrome 路径。
2. 如果没有传 `MOBILE_VISUAL_URL`，会调用 API 刷新 pairing token，拿到带 token 的控制端 URL。
3. 用 Chrome 分别截手机控制端和 Admin 的几个视口。
4. 检查截图文件存在且非空。

常用命令：

```bash
pnpm ui:visual-check
MOBILE_VISUAL_URL="https://ktv-controller.shaolongfei.com/controller?room=living-room&token=..." pnpm ui:visual-check
```

输出目录：

```text
logs/visual/
```

相关测试：

```bash
node --test scripts/tools/ui-visual-check.test.mjs
```

## tv-visual-check.mjs

`tv-visual-check.mjs` 用 Chrome headless 截图检查 Web TV 调试端。

核心逻辑：

1. 读取 `TV_VISUAL_URL` 和 `CHROME_BIN`。
2. 用固定 TV 视口截图。
3. 检查截图文件存在且非空。

常用命令：

```bash
pnpm tv:visual-check
TV_VISUAL_URL="https://ktv-tv.shaolongfei.com/?apiBaseUrl=https://ktv-api.shaolongfei.com&roomSlug=living-room&deviceName=Web%20TV" pnpm tv:visual-check
```

输出目录：

```text
logs/visual/
```

## real-mv-playback-risk-spike.mjs

`real-mv-playback-risk-spike.mjs` 用于真实 MV 播放风险调研，尤其是 MKV/MPG 兼容性和浏览器音轨切换能力。

核心逻辑：

1. 检查 Chrome 的 `canPlayType` 和 `audioTracks` 支持。
2. 可生成受控 fixture 做最小能力验证。
3. 如果提供本地 MKV/MPG 样本，使用 `ffprobe` 做媒体信息摘要。
4. 可选用数据库 URL 交叉检查 NAS 索引里的真实文件信息。
5. 输出 Markdown 风险报告。

常用命令：

```bash
pnpm real-mv:risk-spike -- --controlled-only --output runtime/reports/real-mv-risk.md
MEDIA_ROOT=/path/to/media pnpm real-mv:risk-spike -- --output runtime/reports/real-mv-risk.md
pnpm real-mv:risk-spike -- --sample-mkv sample.mkv --sample-mpg sample.mpg --output runtime/reports/real-mv-risk.md
```

相关测试：

```bash
node --test scripts/tools/real-mv-playback-risk-spike.test.mjs
```

## source-deployment-docs.test.mjs

这个文件是源码部署相关文档和脚本的契约测试，不是工具入口。它防止部署文档、源码部署 wrapper、Vite preview 端口和旧 Docker 容器停止策略出现回退。

覆盖点：

- `deploy/source/ktv.sh help` 需要包含一键 deploy 和 smoke。
- `docs/deployment.md` 和 `docs/runbooks/deploy-lxc-dev.md` 需要明确源码部署是服务器默认路径。
- 源码部署 preview 命令需要把端口正确传给 Vite。
- 源码部署停止旧 Docker app 容器时不能停止 PostgreSQL。
- Admin、Controller、TV Web 的 Vite 配置需要允许部署域名。

运行：

```bash
node --test scripts/tools/source-deployment-docs.test.mjs
```

## 常用验证命令

改动这些脚本后，按影响范围运行：

```bash
node --test scripts/tools/*.test.mjs
python3 scripts/tools/fetch_song_covers_test.py
python3 scripts/tools/run_style_tagging_llm_batch_test.py
pnpm repo:hygiene
```

涉及部署链路时，再跑：

```bash
bash deploy/source/ktv.sh doctor
bash deploy/source/ktv.sh smoke
```
