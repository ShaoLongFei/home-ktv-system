# Phase 2: Library Ingest & Catalog Admin - Research

**Researched:** 2026-04-30
**Domain:** Local media library ingest, catalog administration, strict original/instrumental switch admission
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 导入文件归档方式
- **D-01:** 候选资源审核通过后，文件必须从导入区域移动到正式歌库目录 `/songs/<language>/<artist>/<title>/`，正式目录成为主文件位置。
- **D-02:** 审核通过时遇到同名歌手 / 同名歌曲目录冲突，系统不得自动合并；必须生成冲突候选，由管理员确认合并到已有目录或创建新版本目录。
- **D-03:** 正式 `/songs` 目录以 `song.json` 为业务真相。正式目录扫描只做轻量一致性校验，例如文件存在、可探测、数据库状态与 `song.json` 是否一致。
- **D-04:** 导入扫描同时支持三种触发方式：文件监听做无感知增量触发，低频定时扫描做查漏补缺，后台手动扫描作为兜底。
- **D-05:** 文件监听和定时扫描都必须是轻量操作，默认走增量检测；不应频繁全量扫描或反复对未变化文件执行 `ffprobe`。

#### 候选审核流程
- **D-06:** 候选审核页面采用两层视图：默认按候选歌曲分组，展开后查看原始文件列表、扫描推断和媒体探测结果。
- **D-07:** 审核阶段必须允许管理员修正完整元数据，包括歌名、歌手、语种、原唱 / 伴唱角色、默认资源、是否同一版本族、流派、标签、年份、别名和 `searchHints`。
- **D-08:** `搁置` 表示暂不处理但保留候选。文件留在 `imports/needs-review`，候选状态为 `held`，之后仍可继续编辑和入库。
- **D-09:** `拒绝` 表示直接删除对应文件，不移动到 `imports/rejected`。由于这是不可逆危险操作，后台必须提供明确二次确认。

#### 正式入库准入规则
- **D-10:** Phase 2 的正式歌库主路径必须严格要求原唱 / 伴唱成对资源；只有单个可播放资源的歌曲不得正式入库，只能作为候选搁置。
- **D-11:** 原唱 / 伴唱资源都存在但无法证明同版本、同时轴时，进入 `review-required`，不得正式入库。
- **D-12:** 正式入库的双资源时长差必须 `<=300ms`。时长差 `>300ms` 一律不能正式入库，即使人工确认也不能转为 `verified`。
- **D-13:** `300ms-1s` 的资源对可以保留为 `review-required` 候选，但不允许进入正式主路径。
- **D-14:** 正式入库后，默认播放资源为伴唱版；原唱版作为播放中切换目标。
- **D-15:** 这些 Phase 2 决策比架构文档中“第一版允许资源不完整”的一般建议更严格。下游规划应以本 CONTEXT 对正式主路径的约束为准。

#### 歌库后台最小界面
- **D-16:** Phase 2 后台首页优先是导入审核工作台，直接展示待扫描、待审核、搁置和 `review-required` 的候选队列。
- **D-17:** 正式歌库维护页必须支持歌曲与资源核心维护：完整歌曲元数据、默认资源、资源状态、`switchFamily`、`vocalMode` 等。
- **D-18:** Phase 2 后台不做登录和账号体系，默认只在内网 / 受控部署环境访问；后台入口不应暴露到公网。
- **D-19:** 普通编辑可以直接保存；删除文件、修改配对关系、禁用 `ready` 资源等危险操作必须二次确认。

