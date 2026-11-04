# ige8（爱歌吧 / ig8）在线补歌源设计方案

- 日期：2026-11-04
- 状态：P1/P2 已落地（搜索合并 + 缓存导入 + 媒体流），P3/P4 待做
- 目标读者：API / Worker 开发者、部署维护者
- 关联：`docs/KTV-ARCHITECTURE.md`、`docs/database-schema.md`、`docs/KTV-FULL-INDEX.md`、`docs/runbooks/online-song-source.md`

## 1. 结论先行

装在 `C:\Program Files (x86)\igeba\` 的 ig8（爱歌吧）虽然看起来是个 Delphi + CEF 的 Windows 客户端，但它的曲库和播放能力**全部走明文 HTTP 接口**，没有签名、没有加密参数、没有 TLS：

| 能力 | 接口 | 是否需要登录 |
| --- | --- | --- |
| 曲库搜索（歌名/歌手/拼音首字母） | `POST http://app.ige8.net/cloud.php` `CMD=GET_SONGS` | 否（匿名 uid=0 可用） |
| 取播放地址（一次性 rid 直链） | `POST http://app.ige8.net/telnet.php` `CMD=GET_SONGADDR` | 否 |
| 下载媒体文件（支持 Range） | `GET {FileUrl}` → `g8file.php?path=&rid=&uid=` | 否（凭 rid） |
| 歌曲封面 | `GET http://pub.amanktv.cn/uploads/images/{SongNumber}.jpg` | 否 |

实测样本是 **H.264 + 2×Vorbis 的 MKV**，天然是「原唱 / 伴唱」双音轨，正好对上本项目的双音轨 KTV 模型。也就是说，接入方式不需要装客户端、不需要 Hook、不需要模拟点击，直接按协议调用即可；`ig8.exe` / `ig8Cacher.exe` 只是这套接口的消费者。

因此本方案采用：**在线只做「搜索 + 取址 + 缓存到 NAS」，播放永远走本地文件**，与项目既有约束（本地为主、在线补歌、先缓存再播放、TV 不直连公网）完全一致。

## 2. 逆向过程与证据

### 2.1 客户端结构

| 文件 | 结论 |
| --- | --- |
| `ig8.exe` | Delphi/VCL 主程序 + 内嵌 CEF；HTTP 逻辑在 Delphi 侧（Indy），UI 在 CEF |
| `ig8Cacher.exe` | 下载器：`DownTasks` 表驱动，负责把云端 MV 拉到本地磁盘 |
| `ig8.dat` | SQLite 数据库（`PlayOrders` / `MySongs` / `DownTasks` / `PlayHistories`），不是曲库本体 |
| `ui/*.g8` | 前端资源包：**9 字节头 + 全文 XOR 0x02**，解出来是 Vue2 SPA（`main.*.js` 等） |
| `ProtocolCfg.dll` | 门户/协议地址：`http://app.ige8.net/telnet.php`、`http://monitor.91mv.net/getportals.php` |
| `ad.g8d` | 广告素材，与业务无关 |

`ui/*.g8` 解密后（`scripts/igeba_probe.py` 之外的临时分析）可以直接读到接口映射表：

```js
var d = {
  ajax_cloud: "http://app.ige8.net/cloud.php",
  ajax_pay:   "http://app.ige8.net/pay.php",
  ajax_user:  "http://app.ige8.net/usr.php",
  ajax_ucenter: "http://gc.amanktv.cn/usr.php",
  ajax_work:  "http://app.ige8.net/work.php",
  ajax_mgr:   "http://app.ige8.net/mgr.php"
};
```

请求格式极简：`application/x-www-form-urlencoded`，字段 `CMD`、`PARAMS`（JSON 字符串），telnet 侧多一个 `VER`。

### 2.2 关键命令

从 SPA 与 `ig8.exe` 中提取到的命令码（节选，与歌曲相关的）：

| CMD | 端 | 作用 |
| --- | --- | --- |
| `GET_SONGS` | cloud.php | 搜索 / 榜单 / 歌单 / 收藏，统一走这里 |
| `GET_HEADS` | cloud.php | 首页运营位（专题、榜单入口） |
| `GET_PLYL` | cloud.php | 我的歌单列表 |
| `GET_APPCONFIG` | telnet.php | 返回 `AppUrls`、`CacheServers`（4 台文件服务器）、升级信息 |
| `GET_MYINFO` | telnet.php | 当前用户权益（匿名返回「免费用户」） |
| `GET_SONGADDR` | telnet.php | **单曲取址**，返回带 rid 的直链 |
| `DO_LOGIN` | telnet.php | 账号登录（`UserName/Password/ExeInfos/EnvInfos/PlayerInfos/ReferId`） |
| `GET_IDLES` | telnet.php | 空闲推荐 |

