# Phase 04: search-song-selection - Research

**Researched:** 2026-05-07
**Domain:** Chinese-first catalog search, PostgreSQL ranking, version-aware queue selection, mobile controller UX
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Claude's Discretion
- 具体搜索 API 路径、响应 envelope、索引 SQL、PostgreSQL `pg_trgm` 使用细节、拼音库选择和排序分值常量由 researcher / planner 决定，但必须满足 D-01 至 D-04。
- 具体手机端布局、搜索框样式、版本展开样式、重复点歌确认弹窗和 loading / empty / error 状态由 UI 设计与实现阶段决定，但必须满足 D-05 至 D-12。
- 具体在线候选占位的数据结构可以先用 mock / 空分组 / feature-disabled response 表达，但不能突破 D-13 的 Phase 5 边界。

### Deferred Ideas (OUT OF SCOPE)
- 允许用户从搜索结果提交在线补歌请求，并进入“先缓存、后播放”流程 — Phase 5 `ONLN-01` / `ONLN-02`。
- 在线候选进入缓存后转为正式可点资源、失败重试、清理和资源转正 — Phase 5 `ONLN-03` / `ONLN-04`。
- 最近点歌、最近搜索、收藏、热门榜单、按歌手浏览和历史重唱 — v2 discovery / convenience 范围，不进入 Phase 4。
- 强错字、近似音、复杂编辑距离、推荐排序和个性化排序 — 后续搜索质量增强，不作为 Phase 4 必需项。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRCH-01 | 用户可以按中文歌名关键词搜索可点歌曲 | Use normalized title matching plus `pg_trgm` / `LIKE` recall, filtered to formal ready songs with playable version options. |
| SRCH-02 | 用户可以按歌手名搜索可点歌曲 | Use existing `artist_name` plus generated `artist_pinyin` / `artist_initials` read-model columns in Phase 4, without forcing a full artist-table migration. |
| SRCH-03 | 用户可以按拼音全拼、拼音首字母、别名或预设 `searchHints` 搜索可点歌曲 | Add deterministic pinyin and normalization helpers; query title, artist, aliases, and hints with explicit score buckets. |
| SRCH-04 | 搜索结果可以清楚区分本地可播歌曲与在线补歌候选 | Return `local` results and a disabled `online` placeholder group; never return online candidates as queueable in Phase 4. |
| QUEU-02 | 当一首歌存在多个可播版本时，用户可以在点歌前选择具体资源版本；原唱/伴唱切换通过播放中控制完成 | Extend search results with queueable version options and extend `add-queue-entry` to accept a selected `assetId`, while keeping switch counterparts as runtime playback controls. |
</phase_requirements>

## Summary

Phase 4 should stay inside the existing TypeScript + Fastify + PostgreSQL architecture. Do not introduce Meilisearch, Elasticsearch, or a separate search service for v1. The right plan is to build a catalog search read model in `PgSongRepository`, add `pg_trgm`/btree indexes and lightweight query normalization, and return a typed search response that separates local queueable songs from disabled online placeholders.

The main implementation risk is not text matching by itself; it is preserving the formal catalog and queue boundaries. Search must filter out import candidates, `review_required` songs, assets that are not `ready`, and songs without a verified switch counterpart. Multi-version point-song flow must select a concrete queueable `assetId` before enqueueing, but original/instrumental switching remains a playback-time control through the verified `switchFamily` pair.

**Primary recommendation:** Build `GET /rooms/:roomSlug/songs/search?q=&limit=` plus shared search result contracts, a scored PostgreSQL query, `pinyin-pro` / `opencc-js` normalization helpers, and an `assetId`-aware `add-queue-entry` command path.

## Project Constraints (from AGENTS.md)

