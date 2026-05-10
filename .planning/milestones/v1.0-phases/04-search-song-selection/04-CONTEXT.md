# Phase 4: Search & Song Selection - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段交付手机端中文优先搜索和版本感知点歌选择体验。用户应能通过中文歌名、歌手、拼音、首字母、别名和 `searchHints` 快速找到正式可点歌曲；当同一首歌存在多个已批准可播版本时，用户可以在点歌前选到想唱的那一版。

Phase 4 不负责在线补歌缓存、下载、转正或提交补歌任务；这些能力属于 Phase 5。Phase 4 可以在搜索体验中清楚区分“本地可播歌曲”和“在线补歌候选 / 占位”，但不能让在线候选进入队列或缓存流程。

</domain>

<decisions>
## Implementation Decisions

### 搜索召回与排序
- **D-01:** 搜索默认采用全字段召回：歌名、歌手、拼音全拼、拼音首字母、别名和 `searchHints` 都参与搜索。
- **D-02:** 搜索排序以明确命中优先：歌名精确命中 > 歌手精确命中 > 标准化 / 轻量模糊歌名命中 > 别名命中 > 拼音全拼命中 > 首字母命中 > `searchHints` 命中。
- **D-03:** 拼音首字母输入需要能召回结果，但权重较低；`qlx` 这类输入能搜到《七里香》，但不能压过中文歌名或歌手的明确命中。
- **D-04:** 搜索容错采用轻量策略：处理大小写、空格、符号、简繁体、全角 / 半角和拼音连续串；不在 Phase 4 做强错字、近似音或复杂编辑距离匹配。

### 手机端搜索结果体验
- **D-05:** 手机端搜索采用“输入即搜 + 搜索键立即触发”：输入时做轻量 debounce，点击键盘搜索键或搜索图标时立即查询。
- **D-06:** 未输入关键词时默认展示本地可点歌曲列表，保留 Phase 3 “可点歌曲”能力作为空查询状态，而不是显示空白说明页。
- **D-07:** 搜索结果行展示歌名、歌手、来源 / 状态、版本提示和点歌按钮；结果行需要为多版本展开或版本选择提供足够信息。
- **D-08:** 如果歌曲已在队列中，结果行应提示“已点 / 队列中”；再次点同一首歌时需要确认，防止误重复，但确认后仍允许重复点歌。

### 多版本点歌选择
- **D-09:** 只有一个可点版本时直接点歌，不进入额外版本选择流程。
- **D-10:** 多个可点版本时，在搜索结果中直接展开所有版本供用户选择，而不是弹窗或跳转到详情页。
- **D-11:** 版本展示信息包括版本名、来源类型、时长、清晰标识和推荐标记；不向普通手机用户暴露完整技术字段。
- **D-12:** 多版本默认推荐 / 排序优先最高清或最新资源；但每个版本内部仍遵守正式歌库的播放默认资源规则，不能把点歌前版本选择误建模成播放中原唱 / 伴唱切换。

### 在线补歌候选边界
- **D-13:** Phase 4 可以显示在线补歌候选分组 / 占位，但不能提交补歌请求，不能进入缓存流程，也不能把在线候选加入播放队列。
- **D-14:** 本地无结果时，显示“本地未找到”并展示在线候选占位，让用户知道系统正常但本地歌库没有该歌曲。
- **D-15:** 本地结果和在线候选同时存在时，本地可播歌曲永远排在上面，符合本地主路径和稳定性原则。
- **D-16:** 在线候选文案应明确表达“本地未入库，补歌功能后续可用”，避免用户误以为当前可以直接播放。