### Claude's Discretion
- 具体文件监听实现、低频扫描间隔、去抖策略和扫描任务并发限制由后续 research / planning 决定，但必须保持轻量和增量。
- 具体后台页面布局、表格字段密度、状态标签文案和确认弹窗样式由后续 UI 设计与实现决定，但必须优先服务导入审核工作流。
- 具体候选状态命名可以由 planner 统一，但必须表达 pending / held / review-required / approved / rejected-delete 等语义。

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 2 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIBR-01 | 管理员可以扫描配置好的本地歌库和导入目录，并生成待处理的候选入库结果 | Incremental watcher + scheduled + manual scan pattern; import scan tables; ffprobe probe cache. |
| LIBR-02 | 管理员可以审核候选导入项，确认歌手、歌名、语种、原唱/伴唱等元数据，并对每项执行入库、搁置或拒绝 | Candidate state machine; grouped review workbench; write APIs for approve, hold, reject-delete. |
| LIBR-04 | 只有同时具备已验证原唱版与伴唱版、且正式资源状态为 `ready` 的歌曲才会进入正式歌库主路径 | Admission service and partial unique switch-pair guard. |
| LIBR-05 | 管理员可以在入库后修改歌曲、歌手、默认资源和资源可用状态 | Catalog maintenance repositories and admin UI details page. |
| LIBR-06 | 系统可以校验原唱版与伴唱版是否满足同版本、同时轴的正式入库规则，并将不合格资源标记为 `review-required` 或拒绝入库 | `<=300ms` verified rule, 300ms-1s review-required rule, bad/missing probe rejection flow. |
| ADMN-01 | 管理员可以在后台浏览歌曲和资源，并查看歌词模式、原唱/伴唱模式、资源状态等维护信息 | New `apps/admin` with Imports-first dashboard and Songs/resources maintenance views. |
</phase_requirements>

## Summary

Phase 2 should be planned as a catalog trust boundary, not just a file scanner. The scanner may infer metadata, but the formal catalog must only be written through an admission service that verifies original/instrumental pairing, duration delta, `switchFamily`, resource status, and `song.json` consistency before anything becomes visible to downstream search/queue flows.

The existing code already has the critical runtime contract: `buildSwitchTarget` only works with `status = 'ready'`, `switch_quality_status = 'verified'`, same `song_id`, same `switch_family`, and exactly one opposite `vocal_mode`. Phase 2 must make that contract true by construction through migrations, repositories, and admin flows. It should not expect TV playback code to compensate for weak catalog data.

**Primary recommendation:** build an in-process incremental ingest pipeline plus an admin workbench, backed by explicit `import_*` tables and a single `CatalogAdmissionService` that owns file promotion, `song.json` generation, DB writes, and switch-pair eligibility.

## Project Constraints (from AGENTS.md)

- First release prioritizes stable singing over feature breadth.
- Phone is the only control surface; TV stays playback/status only.
- Playback state is server-authoritative.
- Software does not handle realtime microphone DSP.
- Local library is primary; online supplement is secondary and must not become the main dependency.
- First-version online songs must be cached before playback.
- Data model keeps `room` even while v1 has one room.
- Chinese search must eventually cover title, artist, pinyin, initials, aliases, and simplified/traditional variants.
- Expected deployment: business/task runtime on `lxc-dev`, media library/cache on `lxc-nas`.
- Online provider compliance remains a later implementation decision.
- GSD workflow requires planning artifacts before direct implementation edits.
- No `CLAUDE.md` exists in this repo at research time.

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| TypeScript | 6.0.3 | Shared domain, API, scanner, and admin types | Already installed at repo root; prevents drift between catalog and playback contracts. |
| Fastify | 5.8.5 | Admin/catalog HTTP routes | Existing API server uses Fastify route modules and typed repositories. |
| `pg` | 8.20.0 | PostgreSQL access | Existing code uses handwritten SQL through `QueryExecutor`, not an ORM. |
| PostgreSQL | Existing target | Catalog, assets, import candidates, scan runs | Existing schema is relational and already stores playback/catalog state. |
| FFmpeg / `ffprobe` | 8.1 installed locally | Media metadata probe and validation | Official tool for stream/container inspection; available in this environment. |
| React | 19.2.5 | Admin frontend UI | Matches existing `apps/tv-player` frontend stack. |
| Vite | 8.0.10 | Admin app build/dev | Matches existing frontend build pattern. |
| Vitest | 4.1.5 | Unit tests for admission, scanner, repositories, routes | Existing API test runner. |
| Chokidar | 5.0.0 | Incremental file watching | Current release is ESM-only, Node >=20, normalizes raw watcher events and supports `awaitWriteFinish`, `atomic`, filtering, and recursion limits. |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `@tanstack/react-query` | 5.100.6 | Admin server-state fetching/mutation invalidation | Use in `apps/admin` for candidate queues and song/resource maintenance. |
| `@tanstack/react-router` | 1.168.26 | Admin routes/search params | Use if the admin app has shareable Imports/Songs/detail URLs; otherwise keep a small internal tab state for this phase. |
| Node `child_process.execFile` | Node 25.8.0 runtime | Run `ffprobe` safely without a shell | Use with fixed args, timeout, maxBuffer, and parsed JSON stdout. |
| Node `fs/promises` | Node 25.8.0 runtime | Move/delete files and write `song.json` | Use for deterministic filesystem operations under configured media root. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chokidar | Raw `fs.watch` | Node docs state `fs.watch` is inconsistent and can be unreliable on network/virtualized filesystems. Use Chokidar for events, plus scheduled/manual reconciliation for correctness. |
| In-process scanner | BullMQ/Redis worker | The architecture says first version should not introduce worker infrastructure until needed. Keep scanner services separable but run inside API for Phase 2. |
| Handwritten SQL repositories | Drizzle ORM | Existing Phase 1 decision explicitly avoided an ORM. Stay with SQL migrations + typed repository interfaces. |
| React/Vite admin app | Embedding admin in TV app | Admin is a separate operator surface and should not pollute TV playback concerns. |
| Moving rejected files to `/imports/rejected` | Direct delete | Context locks direct deletion with confirmation; planning must include delete failure handling instead of rejected-folder movement. |