- First release prioritizes stable singing over feature breadth.
- Mobile is the only control surface; TV must not carry search or complex operations.
- Playback and queue state are judged by the server state machine only.
- Software must not implement realtime vocal DSP.
- Local catalog is primary; online supplement is secondary and cannot become a main dependency.
- Online songs must be cached before playback in v1.
- Keep the `room` concept even though v1 is single-room.
- Chinese search must cover title, artist, pinyin, initials, aliases, and simplified/traditional variants.
- Expected topology: business/tasks on `lxc-dev`; library/cache on `lxc-nas`.
- Follow existing patterns found in the codebase; direct repo edits should remain within GSD workflow context.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL `pg_trgm` | PostgreSQL 18 current docs, extension bundled | Similarity and indexed substring search over normalized text/pinyin fields | Official PostgreSQL extension supports GIN/GiST trigram indexes for `LIKE`, `ILIKE`, regex, and similarity operators. |
| `pg` | 8.20.0, npm modified 2026-03-04 | Existing PostgreSQL driver | Already used by `apps/api`; keep SQL explicit and avoid introducing an ORM mid-phase. |
| Fastify | 5.8.5, npm modified 2026-04-14 | Search and command HTTP routes | Existing API framework; current installed version is latest. |
| TypeScript | 6.0.3, npm modified 2026-04-16 | Shared contracts and typed repositories | Project-wide standard; prevents drift between API and mobile search result shapes. |
| React | Installed 19.2.5; latest 19.2.6, npm modified 2026-05-06 | Mobile controller UI | Existing frontend runtime. Do not upgrade React in this phase unless forced by dependency resolution. |
| `pinyin-pro` | 3.28.1, npm modified 2026-04-10 | Generate pinyin full spelling, initials, and optional pinyin matching | Official README supports no-tone pinyin arrays and initial/full-pinyin matching, which maps directly to SRCH-03. |
| `opencc-js` | 1.3.0, npm modified 2026-05-04 | Simplified/traditional normalization | Pure JS, no native binaries, works in Node/bundlers; use server-side for query/index normalization. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Query | Installed 5.100.6; latest 5.100.9, npm modified 2026-05-03 | Mobile search request caching/loading/error state | Use if the search UI becomes cleaner with request keys and cancellation; otherwise current hook state is acceptable. |
| Vitest | 4.1.5, npm modified 2026-05-05 | API repository/routes and mobile interaction tests | Existing test runner; Phase 4 should add targeted tests around ranking, filtering, version selection, and duplicate confirmation. |
| Testing Library React | 16.3.2 installed | Mobile UI tests | Existing mobile test style. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostgreSQL `pg_trgm` | Meilisearch / Elasticsearch | Better later for large catalogs and typo tolerance, but adds ops, sync, ranking drift, and Phase 4 does not need strong typo search. |
| Explicit SQL scoring | Database full-text search only | PostgreSQL text search is not a good primary fit for pinyin/initials/array hints; explicit buckets match the locked product ranking. |
| `pinyin-pro` | Hand-maintained pinyin strings only | Existing records may have fields, but admin edits and future imports need deterministic regeneration. |
| `opencc-js` | Native OpenCC binding | Native binding is closer to upstream OpenCC but adds install/runtime complexity; `opencc-js` is enough for lightweight Phase 4 normalization. |

**Installation:**
```bash
pnpm add -F @home-ktv/api pinyin-pro@3.28.1 opencc-js@1.3.0
```

**Version verification:** package versions were verified with `npm view` on 2026-05-07. PostgreSQL `pg_trgm` behavior was verified against the official PostgreSQL 18 current documentation.

## Architecture Patterns

### Recommended Project Structure

```text
apps/api/src/modules/catalog/
├── search-normalization.ts        # NFKC, punctuation/space folding, OpenCC, pinyin helpers
├── search-ranking.ts              # score constants and match reason labels
└── repositories/song-repository.ts # searchFormalSongs() SQL read model

apps/api/src/routes/
└── song-search.ts                  # GET /rooms/:roomSlug/songs/search

packages/domain/src/index.ts        # Search result/version contract types
apps/mobile-controller/src/search/  # search state, result rows, version expansion
```

### Pattern 1: Field-Bucketed Search Ranking

**What:** Query all allowed fields, emit match booleans/similarity values, and compute a single score with explicit `CASE` buckets matching D-02. Use `search_weight` only as a tie-breaker inside the same bucket.

**When to use:** Every formal mobile search query, including empty query where the result becomes the default ready-song list.

