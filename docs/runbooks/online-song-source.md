# 在线补歌源（ige8 / 爱歌吧）

HomeKTV 的在线补歌能力：本地 NAS 曲库为主，ige8 曲库作为按需补充。在线歌曲**先缓存到本地再播放**，电视端永远不直连第三方。

## 开启

```bash
# deploy/source/.env 或 deploy/docker/.env
ONLINE_PROVIDER_IDS=igeba
IGEBA_ENABLED=true
IGEBA_UID=0
# 可选
IGEBA_CACHE_DIR=/mnt/nas/home-ktv/online-cache/igeba
IGEBA_CONCURRENCY=1
IGEBA_CACHE_MAX_BYTES=53687091200   # 50GB
IGEBA_CACHE_MAX_ITEMS=200
IGEBA_CACHE_TTL_DAYS=30
```

默认缓存目录是 `${MEDIA_ROOT}/online-cache/igeba`。`MEDIA_ROOT` 为空时 provider 自动关闭。

一键熔断：把 `igeba` 加进 `ONLINE_PROVIDER_KILL_SWITCH_IDS`，搜索立刻退回纯 NAS 结果。

## 使用

| 场景 | 接口 |
| --- | --- |
| 搜索（自动合并在线候选） | `GET /rooms/:roomSlug/songs/search?q=孤勇者`，返回 `online.candidates[]` |
| 预载单曲 | `POST /rooms/:roomSlug/online/import` `{ "songNumber": "20039643", "title": "孤勇者" }` |
| 点歌（缓存好就排队） | `POST /rooms/:roomSlug/online/queue` `{ "songNumber": "20039643", "requestedBy": "phone-1" }` |
| 查询准备状态 | `GET /rooms/:roomSlug/online/assets/:assetId` |
| 播放（缓存就绪后） | `GET /media/online/:assetId`（支持 Range；未就绪返回 409） |
| 后台概览 | `GET /admin/online/sources`（含配额与命中/失败指标） |
| 后台缓存列表 | `GET /admin/online/assets?limit=50` |
| 后台批量预载（关键字） | `POST /admin/online/import` `{ "query": "周杰伦", "limit": 10 }` |
| 后台批量预载（榜单/歌单） | `POST /admin/online/import` `{ "packageType": 4, "packageId": "13166", "limit": 20 }` |
| 后台运营位 | `GET /admin/online/discovery` |
| 手动淘汰 | `POST /admin/online/assets/:assetId/evict` |
| 立即清理 | `POST /admin/online/prune` |

点歌/预载是异步的：`POST` 先返回 `202 + assetId`，下载完成后 `GET .../online/assets/:assetId` 变成 `ready`，此时 `playbackUrl` 才有值。

`online/queue` 的语义：

- 已缓存 → 同步入队，`200 + queueEntryId`；
- 未缓存 → `202 + assetId`，后台下载完成后**自动入队**，手机端轮询房间快照即可看到队列变化；
- 同一首歌重复请求/重试是幂等的，不会重复排队。

## 缓存与曲库的关系

缓存完成后，歌曲会被提升为本地曲库条目（`ktv_songs.id = ktv-online-{provider}-{SongNumber}`）：

- 之后 NAS 搜索能直接搜到它，走标准点歌命令也能排队；
- 播放地址统一为 `/media/nas/ktv-online-...`，媒体网关识别 `ktv-online-` 前缀后直接读在线缓存文件，不依赖 ffprobe 探测结果；
- `source_root = online:igeba`，NAS 索引扫描不会把它标记为 missing。

## 缓存治理

- 每次下载前按 LRU（`last_played_at` 为空优先、`updated_at` 最早优先）淘汰，直到满足 `IGEBA_CACHE_MAX_BYTES` 与 `IGEBA_CACHE_MAX_ITEMS`；
- 服务启动时做一次对账，之后每小时执行一次 TTL 清理（`IGEBA_CACHE_TTL_DAYS`），并把卡住超过 15 分钟的 `caching` 任务重置为 `failed`；
- 淘汰会删除缓存文件、把 asset 置为 `unavailable`，并删除对应的 `ktv-online-*` 曲库条目；
- 多个 API 副本同时运行时，通过数据库条件更新抢占任务（10 分钟租约），不会重复下载同一首。

## 管理后台

Admin 顶部「在线曲库」页签：

- 状态卡：provider 是否启用、已缓存数量/大小、运行与排队、淘汰次数、失败数；
- 按关键字批量预载（数量 1–50）；
- 运营位/榜单模块一键预载（解析 `app://Object=Playlist&ObjectId=...`，Playlist=3、Rank=4、Album=2）；
- 缓存列表：状态、大小、`ktv-online-*` 曲库 ID、单条淘汰。

## 批量导入（命令行）

```bash
pnpm -F @home-ktv/api igeba:load -- --query "周杰伦" --limit 10
pnpm -F @home-ktv/api igeba:load -- --package-type 4 --package-id 13166 --limit 20
pnpm -F @home-ktv/api igeba:load -- --query "海阔天空" --limit 5 --dry-run
```

命令会按关键字搜索、逐首取址下载、ffprobe 校验，最后打印 `ready/failed/unavailable` 统计。串行执行，默认每请求间隔 1s。

## 排障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 搜索没有在线结果 | provider 未启用 / kill switch / `MEDIA_ROOT` 为空 | 检查 `/admin/online/sources` 的 `enabled` |
| `status=failed`，`errorReason` 含 `Url Expired` | ige8 双门户 token 不匹配或限流 | 等 1–3 分钟重试；不要提高 `IGEBA_CONCURRENCY` |
| `status=unavailable`，含 `no playable url` | 该曲下架或需付费会员 | 不会自动重试，换其他版本 |
| `/media/online/:id` 返回 409 | 缓存未完成 | 轮询 asset 状态；`ready` 后再取 |
| `audioTrackCount=null` | 服务器没装 ffprobe | 不影响播放（网关走在线缓存分支）；装上 ffprobe 后重新预载可补全音轨信息 |
| 磁盘增长 | 缓存文件累积 | 手动清理 `IGEBA_CACHE_DIR`，并同步删除数据库里对应 asset |

## 边界

- 只做家庭内网单房间使用，缓存文件不对外分发。
- 不支持整库镜像：ige8 接口拒绝空条件枚举，只能按关键词检索。
- 不绕过付费/会员内容，`FileUrl` 为空直接标记 `unavailable`。
- 第三方接口可能随时变更，所有协议细节收敛在 `apps/api/src/modules/online/igeba/`。