### 2.3 实测请求与响应

搜索（`Filter.Name` 同时匹配歌名、歌手、描述；`PYCode` 匹配首字母）：

```http
POST /cloud.php HTTP/1.1
Host: app.ige8.net
Content-Type: application/x-www-form-urlencoded

CMD=GET_SONGS&PARAMS={"UserId":0,"Filter":{"Name":"孤勇者"},"Page":{"PageSize":3,"PageNo":1}}
```

```json
{"List":[{"SongNumber":"20039643","SongName":"孤勇者","Version":"","LanguageName":"国语",
"SingerName":"陈奕迅","Album":"","Description":"动画《英雄联盟：双城之战》中文主题曲",
"Duration":"269","MtvStyle":"Movie","Tag":"影视","MusicStyle":"原声","Feeling":"励志",
"Years":"","VoiceChannel":"0","Key":"","FileName":"220039643.mkv","FileUrl":"","AdUrl":""}],
"Page":{"PageCount":26,"RecordCount":77},"Keywords":["孤勇者","孤勇者"]}
```

实测旁证：

- `Filter.PYCode="gxz"` → 恭喜自己 / 共享自然 / 故乡在梦中，拼音首字母检索可用；
- `Filter.Name="陈奕迅"` → 返回 `RecordCount=1000`（接口上限），歌名与歌手混搜；
- `Filter={}`（全库枚举）→ `{"Result":-1,"Description":"请使用鸿蒙客户端."}`，**不支持整库导出**，只能按关键词检索；
- 空串关键字 → 返回空数组。

取址：

```http
POST /telnet.php HTTP/1.1
CMD=GET_SONGADDR&VER=1&PARAMS={"SongNumber":"20039643","UserId":0}
```

```json
{"Rights":{"Code":0,"Reason":"未登录","RatedSpeed":0},
 "SongNumber":"20039643","FileName":"220039643.mkv",
 "FileUrl":"http://218.95.37.159:1882/g8file.php?path=/202202/220039643.mkv&rid=E9263E81138DF157A628&uid=0",
 "VoiceChannel":"0","Key":"",
 "Ad":{"Url":"http://www.ige8.net/ad/ad.html?size=720*480","Second":"30", ...}}
```

文件服务器（4 台，来自 `GET_APPCONFIG.CacheServers`）：

```text
222.211.66.16:1882   218.95.37.159:1882   61.136.101.176:1882   221.181.185.191:1882
```

下载验证：

```text
GET /g8file.php?path=/000000/220036049.mkv&rid=A9C79A6B75CB2B63F7F3&uid=0
Range: bytes=0-1023
→ 206 Partial Content
   content-range: bytes 0-1022/79333390
   content-disposition: attachment; filename=220036049.mkv
   content-type: application/octet-stream
```

媒体结构（`ffprobe` 级验证，脚本内用 EBML 关键串确认）：

```text
10009865 海阔天空-Beyond : V_MPEG4/ISO/AVC ×1, A_VORBIS ×2, Lavf58.20.100
20039643 孤勇者-陈奕迅   : V_MPEG4/ISO/AVC ×1, A_VORBIS ×2, Lavf58.20.100
220051769 放下-爱刮胡子的猫: V_MPEG4/ISO/AVC ×1, A_VORBIS ×1（用户上传，单音轨）
```

### 2.4 三个必须写进实现的坑