**Installation:**

```bash
pnpm add -F @home-ktv/api chokidar
pnpm add -F @home-ktv/admin react@19.2.5 react-dom@19.2.5 @tanstack/react-query@5.100.6
pnpm add -D -F @home-ktv/admin @vitejs/plugin-react@6.0.1 vite@8.0.10 vitest@4.1.5 typescript@6.0.3
```

Add `@tanstack/react-router@1.168.26` only if route-level URLs are part of the plan.

**Version verification:** npm registry checks on 2026-04-30:

| Package | Verified Version | Registry Modified |
|---------|------------------|-------------------|
| `chokidar` | 5.0.0 | 2025-11-25 |
| `fastify` | 5.8.5 | 2026-04-14 |
| `pg` | 8.20.0 | 2026-03-04 |
| `react` | 19.2.5 | 2026-04-28 |
| `vite` | 8.0.10 | 2026-04-23 |
| `vitest` | 4.1.5 | 2026-04-23 |
| `tsx` | 4.21.0 | 2025-11-30 |
| `@vitejs/plugin-react` | 6.0.1 | 2026-03-13 |
| `@tanstack/react-query` | 5.100.6 | 2026-04-28 |
| `@tanstack/react-router` | 1.168.26 | 2026-04-29 |

## Architecture Patterns

### Recommended Project Structure

```text
apps/
├── api/src/
│   ├── db/migrations/0002_library_ingest_admin.sql
│   ├── modules/ingest/
│   │   ├── import-scanner.ts
│   │   ├── media-probe.ts
│   │   ├── candidate-builder.ts
│   │   ├── scan-scheduler.ts
│   │   └── repositories/
│   ├── modules/catalog/
│   │   ├── admission-service.ts
│   │   ├── repositories/song-repository.ts
│   │   └── repositories/asset-repository.ts
│   └── routes/
│       ├── admin-imports.ts
│       └── admin-catalog.ts
└── admin/
    ├── package.json
    ├── src/api/
    ├── src/imports/
    ├── src/songs/
    └── src/App.tsx
packages/
└── domain/src/index.ts
```

### Pattern 1: Import Tables Separate From Formal Catalog

**What:** Add a migration with import-specific tables instead of inserting messy candidates into `songs`/`assets`.

Recommended tables:

| Table | Purpose |
|-------|---------|
| `import_scan_runs` | Manual/scheduled/watcher scan attempts with status, trigger, counters, started/finished timestamps. |
| `import_files` | One row per discovered file with root kind, relative path, size, mtime, quick hash/checksum, probe status, probe payload, last scanned timestamp. |
| `import_candidates` | Grouped candidate song-level work item with editable metadata, status, review notes, conflict target fields. |
| `import_candidate_files` | Candidate-to-file rows with proposed `vocal_mode`, probe summary, role confidence, and selected/not-selected flag. |
| `source_records` | Source lifecycle for approved assets; local scanner becomes one provider. |
| `artist_aliases` / `song_aliases` | Optional Phase 2 schema groundwork for later search, if planners can fit it without expanding UI scope. |