**Example:**
```sql
-- Source: PostgreSQL pg_trgm docs and docs/KTV-ARCHITECTURE.md search ranking.
SELECT
  s.id,
  s.title,
  s.artist_name,
  CASE
    WHEN s.normalized_title = $1 THEN 1000
    WHEN lower(s.artist_name) = $1 THEN 900
    WHEN similarity(s.normalized_title, $1) >= 0.45 THEN 800
    WHEN EXISTS (SELECT 1 FROM unnest(s.aliases) a WHERE lower(a) LIKE $2) THEN 700
    WHEN s.title_pinyin LIKE $2 OR $1 = s.title_pinyin THEN 600
    WHEN s.title_initials LIKE $2 OR $1 = s.title_initials THEN 500
    WHEN EXISTS (SELECT 1 FROM unnest(s.search_hints) h WHERE lower(h) LIKE $2) THEN 400
    ELSE 0
  END + s.search_weight AS score
FROM songs s
WHERE s.status = 'ready'
  AND (
    s.normalized_title LIKE $2
    OR lower(s.artist_name) LIKE $2
    OR s.title_pinyin LIKE $2
    OR s.title_initials LIKE $2
    OR EXISTS (SELECT 1 FROM unnest(s.aliases) a WHERE lower(a) LIKE $2)
    OR EXISTS (SELECT 1 FROM unnest(s.search_hints) h WHERE lower(h) LIKE $2)
  )
ORDER BY score DESC, s.title ASC
LIMIT $3;
```

### Pattern 2: Queueable Version Options

**What:** Search results should include only version options that can be enqueued: asset is `ready`, belongs to the song, has a verified switch counterpart, and is not itself an online ephemeral candidate.

**When to use:** Before rendering any point-song button and again inside `add-queue-entry` server validation.

**Example:**
```typescript
// Source: existing PgAssetRepository.findVerifiedSwitchCounterparts pattern.
const counterparts = await assets.findVerifiedSwitchCounterparts(asset);
const queueable = asset.status === "ready" && asset.songId === song.id && counterparts.length > 0;
```

### Pattern 3: Server-Authoritative Selection

**What:** The mobile UI may suggest/recommend a version, but enqueueing sends `songId`, selected `assetId`, `commandId`, and `sessionVersion` to the existing command route. The server revalidates the selected asset before appending `QueueEntry`.

**When to use:** For both single-version direct point-song and expanded multi-version selection.

**Example:**
```typescript
// Source: existing apps/mobile-controller/src/api/client.ts command envelope.
return sendCommand(input, "add-queue-entry", {
  songId: input.songId,
  assetId: input.assetId
});
```

### Anti-Patterns to Avoid

- **Ranking by raw SQL similarity alone:** It will let initials or hint noise outrank exact Chinese title/artist matches.
- **Returning raw import candidates:** Candidate/import tables are admin workflow state and must not appear in formal mobile search.
- **Treating original/instrumental as pre-queue versions:** A selected queue asset anchors the version; vocal mode switching is still runtime state through verified counterparts.
- **Client-only queueability checks:** The mobile UI can hide invalid actions, but the command handler must reject stale or invalid selected assets.
- **Creating artist tables in this phase unless required:** Existing schema uses `artist_name`; add generated/search columns if needed and defer full artist normalization unless a migration is already planned.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chinese pinyin generation | Custom character map | `pinyin-pro` | Polyphonic handling and initial/full-pinyin support are mature library concerns. |
| Simplified/traditional conversion | Regex or manual replacement map | `opencc-js` | Phrase-level conversion has edge cases; the package bundles OpenCC-derived dictionaries. |
| Trigram indexing/search | Custom substring index tables | PostgreSQL `pg_trgm` + btree | Official extension provides indexed `LIKE`/similarity operators. |
| Queue version validation | Client-side-only asset filtering | Existing `AssetRepository.findVerifiedSwitchCounterparts` plus server command validation | Prevents stale mobile results from enqueueing unready assets. |
| Online supplement workflow | Mock cache/download/job tables | Disabled `online` placeholder group | Phase 5 owns online request, cache, retry, and promote workflows. |

**Key insight:** Search quality here comes from controlled fields and product ranking, not from a generic search box. The planner should preserve semantic field boundaries and only use libraries for well-known hard parts.

## Common Pitfalls

### Pitfall 1: Search Leaks Non-Formal Records
**What goes wrong:** Import candidates, `review_required` songs, or assets without ready verified pairs show on the phone.
**Why it happens:** Reusing admin catalog list methods without the formal-ready filter.
**How to avoid:** Create a mobile-specific `searchFormalSongs` path and apply the same queueability check used by `available-songs`.
**Warning signs:** Search result count is higher than `available-songs` for empty query.