### the agent's Discretion
- 具体搜索 API 路径、响应 envelope、索引 SQL、PostgreSQL `pg_trgm` 使用细节、拼音库选择和排序分值常量由 researcher / planner 决定，但必须满足 D-01 至 D-04。
- 具体手机端布局、搜索框样式、版本展开样式、重复点歌确认弹窗和 loading / empty / error 状态由 UI 设计与实现阶段决定，但必须满足 D-05 至 D-12。
- 具体在线候选占位的数据结构可以先用 mock / 空分组 / feature-disabled response 表达，但不能突破 D-13 的 Phase 5 边界。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Requirements
- `.planning/ROADMAP.md` — Phase 4 的目标、成功标准和计划拆分：中文优先搜索读模型、排序规则、版本感知搜索结果和点歌选择流程。
- `.planning/REQUIREMENTS.md` — `SRCH-01`、`SRCH-02`、`SRCH-03`、`SRCH-04`、`QUEU-02` 的验收边界；`ONLN-*` 仍属于 Phase 5。
- `.planning/PROJECT.md` — 手机唯一控制端、本地歌库主路径、在线补歌为辅、服务端状态机唯一真相、稳定可唱优先等项目约束。
- `.planning/phases/02-library-ingest-catalog-admin/02-CONTEXT.md` — 正式歌库主路径严格要求 verified 原唱 / 伴唱双资源；导入与后台维护已允许编辑 `aliases` 和 `searchHints`。
- `.planning/phases/03-room-sessions-queue-control/03-CONTEXT.md` — Phase 3 只提供最小可点歌曲列表；完整中文搜索和多版本点歌选择明确留给 Phase 4。

### Existing Search and Catalog Model
- `packages/domain/src/index.ts` — `Song` 已包含 `titlePinyin`、`titleInitials`、`aliases`、`searchHints`、`searchWeight`、`defaultAssetId`；`Asset` 已包含 `sourceType`、`assetKind`、`displayName`、`durationMs`、`vocalMode`、`switchFamily`、`switchQualityStatus`。
- `apps/api/src/db/migrations/0001_media_contract.sql` — 当前 `songs` 表已有 `normalized_title`、`title_pinyin`、`title_initials`、`aliases`、`search_hints`、`search_weight`；`assets` 表已有来源、模式、状态和切换族字段。
- `apps/api/src/modules/catalog/repositories/song-repository.ts` — 当前 `listFormalSongs` 只支持 title / artist 的简单 `LIKE` 查询，是 Phase 4 搜索读模型的替换或扩展点。
- `apps/api/src/modules/catalog/repositories/asset-repository.ts` — `findVerifiedSwitchCounterparts` 定义了 verified 切换资源对查询；Phase 4 版本选择必须保护这个正式可播边界。
- `apps/api/src/routes/available-songs.ts` — Phase 3 的最小 `GET /rooms/:roomSlug/available-songs` 入口，只返回 ready 本地歌曲，不包含 Phase 4 搜索字段。

### Existing Mobile Controller Integration
- `apps/mobile-controller/src/App.tsx` — 当前手机控制页的“可点歌曲”列表、队列、当前播放和点歌按钮位置，是 Phase 4 搜索 UI 的主要替换点。
- `apps/mobile-controller/src/runtime/use-room-controller.ts` — 当前控制端在会话恢复后调用 `fetchAvailableSongs`，命令发送仍通过服务端 `sessionVersion` / `commandId`。
- `apps/mobile-controller/src/api/client.ts` — 当前 `AvailableSong` 类型和 `fetchAvailableSongs` / `addQueueEntry` 客户端方法，是搜索结果类型与点歌命令参数扩展点。