**When to use:** Always for Phase 2. It protects the formal catalog from half-known files and gives the admin UI a stable work queue.

### Pattern 2: All Scan Triggers Enqueue the Same Scan Intent

**What:** Watcher, low-frequency schedule, and manual scan should create the same lightweight scan intent. The scanner compares `(relative_path, size, mtime_ms, quick_hash)` before deciding to run `ffprobe`.

**When to use:** This is required by D-04 and D-05.

**Example:**

```typescript
// Source: Chokidar README and Node fs.watch caveats
const watcher = chokidar.watch([importsPending, importsNeedsReview, songsRoot], {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 },
  atomic: true,
  depth: 5,
  ignored: (path, stats) => Boolean(stats?.isFile()) && !isSupportedMediaOrSongJson(path)
});

watcher.on("add", (path) => scanQueue.enqueue({ trigger: "watcher", path }));
watcher.on("change", (path) => scanQueue.enqueue({ trigger: "watcher", path }));
watcher.on("unlink", (path) => scanQueue.enqueue({ trigger: "watcher", path, deleted: true }));
```

### Pattern 3: Probe Once, Cache Probe Result

**What:** Run `ffprobe` only for files not seen before or files whose identity changed. Store the parsed duration, codec, stream summary, probe status, and raw JSON in `import_files`.

**When to use:** Every candidate file before review; formal `/songs` scans only revalidate existence and changed files.

### Pattern 4: Admission Service Owns Formal Writes

**What:** One service should perform approval decisions, target directory planning, conflict generation, file moves, `song.json` writes, `songs`/`assets` inserts, and candidate status changes.

**When to use:** Any action that creates or modifies formal catalog entries.

Admission rules:

| Condition | Formal Result |
|-----------|---------------|
| Exactly one original + one instrumental, same version family, both probeable, duration delta `<=300ms` | Approve to `/songs/...`, create two `ready` assets with same `switchFamily`, `switch_quality_status = 'verified'`, default asset = instrumental. |
| Original + instrumental exist, but version/timeline cannot be proven | Keep candidate `review-required`; do not create formal `ready` assets. |
| Duration delta `301ms-1000ms` | Keep candidate `review-required`; cannot be manually upgraded to `verified`. |
| Duration delta `>1000ms`, unprobeable, corrupt, non-KTV content | Reject path or require explicit reject-delete confirmation, depending on confidence. |
| Single playable resource | Keep candidate `held` or `pending`; never formal in Phase 2. |

### Pattern 5: Narrow Database Guard for Verified Pairs

**What:** Add a partial unique index that prevents multiple verified ready assets with the same `(song_id, switch_family, vocal_mode)`.

**When to use:** In migration `0002`, after reviewing existing data. This does not ban multiple versions; it only protects the exact switch family that playback relies on.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS assets_verified_switch_family_mode_uq
ON assets(song_id, switch_family, vocal_mode)
WHERE switch_family IS NOT NULL
  AND status = 'ready'
  AND switch_quality_status = 'verified';
