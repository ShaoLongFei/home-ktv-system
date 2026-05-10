# Phase 2: Library Ingest & Catalog Admin - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

本阶段交付本地歌库导入、候选审核、正式入库准入和最小后台维护能力。目标是把磁盘上的本地歌曲资源变成可审核、可维护、并满足播放中原唱 / 伴唱切换准入规则的正式歌曲目录。

Phase 2 不负责手机端点歌搜索、不负责扫码入场、不负责队列控制，也不负责在线补歌缓存流程。在线补歌未来转正时应复用同一套正式歌库结构和准入规则。

</domain>

<decisions>
## Implementation Decisions

### 导入文件归档方式
- **D-01:** 候选资源审核通过后，文件必须从导入区域移动到正式歌库目录 `/songs/<language>/<artist>/<title>/`，正式目录成为主文件位置。
- **D-02:** 审核通过时遇到同名歌手 / 同名歌曲目录冲突，系统不得自动合并；必须生成冲突候选，由管理员确认合并到已有目录或创建新版本目录。
- **D-03:** 正式 `/songs` 目录以 `song.json` 为业务真相。正式目录扫描只做轻量一致性校验，例如文件存在、可探测、数据库状态与 `song.json` 是否一致。
- **D-04:** 导入扫描同时支持三种触发方式：文件监听做无感知增量触发，低频定时扫描做查漏补缺，后台手动扫描作为兜底。
- **D-05:** 文件监听和定时扫描都必须是轻量操作，默认走增量检测；不应频繁全量扫描或反复对未变化文件执行 `ffprobe`。

### 候选审核流程
- **D-06:** 候选审核页面采用两层视图：默认按候选歌曲分组，展开后查看原始文件列表、扫描推断和媒体探测结果。
- **D-07:** 审核阶段必须允许管理员修正完整元数据，包括歌名、歌手、语种、原唱 / 伴唱角色、默认资源、是否同一版本族、流派、标签、年份、别名和 `searchHints`。
- **D-08:** `搁置` 表示暂不处理但保留候选。文件留在 `imports/needs-review`，候选状态为 `held`，之后仍可继续编辑和入库。
- **D-09:** `拒绝` 表示直接删除对应文件，不移动到 `imports/rejected`。由于这是不可逆危险操作，后台必须提供明确二次确认。

### 正式入库准入规则
- **D-10:** Phase 2 的正式歌库主路径必须严格要求原唱 / 伴唱成对资源；只有单个可播放资源的歌曲不得正式入库，只能作为候选搁置。
- **D-11:** 原唱 / 伴唱资源都存在但无法证明同版本、同时轴时，进入 `review-required`，不得正式入库。
- **D-12:** 正式入库的双资源时长差必须 `<=300ms`。时长差 `>300ms` 一律不能正式入库，即使人工确认也不能转为 `verified`。
- **D-13:** `300ms-1s` 的资源对可以保留为 `review-required` 候选，但不允许进入正式主路径。
- **D-14:** 正式入库后，默认播放资源为伴唱版；原唱版作为播放中切换目标。
- **D-15:** 这些 Phase 2 决策比架构文档中“第一版允许资源不完整”的一般建议更严格。下游规划应以本 CONTEXT 对正式主路径的约束为准。

### 歌库后台最小界面
- **D-16:** Phase 2 后台首页优先是导入审核工作台，直接展示待扫描、待审核、搁置和 `review-required` 的候选队列。
- **D-17:** 正式歌库维护页必须支持歌曲与资源核心维护：完整歌曲元数据、默认资源、资源状态、`switchFamily`、`vocalMode` 等。
- **D-18:** Phase 2 后台不做登录和账号体系，默认只在内网 / 受控部署环境访问；后台入口不应暴露到公网。
- **D-19:** 普通编辑可以直接保存；删除文件、修改配对关系、禁用 `ready` 资源等危险操作必须二次确认。

### the agent's Discretion
- 具体文件监听实现、低频扫描间隔、去抖策略和扫描任务并发限制由后续 research / planning 决定，但必须保持轻量和增量。
- 具体后台页面布局、表格字段密度、状态标签文案和确认弹窗样式由后续 UI 设计与实现决定，但必须优先服务导入审核工作流。
- 具体候选状态命名可以由 planner 统一，但必须表达 pending / held / review-required / approved / rejected-delete 等语义。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Requirements
- `.planning/ROADMAP.md` — Phase 2 的目标、成功标准和计划拆分：扫描导入、审核修正、准入规则和维护能力。
- `.planning/REQUIREMENTS.md` — `LIBR-01`、`LIBR-02`、`LIBR-04`、`LIBR-05`、`LIBR-06`、`ADMN-01` 的验收边界。
- `.planning/PROJECT.md` — 本地主路径、在线补歌为辅、手机唯一控制端、服务端权威状态、无复杂后台 CMS 的项目约束。
- `.planning/phases/01-media-contract-tv-runtime/01-CONTEXT.md` — 原唱 / 伴唱切换是 v1 硬约束；正式歌库准入必须服务 Phase 1 播放中切换能力。

### Existing Media and Catalog Contracts
- `packages/domain/src/index.ts` — 现有 `Song`、`Asset`、`AssetStatus`、`VocalMode`、`SwitchQualityStatus`、`switchFamily` 类型定义。
- `apps/api/src/db/migrations/0001_media_contract.sql` — 当前已落地的 `songs`、`assets`、`rooms`、`queue_entries`、`playback_sessions` 等基础表。
- `apps/api/src/modules/catalog/repositories/song-repository.ts` — 当前只读 `SongRepository` 模式。
- `apps/api/src/modules/catalog/repositories/asset-repository.ts` — 当前只读 `AssetRepository` 以及 verified switch counterpart 查询逻辑。

