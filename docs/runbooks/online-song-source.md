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
| 后台概览 | `GET /admin/online/sources` |
| 后台缓存列表 | `GET /admin/online/assets?limit=50` |
| 后台批量预载 | `POST /admin/online/import` `{ "query": "周杰伦", "limit": 10 }` |

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

## 批量导入（命令行）

```bash
pnpm -F @home-ktv/api igeba:load -- --query "周杰伦" --limit 10
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