### Pitfall 2: Version Selection Breaks Vocal Switching
**What goes wrong:** Original/伴唱 becomes a one-time queue choice instead of a playback control.
**Why it happens:** Rendering every vocal asset as an independent “version.”
**How to avoid:** Group assets by `switchFamily`/version family; queue a recommended/default asset within that family and require a verified counterpart for runtime switching.
**Warning signs:** Search UI labels options mainly as “原唱版/伴唱版” instead of source/quality/duration/version.

### Pitfall 3: Initials and Hints Pollute Top Results
**What goes wrong:** `qlx` works, but `q` or noisy hints bury exact title matches.
**Why it happens:** One flat text blob or array concatenation with equal weights.
**How to avoid:** Keep explicit score buckets and lower priority for initials/hints.
**Warning signs:** A Chinese exact title query does not rank first.

### Pitfall 4: Array Search Is Slow or Unindexable
**What goes wrong:** `unnest(aliases)` scans every row on larger libraries.
**Why it happens:** Arrays are convenient but harder to trigram-index per value.
**How to avoid:** For v1 scale, arrays are acceptable with `LIMIT` and formal filters; if data grows, migrate aliases/hints to normalized side tables with trigram indexes.
**Warning signs:** `EXPLAIN` shows sequential scans after catalog size grows.

### Pitfall 5: Debounced Input Races Immediate Search
**What goes wrong:** User presses search, then a stale debounced request overwrites newer results.
**Why it happens:** No request identity/cancellation.
**How to avoid:** Use `AbortController` or TanStack Query keys; always render the result for the latest normalized query only.
**Warning signs:** Results flicker back to an older query after pressing the search key.

## Code Examples

### Normalization Helper
```typescript
// Source: opencc-js README and pinyin-pro README.
import OpenCC from "opencc-js";
import { pinyin } from "pinyin-pro";

const toSimplified = OpenCC.Converter({ from: "hk", to: "cn" });

export function normalizeSearchText(value: string): string {
  return toSimplified(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

export function pinyinKey(value: string): string {
  return pinyin(value, { toneType: "none", type: "array" }).join("");
}
```

### `assetId`-Aware Queue Command Validation
```typescript
// Source: existing session-command-service addQueueEntry flow.
const requestedAssetId = typeof input.payload.assetId === "string" ? input.payload.assetId : song.defaultAssetId;
if (!requestedAssetId) return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");

const asset = await input.repositories.assets.findById(requestedAssetId);
if (!asset || asset.songId !== song.id || asset.status !== "ready") {
  return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
}

const counterparts = await input.repositories.assets.findVerifiedSwitchCounterparts(asset);
if (counterparts.length === 0) {
  return rejected(input.commandId, input.sessionVersion, "SONG_NOT_QUEUEABLE");
}
```

