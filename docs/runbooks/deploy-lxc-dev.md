# lxc-dev 部署 Runbook

## 服务器

```text
lxc-dev      192.168.5.102  HomeKTV source deployment
lxc-network  192.168.5.103  Caddy + Homepage
```

代码目录：

```bash
/opt/home-ktv-system
```

## NAS 挂载

真实歌曲文件在 NAS，`lxc-dev` 通过 PVE bind mount 只读访问：

```bash
pct set 102 -mp0 /hdd-pool/nas,mp=/mnt/nas,ro=1
```

在 `lxc-dev` 内验证：

```bash
ls /mnt/nas/KTV歌曲
test -r /mnt/nas/KTV歌曲
```

## 环境变量

`/opt/home-ktv-system/deploy/source/.env` 至少应包含：

```bash
DATABASE_URL=postgres://ktv:ktv@127.0.0.1:5432/home_ktv
PUBLIC_BASE_URL=https://ktv-api.shaolongfei.com
ADMIN_BASE_URL=https://ktv-admin.shaolongfei.com
CONTROLLER_BASE_URL=https://ktv-controller.shaolongfei.com
TV_WEB_BASE_URL=https://ktv-tv.shaolongfei.com
CORS_ALLOWED_ORIGINS=https://ktv-admin.shaolongfei.com,https://ktv-controller.shaolongfei.com,https://ktv-tv.shaolongfei.com
MEDIA_ROOT=./runtime/media
MEDIA_PATH_MAPPINGS=/mnt/nas/KTV歌曲=/mnt/nas/KTV歌曲
TV_ROOM_SLUG=living-room
```

PostgreSQL 当前使用 `lxc-dev` 原生 Debian PostgreSQL 17，由 systemd 管理，只监听本机 `127.0.0.1:5432` 和 `::1:5432`。旧 Docker PostgreSQL 容器 `home-ktv-postgres-1` 已停用但暂未删除，作为迁移后的短期回滚点保留。源码部署的 API、Admin、Controller、Web TV 会占用 4000、5174、5176、5173 端口，所以旧 Docker 应用容器必须停止，避免端口冲突。

数据库常用检查：

```bash
pg_lsclusters
systemctl status postgresql --no-pager
PGPASSWORD=ktv psql -h 127.0.0.1 -p 5432 -U ktv -d home_ktv -c 'select count(*) from ktv_songs;'
docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}' | grep home-ktv-postgres || true
```

迁移到原生 PostgreSQL 前的备份保存在：

```bash
/opt/home-ktv-system/runtime/backups/postgres-native-migration-20260604-134843/
/opt/home-ktv-system/runtime/backups/postgres-native-final-cutover-20260604-135714/
```

## 部署

`lxc-dev` 只从 Git 更新代码。本地有未推送提交时，先在本机完成验证、提交并推送：

```bash
git status --short --branch
git push origin main
```

然后在服务器拉取并重启：

```bash
cd /opt/home-ktv-system
bash deploy/source/ktv.sh deploy
bash deploy/source/ktv.sh status
```

不要用本机 `pnpm dev:local` 或本地 Web 预览替代服务器验证；本地环境通常没有 `lxc-dev` 的 PostgreSQL、NAS bind mount 和公网 Caddy 链路。

## 真实曲库检查

`doctor` 应输出 KTV 索引诊断，重点看：

```text
active > 0
songs > 0
latest = completed
coverage 接近 100%
```

首页推荐依赖 `/rooms/living-room/songs/discovery`。如果 `doctor` 显示 KTV 索引有数据，但 discovery 返回空，优先检查 API 是否已把 discovery 路由接到 KTV 索引：

```bash
curl -sS 'https://ktv-api.shaolongfei.com/rooms/living-room/songs/discovery?seed=server-check&limit=30' \
  | jq '{count: (.recommended | length), recommended: [.recommended[0:5][] | {title, artistName}]}'
```

`count` 必须大于 0，才算真实曲库首页可测。

## 部署后 Smoke

每次重新编译部署 API、Controller 或 Web TV 后，都要在通知测试前跑公开入口 smoke：

```bash
bash deploy/source/ktv.sh smoke
```

这个 smoke 会覆盖 CORS、Web TV bootstrap/heartbeat、控制端看到 TV 在线，以及推荐列表非空。

## 公网入口

```text
API:        https://ktv-api.shaolongfei.com/health
Admin:      https://ktv-admin.shaolongfei.com/
pgweb:      https://pgweb.shaolongfei.com/
Controller: 通过 Web TV 二维码或 Admin 的 pairing.controllerUrl 进入，URL 必须带 token
Web TV:     https://ktv-tv.shaolongfei.com/?apiBaseUrl=https://ktv-api.shaolongfei.com&roomSlug=living-room&deviceName=Web%20TV
```

没有历史 cookie 时，裸 `https://ktv-controller.shaolongfei.com/controller?room=living-room` 不能创建控制会话，只能用于前端静态资源可达性检查。手动生成一次可用控制端 URL：

```bash
curl -sS -X POST 'https://ktv-api.shaolongfei.com/admin/rooms/living-room/pairing-token/refresh' \
  | jq -r '.pairing.controllerUrl'
```

## Caddy 和 Homepage

Caddy 配置在 `lxc-network:/etc/caddy/Caddyfile`。修改前先备份：

```bash
ts=$(date +%Y%m%d-%H%M%S)
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$ts
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

Homepage 配置在：

```bash
/opt/homepage/config/services.yaml
```

修改前同样先备份。

## pgweb

数据库网页浏览器 `pgweb` 部署在 `lxc-dev`，由 `lxc-network` 的 Caddy 反代并挂到 Homepage。

关键信息：

```text
服务名:     pgweb
安装目录:   /opt/pgweb
监听端口:   8082
访问域名:   https://pgweb.shaolongfei.com/
运行模式:   readonly
数据库连接: 复用 /opt/home-ktv-system/deploy/source/.env 中的 DATABASE_URL
```

常用命令：

```bash
ssh dev
systemctl status pgweb --no-pager
systemctl restart pgweb
journalctl -u pgweb -n 100 --no-pager
curl -sS http://127.0.0.1:8082/ | head
```

若要重装或升级：

```bash
ssh dev
cd /opt/pgweb
curl -fL -o pgweb_linux_amd64.zip https://github.com/sosedoff/pgweb/releases/download/v0.16.2/pgweb_linux_amd64.zip
python3 - <<'PY'
import zipfile
with zipfile.ZipFile("pgweb_linux_amd64.zip") as zf:
    zf.extractall(".")
PY
chmod +x /opt/pgweb/pgweb_linux_amd64
ln -sf /opt/pgweb/pgweb_linux_amd64 /opt/pgweb/pgweb
systemctl restart pgweb
```

`pgweb` 当前使用 `--readonly`，适合作为数据库可视化入口；它不会在网页界面里执行写操作，但数据库账号本身仍是现有业务账号，后续若安全边界变化，应再补独立只读账号。