```

### Anti-Patterns to Avoid

- **Directly inserting scanned files into `assets`:** This pollutes playback-visible catalog state with unreviewed media.
- **Using filename parsing as truth:** Architecture says file names are candidates only; `song.json` and admin-corrected metadata are authoritative.
- **Full rescans as normal operation:** NAS/LXC environment requires lightweight incremental detection.
- **Separate scanner/admission rule copies:** One admission service should be used by approval and later formal maintenance.
- **Letting admin disable one `ready` asset in a verified pair without re-evaluating the pair:** This would break Phase 1 switch assumptions.
- **Writing `song.json` after DB commit without failure state:** Filesystem and DB are not atomic together; plans need explicit rollback or repair states.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform recursive watcher semantics | Raw `fs.watch` event normalizer | Chokidar + scheduled/manual reconciliation | Node documents platform and network filesystem caveats; Chokidar handles common add/change/unlink normalization. |
| Media duration/codec extraction | Manual MP4 parsing | `ffprobe -print_format json -show_format -show_streams` | Containers/streams are complex; official `ffprobe` already emits machine-readable metadata. |
| Async job infrastructure | Redis/BullMQ in Phase 2 | In-process scan queue with persistence in PostgreSQL | Architecture explicitly keeps Redis/worker out until workload proves need. |
| Formal switch eligibility scattered across routes | Per-route ad hoc checks | `CatalogAdmissionService.evaluatePair()` | Phase 1 playback expects strict `ready` + `verified` + same-family pairs. |
| Server state caching in admin UI | Custom `useEffect` cache/invalidation | TanStack Query for candidate/song lists | Candidate and maintenance UIs are remote, mutable server state. |

**Key insight:** The deceptive complexity is not scanning files; it is preventing uncertain files from becoming playback-visible facts. Treat import candidates as a separate workflow until a single admission service promotes them.

## Common Pitfalls

### Pitfall 1: Formal Catalog Visibility Too Early
**What goes wrong:** Candidates appear in later search/queue paths before strict pair admission.
**Why it happens:** Reusing `songs`/`assets` as staging tables.
**How to avoid:** Store candidates in `import_*` tables. Only admission writes formal `songs`/`assets`.
**Warning signs:** `assets.status = 'ready'` appears before approval, or `switch_quality_status = 'verified'` is manually editable in the UI.

### Pitfall 2: Chokidar Watch Scope Too Broad
**What goes wrong:** Too many watchers, high CPU, file-handle errors, or repeated large-file events.
**Why it happens:** Watching the whole NAS tree without depth/filtering.
**How to avoid:** Watch `/imports/pending`, `/imports/needs-review`, and `/songs` with filters, `awaitWriteFinish`, bounded depth, and scheduled reconciliation.
**Warning signs:** Frequent probe runs for unchanged files; `EMFILE`/`ENOSPC`; watcher latency spikes.

### Pitfall 3: Non-Atomic File Promotion
**What goes wrong:** Files move but DB commit fails, or DB rows point at files that were not moved.
**Why it happens:** Filesystem and PostgreSQL transactions cannot be one atomic transaction.
**How to avoid:** Plan moves first, perform file operations before formal DB commit when possible, write repair/error status on failure, and make approval idempotent.
**Warning signs:** Candidate status is `approved` but `/songs/.../song.json` or asset files are missing.

### Pitfall 4: Review-Required Means Formal But Disabled
**What goes wrong:** Review-required assets leak into formal catalog and confuse admin/search/playback code.
**Why it happens:** Treating `review_required` as an `assets.switch_quality_status` on otherwise formal ready assets.
**How to avoid:** In Phase 2, keep near-miss resources as import candidates unless and until they pass strict admission. Existing `switch_quality_status = 'review_required'` can support future formal maintenance but should not drive Phase 2 formal visibility.
**Warning signs:** `buildSwitchTarget` returns null for songs that look approved in admin.

### Pitfall 5: Dangerous Admin Mutations Without Pair Re-Evaluation
**What goes wrong:** Admin changes `vocalMode`, `switchFamily`, default asset, or ready status and silently breaks switching.
**Why it happens:** CRUD endpoints update columns directly.
**How to avoid:** Route all asset-pair mutations through admission/revalidation logic; use confirmation for dangerous edits.
**Warning signs:** Direct `UPDATE assets SET status = ...` route handlers.

## Code Examples

### Media Probe Wrapper

```typescript
// Source: Node child_process docs; FFprobe docs
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function probeMedia(filePath: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath
    ],
    { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }
  );

  return JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; duration?: string; width?: number; height?: number }>;
  };
}
```

### Admission Rule

```typescript
export function evaluateSwitchPair(input: {
  originalDurationMs: number | null;
  instrumentalDurationMs: number | null;
  sameVersionConfirmed: boolean;
}) {
  if (input.originalDurationMs === null || input.instrumentalDurationMs === null) {
    return { status: "review-required" as const, reason: "missing-duration" };
  }

  const deltaMs = Math.abs(input.originalDurationMs - input.instrumentalDurationMs);
  if (deltaMs <= 300 && input.sameVersionConfirmed) {
    return { status: "verified" as const, durationDeltaMs: deltaMs };
  }

  if (deltaMs <= 1000) {
    return { status: "review-required" as const, reason: "duration-delta-over-300ms", durationDeltaMs: deltaMs };
  }

  return { status: "rejected" as const, reason: "duration-delta-over-1000ms", durationDeltaMs: deltaMs };
}
```

### Repository Pattern

```typescript
export interface ImportCandidateRepository {
  listByStatus(statuses: readonly ImportCandidateStatus[]): Promise<ImportCandidate[]>;
  saveMetadata(input: SaveCandidateMetadataInput): Promise<ImportCandidate>;
  markHeld(candidateId: string, note: string | null): Promise<ImportCandidate>;
  markRejectedDeleted(input: RejectDeletedInput): Promise<ImportCandidate>;
}