1. **双门户 token 不一致**：`GET_SONGADDR` 由两台门户节点轮流签发 rid，其中一台签的 rid 在文件服务器上固定返回 `403 Forbidden:Url Expired`，实测命中率约 30%。**必须「取址 → 1KB Range 探测 → 失败重新取址」**，不能拿到 URL 就直接整文件下载。
2. **同曲偶发永久失败**：个别歌曲（实测 `20051769`）连续 30 次取址全部 Expired，而 `20036049` 30 秒一测连续成功。这类歌曲必须能标记为 `unavailable` 并降级，不能无限重试。
3. **限流分两层**：短时间高频取址会让全站整体 Expired（约 1–3 分钟恢复）；此外**同一首歌曲被反复取址后会进入单独的长时间 Expired**（实测 `20039643` 在压测数十次后连续 30 次取址全部失败，而同批其他歌曲正常）。因此实现上必须「一次缓存、永久复用」：`online_song_assets.status='ready'` 之后点歌直接读本地文件，**不再调用任何 ige8 接口**；只有缓存缺失或被淘汰时才重新取址。所有调用保持 ≥1s 间隔、并发 ≤2、指数退避。
4. **Range 语义非标准**：文件节点只接受**闭合区间** `bytes=a-b`，无 Range 或 `bytes=a-` 直接 `403 Invalid Range`；而且实际返回长度是 `b-a`（比请求少 1 字节），`content-range` 里的总长度也可能比真实文件大 1。下载必须**按块循环、以短读 EOF 收敛**，不要用 `content-length` 做严格相等校验，否则永远差 1 字节失败。

补充事实：

- `uid=0`（匿名/免费用户）能拿到可用直链；把 `UserId` 填成任意正整数反而**全部** Expired（未登录用户走到「会员通道」签名不匹配）。**所以默认一律 `UserId: 0`**，除非后续接入真实账号。
- `GET_SONGADDR` 里 `VoiceChannel` 与搜索结果的 `VoiceChannel` 同源（0/1），双音轨文件本身同时含原唱与伴唱，切换靠播放器选轨，不靠服务端换文件。
- `Rights.Code=0` 表示未登录；`Code=1` 才是会员态。无 `FileUrl` 即资源下架。

## 3. 总体架构

```text
┌────────────┐   搜索/点歌    ┌──────────────────────────────┐
│ Controller │ ─────────────> │ API                          │
│  (手机)    │                │  ├─ SongSearchService        │
└────────────┘                │  │   ├─ NasSearch (现有)     │
                              │  │   └─ IgebaCatalogProvider │──HTTP──> app.ige8.net
┌────────────┐                │  ├─ QueueService             │
│ Admin      │ ─────────────> │  └─ OnlineAssetPipeline      │
└────────────┘                │       resolve → download     │
                              │       → probe → ready        │
                              └──────────┬───────────────────┘
                                         │ 写文件
                              ┌──────────▼───────────────────┐
                              │ NAS: <MEDIA_ROOT>/online-cache│
                              │      /igeba/{SongNumber}.mkv  │
                              └──────────┬───────────────────┘
                                         │ Range 流
┌────────────┐   播放 URL    ┌──────────▼───────────────────┐
│ Android TV │ <──────────── │ MediaGateway /media/online/:id│
└────────────┘               └──────────────────────────────┘
```

三条硬性设计原则：

1. **电视端永不接触 ige8**。TV 只拿 `PUBLIC_BASE_URL` 下的本地媒体 URL。
2. **搜索可以实时，播放必须缓存**。`online_song_assets.status` 未到 `ready` 前，队列条目停在 `preparing`。
3. **本地优先**。同一首歌 NAS 命中的结果排在在线结果前面；在线源挂了只影响「补歌」，不影响「能唱」。

## 4. 模块设计

### 4.1 `IgebaCatalogProvider`（新，`apps/api/src/modules/online/igeba/`）

职责单一：把 ige8 协议翻译成项目内的领域模型，不含任何业务判断。

```ts
export interface OnlineCatalogProvider {
  readonly id: "igeba";
  search(input: { keyword: string; page: number; pageSize: number }): Promise<OnlineSearchPage>;
  resolve(songNumber: string): Promise<OnlineResolveResult>;   // 内含重试与探测
  health(): Promise<{ ok: boolean; reason?: string }>;
}
```

- `search` → `POST cloud.php CMD=GET_SONGS`，把 `List[]` 映射为 `{ providerSongId, title, artistName, durationMs, language, tags[], coverUrl, voiceChannel }`。
- `resolve` → 循环 `GET_SONGADDR` + `Range: bytes=0-0` 探测，最多 30 次，指数退避 0.4→8s + jitter；成功后返回 `{ fileUrl, fileSize, fileName, attempts }`。
- 全部 HTTP 走统一的 `fetchWithTimeout`，超时 20s，失败重试 2 次（仅网络层，不含 403）。
- 熔断：连续 5 次 `Url Expired` → 内部冷却 60s；连续 3 轮冷却仍失败 → `health()` 返回 false，搜索侧自动隐藏在线结果（同时兼容现有 `ONLINE_PROVIDER_KILL_SWITCH_IDS`）。