### Architecture Guide: Search
- `docs/KTV-ARCHITECTURE.md` §搜索字段分工 — `title`、`normalized_title`、`aliases`、`searchHints`、`title_pinyin`、`title_initials` 及歌手侧字段的职责。
- `docs/KTV-ARCHITECTURE.md` §搜索字段使用原则 — 显示字段与检索字段分离，`aliases` 与 `searchHints` 不混用，首字母低权重，组合词由服务端生成。
- `docs/KTV-ARCHITECTURE.md` §第一版索引建议 — 第一版搜索索引字段、自动生成字段和搜索排序建议。
- `docs/KTV-ARCHITECTURE.md` §搜索相关索引 — `pg_trgm`、btree 及 songs / artist / alias 索引建议。
- `docs/KTV-ARCHITECTURE.md` §`GET /api/songs/search` — 搜索 API 的草案参数和 local / online 分组响应方向。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/domain/src/index.ts`: `Song` 和 `Asset` 已经具备 Phase 4 需要的大部分字段，尤其是拼音、首字母、别名、search hints、资源来源、资源显示名和时长。
- `apps/api/src/db/migrations/0001_media_contract.sql`: 当前 schema 已给 `songs` 保留搜索字段，但还缺少 `pg_trgm`、歌手实体 / 别名表和专门搜索索引。
- `apps/api/src/modules/catalog/repositories/song-repository.ts`: 可作为正式歌曲读模型的起点，但当前查询只做简单 title / artist `LIKE`。
- `apps/api/src/routes/available-songs.ts`: 可作为手机端本地 ready 歌曲过滤规则的起点；Phase 4 应替换为搜索端点或在其旁边新增搜索端点。
- `apps/mobile-controller/src/App.tsx`: 可复用当前“可点歌曲”列表所在区域作为搜索框、结果列表和版本展开区域。

### Established Patterns
- 后端使用 TypeScript + Fastify + PostgreSQL，不引入 ORM；搜索读模型应优先沿用 SQL migration + typed repository 的模式。
- 共享类型从 `@home-ktv/domain`、`@home-ktv/player-contracts` 和 `@home-ktv/protocol` 暴露，搜索结果与版本选择响应不应在 API / mobile 之间重复定义不一致形状。
- 手机控制端通过服务端命令修改队列，仍必须携带 `commandId` 和 `sessionVersion`；搜索结果点击点歌不能绕过 Phase 3 的命令路径。
- Phase 2 已建立正式歌库准入边界，Phase 4 搜索不能让导入候选、`review_required`、未就绪资源或不合格资源污染手机端正式搜索体验。

### Integration Points
- API：新增或扩展歌曲搜索路由，支持 `q`、`limit`、可选语言 / 本地状态过滤，并返回 local / online 分组或明确禁用的 online 占位。
- Catalog repository：扩展搜索读模型，覆盖标题、歌手、拼音、首字母、别名、`searchHints` 和排序分值。
- Database migration：补齐搜索索引和必要的标准化 / 拼音字段维护策略；如果引入 artist / alias 表，必须迁移现有 `artist_name` 模式。
- Mobile controller：把当前 `availableSongs` 列表替换为搜索状态、搜索结果、版本展开、重复点歌确认和在线候选占位。
- Queue command：多版本点歌可能需要让 `add-queue-entry` 接受具体版本 / asset 选择，但仍由服务端校验该版本是否属于正式 ready 可播资源。

</code_context>

<specifics>
## Specific Ideas

- 用户希望默认就是完整搜索体验，不需要用户切换“高级搜索”才能搜拼音、首字母、别名或 `searchHints`。
- 搜索应优先“搜得到且不混乱”，首字母和 `searchHints` 能召回但不能抢占明确中文命中。
- 手机端没输入关键词时仍应该可点歌，避免打开控制页后出现空白搜索页。
- 重复点同一首歌是允许的 KTV 场景，但需要确认来避免误触。
- 多版本结果直接在搜索结果里展开，减少弹窗和跳转。
- 在线补歌请求是用户想要的能力，但本次已明确 deferred 到 Phase 5，Phase 4 只做边界展示。

</specifics>

<deferred>
## Deferred Ideas

- 允许用户从搜索结果提交在线补歌请求，并进入“先缓存、后播放”流程 — Phase 5 `ONLN-01` / `ONLN-02`。
- 在线候选进入缓存后转为正式可点资源、失败重试、清理和资源转正 — Phase 5 `ONLN-03` / `ONLN-04`。
- 最近点歌、最近搜索、收藏、热门榜单、按歌手浏览和历史重唱 — v2 discovery / convenience 范围，不进入 Phase 4。
- 强错字、近似音、复杂编辑距离、推荐排序和个性化排序 — 后续搜索质量增强，不作为 Phase 4 必需项。

</deferred>

---

*Phase: 04-search-song-selection*
*Context gathered: 2026-05-07*