### Search Response Shape
```typescript
export interface SongSearchResponse {
  query: string;
  local: SongSearchLocalResult[];
  online: {
    status: "disabled";
    message: string;
    candidates: [];
  };
}

export interface SongSearchLocalResult {
  songId: string;
  title: string;
  artistName: string;
  matchReason: "title" | "artist" | "normalized_title" | "alias" | "pinyin" | "initials" | "search_hint" | "default";
  queueState: "not_queued" | "queued";
  versions: SongSearchVersionOption[];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate search engine by default | PostgreSQL normalized fields + `pg_trgm` first | Project architecture, 2026-04-27 | Lower ops cost and enough for v1 Chinese-first MVP. |
| Raw title/artist `LIKE` only | Explicit multi-field scoring over title, artist, aliases, pinyin, initials, hints | Phase 4 | Meets SRCH-01 through SRCH-03 without strong typo search. |
| Song-only queue command | Song plus optional selected `assetId` | Phase 4 QUEU-02 | Enables multi-version choice while preserving server validation. |
| Online candidate as queueable result | Disabled online placeholder group | Phase 4, before Phase 5 | Satisfies SRCH-04 without crossing supplement workflow scope. |

**Deprecated/outdated:**
- `GET /rooms/:roomSlug/available-songs` as the main mobile song list: keep as compatibility if useful, but the search endpoint should become the primary Phase 4 read path.
- Default-asset-only enqueueing for all songs: valid fallback for single-version results, insufficient for QUEU-02.

## Open Questions

1. **Should Phase 4 add artist pinyin columns or full artist tables?**
   - What we know: The architecture recommends artist-side pinyin/initials, but current schema stores `artist_name` inline.
   - What's unclear: Whether Phase 2 intentionally deferred `artists` tables or simply did not need them yet.
   - Recommendation: Add `artist_pinyin` and `artist_initials` to `songs` for Phase 4; defer full `artists` / alias tables unless the planner wants a larger migration.

2. **How should multiple assets be grouped into user-facing versions?**
   - What we know: `Asset` has `sourceType`, `assetKind`, `displayName`, `durationMs`, `vocalMode`, `switchFamily`, and `switchQualityStatus`.
   - What's unclear: There is no explicit `versionGroupId` beyond `switchFamily`.
   - Recommendation: Treat each verified switch family as one user-facing version. Within each family, recommend the default asset when it belongs to the family; otherwise prefer local, ready, verified, newest/clearest display label.

3. **Should empty query call search or keep `available-songs`?**
   - What we know: D-06 requires an empty-query local song list.
   - What's unclear: Whether to retire the old endpoint immediately.
   - Recommendation: Implement empty query in the new search endpoint and migrate mobile to it; optionally keep `available-songs` for compatibility tests.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | API/mobile development | Yes | v25.8.0 | Project expects modern Node; current runtime is newer than project baseline. |
| pnpm | Workspace installs/scripts | Yes | 10.33.2 | None needed. |
| npm | Version verification | Yes | 11.11.0 | pnpm registry commands. |
| PostgreSQL client/server | Running migrations against a real DB | No local `psql` / `pg_isready` found | — | Planner can still implement/test repository SQL with unit harnesses; real migration validation requires a Postgres environment. |
| Vitest | Automated tests | Yes | 4.1.5 | None needed. |

**Missing dependencies with no fallback:**
- A local PostgreSQL CLI/server was not detected. Plans that verify `pg_trgm` migrations against a live database need an install/service step or a project Docker/Postgres target.

**Missing dependencies with fallback:**
- None for code implementation; SQL can be reviewed and API/mobile behavior can be covered with existing Vitest harnesses.

## Sources

### Primary (HIGH confidence)
- Project files: `.planning/phases/04-search-song-selection/04-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `AGENTS.md`.
- Code files: `packages/domain/src/index.ts`, `apps/api/src/db/migrations/0001_media_contract.sql`, `apps/api/src/modules/catalog/repositories/song-repository.ts`, `apps/api/src/modules/catalog/repositories/asset-repository.ts`, `apps/api/src/routes/available-songs.ts`, `apps/api/src/modules/playback/session-command-service.ts`, `apps/mobile-controller/src/App.tsx`, `apps/mobile-controller/src/api/client.ts`, `apps/mobile-controller/src/runtime/use-room-controller.ts`.
- Official PostgreSQL docs: https://www.postgresql.org/docs/current/pgtrgm.html - verified `pg_trgm` functions, similarity thresholds, and GIN/GiST index support for `LIKE`/similarity.
- pinyin-pro official README: https://github.com/zh-lx/pinyin-pro and https://raw.githubusercontent.com/zh-lx/pinyin-pro/master/README.md - verified pinyin, initials, no-tone output, and match support.
- opencc-js official README: https://github.com/nk2028/opencc-js and https://raw.githubusercontent.com/nk2028/opencc-js/main/README.md - verified Node/ES module import, converter API, locales, and pure JS packaging.
- npm registry metadata via `npm view` on 2026-05-07 for `pinyin-pro`, `opencc-js`, `fastify`, `pg`, `@tanstack/react-query`, `react`, `vite`, `vitest`, and `typescript`.

### Secondary (MEDIUM confidence)
- `docs/KTV-ARCHITECTURE.md` - project architecture recommendations for search fields, indexes, endpoint shape, and online candidate boundaries. This is internal design guidance, not runtime proof.

### Tertiary (LOW confidence)
- None used as authoritative input.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - confirmed from installed package manifests, npm registry metadata, and official PostgreSQL/package docs.
- Architecture: HIGH - directly follows existing repository/route/command patterns and locked Phase 4 decisions.
- Pitfalls: MEDIUM-HIGH - derived from current code boundaries plus official `pg_trgm` behavior; performance risk depends on final catalog size.

**Research date:** 2026-05-07
**Valid until:** 2026-06-06 for package versions; 2026-08-05 for architecture direction unless Phase 5 changes online supplement scope.