### 4.2 `OnlineAssetPipeline`（新，`apps/api/src/modules/online/pipeline.ts`）

由队列事件触发，单曲状态机：

```text
discovered ──select──> resolving ──ok──> downloading ──ok──> verifying ──ok──> ready
                           │                  │                 │
                           └──fail────────────┴─────────────────┴──> failed(可重试)
                                                                     └──> unavailable(不再重试)
```

落地细节：

| 步骤 | 行为 |
| --- | --- |
| resolving | `provider.resolve()`；记录 `attempts`，>10 次记 warning |
| downloading | 4MB **闭合区间**分块下载到 `{SongNumber}.mkv.part`，`.part` 按块边界续传；块请求 Expired 时自动重新取址并继续；以短读 EOF 收敛（实测 43.8MB / 4s ≈ 11MB/s） |
| verifying | 长度落在 `[total-1, total]` + `ffprobe` 成功；音轨数 ≥1；≥2 条音轨则 `canSwitchVocalMode=true` |
| ready | `rename()` 原子落盘，更新 `online_song_assets.status='ready'`，广播房间快照 |
| failed | 保留 `.part` 供续传，写 `failure_reason`，30s/2min/10min 三次退避重试后转 `unavailable` |

并发与限速（全局单例 `IgebaRateLimiter`）：

- 全局同时 2 个 HTTP 请求，单曲只走一条下载流；
- 相邻请求最小间隔 1s，下载完成后 2s 内不再发起新 resolve；
- 触发冷却时，队列中的在线任务保留，但 `preparing` 阶段给出「在线源繁忙，稍后重试」。

缓存策略：

- 目录 `/${MEDIA_ROOT}/online-cache/igeba/{SongNumber}.mkv`，与 NAS 曲库目录物理隔离，便于单独配额与清理；
- 文件数上限 200 首 / 50GB，LRU 淘汰（按 `last_played_at`），淘汰时只删文件并把 asset 置 `unavailable`，不删曲目元数据；
- 30 天未播放自动过期清理，可配置；
- 同一 `SongNumber` 只允许一份文件，天然幂等。

### 4.3 搜索合并（改 `apps/api/src/routes/song-search.ts`）

```text
命中 NAS → 直接返回（不调在线，省一次请求）
命中不足 limit 且在线源可用 → 调 ige8 搜索，归一化去重后追加，标记 source=online
在线结果默认标记「需缓存」，点歌时若未 ready，先入队再准备
```

去重键：`normalize(title) + normalize(artist)`，与 NAS 结果重复的在线项直接丢弃。

### 4.4 媒体网关（改 `apps/api/src/modules/media/media-gateway.ts`）

当前 `sourceType === "online"` 直接返回 `501 ONLINE_PLAYBACK_NOT_IMPLEMENTED`。改为：

1. 用 `onlineAssetId` 查 `online_song_assets`；
2. `status !== 'ready'` → `409 ONLINE_ASSET_NOT_READY`（前端据此显示「准备中」）；
3. `cache_path` 交给 `MediaPathResolver`（复用现有路径校验，防止任意文件读取）；
4. 走现有 `sendFileWithRange` 逻辑，返回 206。

注意：**绝不 302 到 `g8file.php`**。一旦重定向到公网，TV 会直连外部、拖垮稳定性，也失去缓存意义。

## 5. 数据模型

`0017_nas_online_catalog_refactor.sql` 已经把表建好了，v1 可以直接用：

| 表 | 字段 | 用法 |
| --- | --- | --- |
| `online_songs` | `provider='igeba'`, `provider_song_id=SongNumber`, `title`, `normalized_title`, `primary_artist_name`, `metadata` | `metadata` 存 `{language, mtvStyle, musicStyle, feeling, years, voiceChannel, coverUrl, songNumber}` |
| `online_song_assets` | `provider_asset_id='{SongNumber}:{FileName}'`, `media_url`（原始直链，仅调试用）, `cache_path`, `status`, `duration_ms`, `metadata` | `metadata` 存 `{sizeBytes, sha256, resolvedAt, audioTracks, attempts}` |
| `queue_entries` | `source_type='online'`, `online_song_id`, `online_asset_id` | 已经预留 |

建议在 `0025_online_cache_ops.sql` 补三列（可选，v1 也可先塞 `metadata`）：