export class PgImportCandidateRepository implements ImportCandidateRepository {
  constructor(private readonly db: QueryExecutor) {}

  async listByStatus(statuses: readonly ImportCandidateStatus[]) {
    const result = await this.db.query<ImportCandidateRow>(
      `SELECT id, status, title, artist_name, language, candidate_meta, created_at, updated_at
       FROM import_candidates
       WHERE status = ANY($1::text[])
       ORDER BY updated_at DESC`,
      [statuses]
    );

    return result.rows.map(mapImportCandidateRow);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed / Verified | Impact |
|--------------|------------------|-------------------------|--------|
| Raw `fs.watch` only | Chokidar watcher plus scheduled/manual reconciliation | Chokidar v5 release verified 2025-11; Node fs.watch caveats current docs | More predictable events, but still do not trust watcher as sole source of truth on NAS/virtualized filesystems. |
| Filename-driven catalog | `song.json` + admin-corrected metadata + probe cache | Project architecture and Phase 2 context | File names seed candidates only. |
| Single-resource formal library | Strict paired original/instrumental formal library | Phase 2 context supersedes architecture general guidance | Plans must keep single assets out of formal catalog. |
| Runtime switching compensates for catalog uncertainty | Catalog admission proves same-version/same-timeline resources before playback | Phase 1 implementation and Phase 2 decisions | TV remains simple and backend-authorized. |
| Manual DB/file maintenance | Admin workbench with explicit state transitions | Phase 2 requirements | Reduces direct DB edits and irreversible file mistakes. |

**Deprecated/outdated for this phase:**
- Architecture note allowing incomplete single-resource formal songs: superseded by D-10 through D-15.
- `/imports/rejected` as the rejected path: superseded by D-09 direct delete with confirmation.
- Adding Redis/BullMQ upfront for scans: unnecessary until import throughput proves the in-process queue insufficient.

## Open Questions

1. **Exact library root configuration**
   - What we know: existing API has `MEDIA_ROOT`; architecture expects `/ktv-library/songs` and `/ktv-library/imports`.
   - What's unclear: whether to add `LIBRARY_ROOT`, `IMPORTS_ROOT`, and `SONGS_ROOT`, or derive all from `MEDIA_ROOT`.
   - Recommendation: derive from `MEDIA_ROOT` for Phase 2 unless deployment needs multiple mounts.

2. **How to handle existing formal files without `song.json`**
   - What we know: D-03 says formal `/songs` uses `song.json` as truth.
   - What's unclear: whether any real files already exist in `/songs`.
   - Recommendation: formal scan creates `review-required` consistency findings, not formal DB rows, when `song.json` is missing.

3. **Admin routing depth**
   - What we know: Phase 2 needs Imports workbench and Songs/resources maintenance.
   - What's unclear: whether shareable deep links are required.
   - Recommendation: start with `apps/admin` and simple routes/tabs; add TanStack Router only if plans include URL-addressable detail pages.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | API, scanner, admin build | ✓ | v25.8.0 | Use existing runtime. |
| pnpm | Workspace installs/scripts | ✓ | 10.33.2 | None needed. |
| npm registry access | Version verification/package install | ✓ | npm 11.11.0 | Use lockfile versions if offline. |
| ffprobe | Media probing | ✓ | 8.1 | Missing would block real media scan; mock in unit tests only. |
| ffmpeg | Future thumbnail/normalization support | ✓ | 8.1 | Not required for Phase 2 core if only probing. |
| PostgreSQL CLI/server | Migration/integration validation | ✗ | `psql`/`pg_isready` not found | Unit-test repositories with fake `QueryExecutor`; planner should include a DB-backed validation step where PostgreSQL is available. |
| Chokidar package | File watcher | ✗ | Not installed yet | Add dependency in Plan 02-01. |

**Missing dependencies with no fallback:**
- `ffprobe` would block real scan/probe in deployment, but it is available locally.

**Missing dependencies with fallback:**
- PostgreSQL CLI/server is not available in this shell. Use unit tests locally and require DB-backed migration smoke tests in the implementation environment.
- Chokidar is not installed yet. This is a planned dependency addition, not a blocker.

## Practical Verification Notes

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`, so the formal `## Validation Architecture` section is intentionally omitted.

Recommended plan-level verification:

| Area | Command / Check |
|------|-----------------|
| Typecheck all workspaces | `pnpm typecheck` |
| API tests | `pnpm -F @home-ktv/api test` |
| Admin tests/build after app creation | `pnpm -F @home-ktv/admin test` and `pnpm -F @home-ktv/admin build` |
| Admission unit tests | `vitest run src/test/catalog-admission.test.ts` from `apps/api` |
| Scanner unit tests | fake filesystem/probe wrapper; verify unchanged files skip `ffprobe` |
| Route tests | Fastify `createServer()` injection for admin candidate actions |
| DB migration smoke | run migration against a disposable PostgreSQL database when available |

Wave 0 gaps for planners:

- [ ] Add tests for admission thresholds: `<=300ms`, `301-1000ms`, `>1000ms`, single asset, missing duration.
- [ ] Add scanner tests for incremental skip, watcher enqueue, manual scan enqueue, and formal `/songs` `song.json` consistency findings.
- [ ] Add route tests for approve, hold, reject-delete confirmation, and dangerous maintenance confirmation.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/02-library-ingest-catalog-admin/02-CONTEXT.md` - locked Phase 2 decisions and strict admission constraints.
- `.planning/REQUIREMENTS.md` - LIBR-01, LIBR-02, LIBR-04, LIBR-05, LIBR-06, ADMN-01.
- `.planning/ROADMAP.md` - Phase 2 plan split and success criteria.
- `.planning/STATE.md` - Phase 1 decisions and current blockers.
- `docs/KTV-ARCHITECTURE.md` - local library layout, `song.json`, scanner strategy, switch strategy, DB/admin guidance.
- `packages/domain/src/index.ts` - current `Song`, `Asset`, `VocalMode`, `AssetStatus`, `SwitchQualityStatus`.
- `apps/api/src/db/migrations/0001_media_contract.sql` and `apps/api/src/db/schema.ts` - existing schema and row types.
- `apps/api/src/modules/catalog/repositories/song-repository.ts` and `asset-repository.ts` - existing repository style and switch counterpart query.
- Node.js docs: https://nodejs.org/api/fs.html#fswatchfilename-options-listener and https://nodejs.org/api/child_process.html - watcher caveats and `execFile`.
- Chokidar README: https://github.com/paulmillr/chokidar - watcher options, v5 Node requirement, event semantics.
- FFprobe docs: https://ffmpeg.org/ffprobe.html - media probing and JSON output.
- PostgreSQL JSON docs: https://www.postgresql.org/docs/current/datatype-json.html - `jsonb` tradeoffs.
- Fastify routes docs: https://fastify.dev/docs/latest/Reference/Routes/ - route/schema/async handler patterns.
- TanStack Query docs: https://tanstack.com/query/latest/docs/framework/react/overview - admin server-state rationale.
- TanStack Router docs: https://tanstack.com/router/latest/docs/overview - type-safe routing and search params.
- npm registry metadata checked with `npm view` on 2026-04-30 for recommended packages.

### Secondary (MEDIUM confidence)
- None needed; critical findings were verified against repo context, official docs, or registry metadata.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions verified from installed package files and npm registry; external tools probed locally.
- Architecture: HIGH - derived from locked context, canonical architecture, and Phase 1 code contracts.
- Pitfalls: HIGH - tied to documented watcher/filesystem caveats and existing playback switch assumptions.

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 for repo architecture; 2026-05-07 for package latest-version claims.