### Architecture Guide: Local Library and Ingest
- `docs/KTV-ARCHITECTURE.md` §本地歌库目录规范 — `/songs`、`/imports/pending`、`/imports/needs-review`、`/imports/rejected`、`/cache/online`、`/artifacts` 的职责建议。
- `docs/KTV-ARCHITECTURE.md` §`song.json` 设计 — 正式目录结构化元数据入口、最小字段集、完整字段建议和 `assets` 字段建议。
- `docs/KTV-ARCHITECTURE.md` §导入与入库流程 — 原始导入、扫描归类、候选 `song.json`、人工复核和拒绝条件。
- `docs/KTV-ARCHITECTURE.md` §扫描器策略 — 结构化元数据优先、文件名只做候选、增量扫描和文件变更检测。
- `docs/KTV-ARCHITECTURE.md` §入库与播放的关键原则 — 导入与正式入库解耦，切换能力不能建立在文件名猜测上。

### Architecture Guide: Switching and Admittance
- `docs/KTV-ARCHITECTURE.md` §原唱 / 伴唱切换策略 — 双视频资产切换、`switchFamily` 语义和播放中切换前提。
- `docs/KTV-ARCHITECTURE.md` §第一版切换规则 — 只有成对资源才显示切换按钮，播放中切换建立在同进度重入和严格准入之上。
- `docs/KTV-ARCHITECTURE.md` §数据模型落地 — `capabilities.canSwitchVocalMode` 应由资产集合推导，`switchFamily` 标识可互切版本族。

### Architecture Guide: Admin and Database
- `docs/KTV-ARCHITECTURE.md` §表结构总览 — `artists`、`artist_aliases`、`song_aliases`、`source_records`、`candidate_tasks` 等 Phase 2 可能需要补齐的表。
- `docs/KTV-ARCHITECTURE.md` §表设计建议 — catalog / asset / source / candidate 表字段和索引边界。
- `docs/KTV-ARCHITECTURE.md` §JSONB 使用边界 — 哪些字段适合结构化列，哪些适合 `jsonb`。
- `docs/KTV-ARCHITECTURE.md` §唯一性与去重原则 — 不对歧义业务对象过早强唯一，靠业务层与人工校正清理。
- `docs/KTV-ARCHITECTURE.md` §后台的角色定位 — 第一版后台服务 `system-admin`，不做复杂 RBAC。
- `docs/KTV-ARCHITECTURE.md` §第一版后台必须包含的能力 — 歌库管理、导入审核、任务查看等后台能力边界。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/domain/src/index.ts`: 已有 `Song` / `Asset` / `VocalMode` / `AssetStatus` / `SwitchQualityStatus` 类型，可作为 Phase 2 catalog 和 admission 规则的起点。
- `apps/api/src/db/migrations/0001_media_contract.sql`: 已有 `songs` 和 `assets` 基础表，但缺少 Phase 2 需要的候选导入、artist aliases、song aliases、source records、扫描记录等结构。
- `apps/api/src/modules/catalog/repositories/song-repository.ts`: 已有 PostgreSQL repository 映射风格，后续可扩展写入、列表和维护接口。
- `apps/api/src/modules/catalog/repositories/asset-repository.ts`: 已有 verified counterpart 查询逻辑，Phase 2 准入规则应保证这个查询只看到严格合格的可切换资源对。

### Established Patterns
- Monorepo 使用 pnpm workspace + Turborepo。
- 后端使用 TypeScript + Fastify + PostgreSQL，不引入 ORM；当前模式是 SQL migration + typed repository interfaces。
- 共享类型从 `@home-ktv/domain` 和协议包暴露，应用层不应重复定义核心 catalog / playback 形状。
- Phase 1 已把 TV 切换保持为 backend-authorized，TV 不自己推断资源配对；因此 Phase 2 必须在后端 catalog 层保证配对真相。

### Integration Points
- 新增数据库迁移：补齐导入候选、扫描状态、artist / alias / source metadata，以及正式入库所需的状态字段。
- 新增 API module：本地扫描、媒体探测、候选归并、审核动作、正式入库、搁置、拒绝删除、正式歌库维护。
- 新增后台 UI：可以是新的 admin app 或复用现有前端构建方式，但 Phase 2 后台首页应直接进入导入审核工作台。
- 现有 playback target / switch target 构建逻辑会消费 `ready` + `verified` + same `switchFamily` 的资产对；Phase 2 的输出必须保持这个契约可靠。

</code_context>

<specifics>
## Specific Ideas

- 用户明确希望扫描触发“三者同时存在”：文件监听无感知，低频定时扫描查漏补缺，手动触发兜底。
- 用户希望扫描是轻操作，不能为了自动化而让 NAS / LXC 环境持续高负载。
- 用户选择了比原始架构建议更严格的正式库策略：单资源不能正式入库，`>300ms` 时长差不能正式入库。
- 用户接受拒绝候选时直接删除文件，但这必须被视为危险操作并二次确认。
- Phase 2 后台可以完全不做登录，但前提是只在内网或受控环境暴露。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 2 scope.

</deferred>

---

*Phase: 02-library-ingest-catalog-admin*
*Context gathered: 2026-04-30*