```sql
ALTER TABLE online_song_assets
  ADD COLUMN IF NOT EXISTS cache_bytes bigint,
  ADD COLUMN IF NOT EXISTS cache_sha256 text,
  ADD COLUMN IF NOT EXISTS last_played_at timestamptz,
  ADD COLUMN IF NOT EXISTS cache_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS online_song_assets_cache_lru_idx
  ON online_song_assets(status, last_played_at NULLS FIRST);
```

## 6. 对外接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/rooms/:roomSlug/songs/search?q=&limit=&source=all\|nas\|online` | 合并搜索；每项带 `source`、`cacheState` |
| POST | `/rooms/:roomSlug/queue/online-songs` | body `{provider:"igeba", songNumber, expectedTitle}`；返回 `{queueEntryId, cacheState}` |
| GET | `/rooms/:roomSlug/queue` | 条目新增 `cacheState: ready\|preparing\|failed`，手机端据此提示 |
| GET | `/media/online/:onlineAssetId` | Range 流；`409` = 未就绪，`404` = 无缓存 |
| GET | `/admin/online/sources` | provider 健康、冷却状态、近 1h 成功/失败计数 |
| POST | `/admin/online/assets/:id/evict` | 手动清缓存 |

点歌语义（关键）：`POST queue` 立即返回成功（进入 `preparing`），服务端后台准备；手机端轮询快照，TV 端只在 `ready` 时才切歌。这样点歌动作不会被 30 秒的下载阻塞。

## 7. 配置项

```bash
# .env
ONLINE_PROVIDER_IDS=igeba
ONLINE_PROVIDER_KILL_SWITCH_IDS=
IGEBA_BASE_URL=http://app.ige8.net
IGEBA_UID=0                       # 固定匿名，勿填正数
IGEBA_MIN_INTERVAL_MS=1000
IGEBA_MAX_CONCURRENCY=2
IGEBA_RESOLVE_MAX_ATTEMPTS=30
IGEBA_CACHE_DIR=                  # 默认 ${MEDIA_ROOT}/online-cache/igeba
IGEBA_CACHE_MAX_BYTES=53687091200 # 50GB
IGEBA_CACHE_MAX_ITEMS=200
IGEBA_CACHE_TTL_DAYS=30
IGEBA_ENABLED=true
```

`config.ts` 里按现有 `readString/readList/readPositiveInteger` 风格补齐，`normalizeApiConfig` 同步默认值。

## 8. 失败模式与降级

| 现象 | 判定 | 处理 |
| --- | --- | --- |
| `403 Forbidden:Url Expired` | 双门户 token 不匹配 | 重新取址，最多 30 次；无感重试 |
| 连续 Expired > 5 | 触发限流 | 冷却 60s，全局串行，页面提示「在线源繁忙」 |
| 同一曲 > 20 次 Expired | 该曲被单独限流 | 停止重试，标 `failed`，24h 后再试；期间只提示不可用 |
| `FileUrl` 为空 | 资源下架/需付费 | 标 `unavailable`，搜索侧灰显，不重试 |
| 下载中断 | 网络 | `.part` 续传，3 次退避后失败 |
| 长度不符 | 文件截断 | 删除 `.part` 重下，最多 2 次 |
| `ffprobe` 失败 | 非媒体/损坏 | 标 `failed`，不进入队列 |
| 在线源整体不可用 | 接口变更/封禁 | `health()===false`，搜索只返回 NAS，点歌在线项返回 `503 ONLINE_SOURCE_UNAVAILABLE` |
| 缓存盘满 | 配额 | LRU 淘汰后再下，仍失败则拒绝新任务 |

## 9. 合规与运行边界

- 只服务家庭内网单房间，媒体缓存不对外分发、不做公网 URL 签名；
- 不绕过会员/付费内容：`Rights` 不满足或无 `FileUrl` 一律视为不可用；
- 不替换、不注入客户端广告（`Ad` 字段直接忽略）；
- 不修改、不重打包 ig8 客户端，不爬取整库，只做用户主动触发的按需检索与缓存；
- 保留 `ONLINE_PROVIDER_KILL_SWITCH_IDS` 一键熔断；
- 接口为第三方非公开协议，随时可能变更 —— 所有协议细节收敛在 `igeba/` 目录内，便于整体替换。

## 10. 实施计划

