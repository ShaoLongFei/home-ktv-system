# scripts

项目脚本统一放在本目录。运行日志、截图、批处理结果和其它临时产物写到 `logs/` 或 `runtime/`。

## 常用入口

| 脚本 | 用途 | 常用入口 |
| --- | --- | --- |
| `dev-local.mjs` | 本地启动、停止、重启、查看 API/Admin/Controller/Web TV，并管理日志和 pid。 | `pnpm dev:local start` |
| `deploy-doctor.mjs` | 部署环境自检：env、CORS、媒体路径、服务状态、公开 URL 和 KTV 索引诊断。 | `pnpm deploy:doctor` |
| `web-deploy-smoke.mjs` | 部署后 smoke：Web 入口、CORS、TV bootstrap/heartbeat、控制端 session 和推荐歌曲。 | `pnpm deploy:smoke` |
| `repo_hygiene_check.py` | 提交前仓库卫生检查。 | `pnpm repo:hygiene` |
| `visual_check.py` | Controller/Admin/Web TV 的 Chrome 截图检查。 | `pnpm ui:visual-check` / `pnpm tv:visual-check` |
| `fetch_song_covers.py` | 查询、下载并缓存歌曲封面，也提供覆盖率和状态查询。 | `pnpm covers:songs` / `pnpm covers:coverage` / `pnpm covers:status` |
| `generate_cover_thumbnails.py` | 生成本地封面缩略图。 | `pnpm covers:thumbnails` |
| `igeba_probe.py` | ige8（爱歌吧）在线曲库探针：搜索、取址、下载、批量自检；在线补歌源的设计验证工具。 | `python3 scripts/igeba_probe.py search 孤勇者` / `... selfcheck 海阔天空 --count 5` |
| `apps/api/src/scripts/igeba-library-load.ts` | 按关键字批量预载 ige8 曲目到本地缓存（走 API 同一套流水线）。 | `pnpm -F @home-ktv/api igeba:load -- --query 周杰伦 --limit 10` |
| `run_style_tagging_llm_batch.py` | 离线批量补风格标签并导入数据库。 | `pnpm ktv:tags:llm-batch:py -- ...` |
| `fetch_hot_song_candidates.py` | 聚合热歌候选。 | `python3 scripts/fetch_hot_song_candidates.py collect` |
| `fetch_chart_scores.py` | 抓取榜单积分。 | `python3 scripts/fetch_chart_scores.py collect` |
| `fetch_playlist_scores.py` | 抓取歌单积分。 | `python3 scripts/fetch_playlist_scores.py collect` |
| `merge_music_scores.py` | 合并热歌、榜单、歌单积分。 | `python3 scripts/merge_music_scores.py merge ...` |
| `delete_uncovered_songs.py` | 根据 CSV 规划或执行删歌。 | `python3 scripts/delete_uncovered_songs.py plan ...` |
| `android_app_icon_pipeline.py` | 生成 Android TV 图标资源。 | `python3 scripts/android_app_icon_pipeline.py --candidate 1` |
| `prepare_readme_assets.py` | 生成 README 横幅并压缩截图。 | `python3 scripts/prepare_readme_assets.py` |

## 测试脚本

| 脚本 | 覆盖内容 |
| --- | --- |
| `deploy-doctor.test.mjs` | 部署 doctor 的 env、CORS、媒体路径、网络重试、服务状态和 KTV 索引诊断。 |
| `web-deploy-smoke.test.mjs` | Web smoke 的 CORS、页面可达性、TV bootstrap/heartbeat、控制端 session 和 discovery 检查。 |
| `repo_hygiene_check_test.py` | Git 状态解析、高风险未跟踪路径识别和 pnpm 参数转发。 |
| `visual_check_test.py` | 视觉检查配置、URL 解析和 TV 截图目标。 |
| `fetch_song_covers_test.py` | 封面查询、下载、缓存、匹配评分、provider fallback 和覆盖率。 |
| `generate_cover_thumbnails_test.py` | 缩略图 CLI、跳过/覆盖规划和固定尺寸输出。 |
| `fetch_hot_song_candidates_test.py` | 热歌来源筛选、并发调度和聚合报告。 |
| `fetch_chart_scores_test.py` | 榜单解析、歌曲归一化、并发调度和积分聚合。 |
| `fetch_playlist_scores_test.py` | 歌单引用解析、歌曲归一化、并发调度和积分聚合。 |
| `merge_music_scores_test.py` | 积分 CSV 路径解析、归一化去重和分数合并。 |
| `delete_uncovered_songs_test.py` | 待删 CSV 读取、路径转换、删除 SQL 模板和 dry-run 报告。 |
| `run_style_tagging_llm_batch_test.py` | LLM 标签批处理的 prompt、返回校验、标签过滤和导入 SQL。 |
| `android_app_icon_pipeline_test.py` | Android TV 应用图标生成的候选裁切、输出文件和尺寸契约。 |

## 快速验证

```bash
node --test scripts/deploy-doctor.test.mjs
node --test scripts/web-deploy-smoke.test.mjs
python3 scripts/repo_hygiene_check_test.py
python3 scripts/visual_check_test.py
```
