# 文档入口

这个目录只保留当前 HomeKTV 的有效说明。历史实施计划、旧迁移过程和阶段性调研记录不再放在 `docs/` 主路径里；如果需要查历史，请使用 Git 记录。

## 推荐阅读顺序

1. [当前架构](KTV-ARCHITECTURE.md)
2. [项目结构](project-structure.md)
3. [部署说明](deployment.md)
4. [数据库结构](database-schema.md)
5. [真实曲库索引](KTV-FULL-INDEX.md)

## 部署与运维

- [本地开发部署](deployment-local.md)
- [源码部署](deployment-source.md)
- [Docker Compose 部署](deployment-docker.md)
- [lxc-dev 服务器 Runbook](runbooks/deploy-lxc-dev.md)
- [发布检查清单](runbooks/release-checklist.md)
- [故障排查](runbooks/troubleshooting.md)
- [仓库卫生规则](runbooks/repo-hygiene.md)

## 曲库维护

- [真实曲库索引](KTV-FULL-INDEX.md)
- [在线补歌源（ige8）](runbooks/online-song-source.md)
- [歌曲导入流程](runbooks/song-importing.md)
- [歌曲封面缓存](runbooks/song-cover-fetching.md)
- [热门歌曲工具](../packages/hot-songs/README.md)
- [工具脚本说明](../scripts/README.md)

## 文档维护规则

- 给人读的长期文档使用中文。
- 主路径文档只解释当前系统，不记录已废弃表结构、旧阶段计划或历史分歧。
- 具体脚本的参数和重跑策略放在 runbook 或脚本目录 README。
- 部署、数据库、曲库、Android TV 这类会影响测试和运维的文档，改完后要跑对应测试或 smoke。