| 阶段 | 内容 | 预估 |
| --- | --- | --- |
| P0（本次已交付） | `scripts/igeba_probe.py` 探针：搜索/取址/下载/自检 | 0.5d |
| P1 | `IgebaCatalogProvider` + 搜索合并 + Admin 预览（只读，不播） | 1–2d |
| P2 | `OnlineAssetPipeline` + 媒体网关 + 队列状态联动 | 3–5d |
| P3 | Admin 运维面板：健康度、冷却、缓存 LRU、手动淘汰 | 1–2d |
| P4（可选） | 榜单/歌单发现（`GET_HEADS` + `Filter.Package`） | 1d |

## 11. 验收标准

1. `python3 scripts/igeba_probe.py selfcheck 孤勇者 --count 5` 取址成功率 100%（含重试）。
2. 同一首歌连续点播 20 次，只有首次产生外网请求，其余全部命中缓存（`GET /admin/online/sources` 可见请求计数不增长）。
3. 搜索 P95 < 800ms；在线不可用时搜索自动降级为纯 NAS，P95 < 200ms。
4. 缓存命中后 TV 起播 < 1s；未命中时手机端显示「准备中」，准备完成自动切歌。
5. 单曲缓存文件 `ffprobe` 通过，双音轨资源 `canSwitchVocalMode=true`。
6. 断网 5 分钟后恢复，队列中的在线任务自动续跑，`failed` 不重复堆积。
7. 缓存目录超过 50GB 时按 LRU 自动清理，且不误删 NAS 曲库文件。

## 12. 已知限制

- 曲库只能按关键词检索（整库枚举被服务端拒绝），无法离线镜像全库；本地搜索索引仍需以 NAS 为主。
- 单曲 `RecordCount` 上限 1000，深翻页需换关键词细分。
- 个别歌曲在所有门户节点上都取不到地址（实测 1/20 量级），只能标记不可用。
- 接口无 HTTPS，且完全依赖第三方可用性；不承诺 100% 在线率，产品定位始终是「补歌」。

## 13. 复现命令

```bash
# 关键词搜索（歌名/歌手）
python3 scripts/igeba_probe.py search 孤勇者 --size 5

# 拼音首字母
python3 scripts/igeba_probe.py search gxz --pinyin

# 取址（自动重试到可用）
python3 scripts/igeba_probe.py resolve 20039643

# 取址 + 下载到本地（断点续传）
python3 scripts/igeba_probe.py fetch 20039643 --out runtime/igeba

# 批量取址成功率自检
python3 scripts/igeba_probe.py selfcheck 海阔天空 --count 5
```

## 14. 落地记录（P1 + P2）

已按本方案落地，运行说明见 [在线补歌源 runbook](../runbooks/online-song-source.md)。

| 文件 | 作用 |
| --- | --- |
| `apps/api/src/modules/online/igeba/igeba-client.ts` | 协议客户端：搜索、取址重试、Range 探测、分块下载、串行限速、健康状态 |
| `apps/api/src/modules/online/igeba/igeba-provider.ts` | provider 抽象：候选映射、resolve、download、health |
| `apps/api/src/modules/online/online-catalog-repository.ts` | `online_songs` / `online_song_assets` 读写（PG + 内存实现） |
| `apps/api/src/modules/online/online-import-service.ts` | 导入流水线：单并发、去重、下载、ffprobe、ready/failed/unavailable |
| `apps/api/src/routes/online-catalog.ts` | 房间预载、进度查询、后台概览/列表/批量导入 |
| `apps/api/src/routes/song-search.ts` | 搜索结果合并在线候选（`online.candidates[]`） |
| `apps/api/src/modules/media/media-gateway.ts` | `sourceType=online` 改为读本地缓存文件，未就绪返回 409 |
| `apps/api/src/config.ts` | `IGEBA_*` 配置与默认值 |
| `apps/api/src/scripts/igeba-library-load.ts` | `igeba:load` 批量预载 CLI |
| `apps/api/src/db/migrations/0025_online_catalog_cache.sql` | 缓存字节数、音轨数、失败原因等列与索引 |
| `apps/api/src/test/online-*.test.ts`、`song-search-online-merge.test.ts` | 客户端重试/下载、导入状态机、路由、搜索合并 |

与第 6 节设计的差异：**v1 不做 `queue_entries` 关联**。`0023` 迁移已经把 `queue_entries` 收紧为只引用 `ktv_songs`，为了不改动既有播放状态机，在线歌曲先以「缓存 + `/media/online/:id` 可播」的形态提供；等确认产品需要把在线歌曲排进队列时，再单独设计队列来源扩展。
