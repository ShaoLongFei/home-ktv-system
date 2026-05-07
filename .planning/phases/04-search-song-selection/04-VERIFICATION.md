---
phase: 04-search-song-selection
verified: 2026-05-07T07:11:21Z
status: passed
score: 4/4 must-haves verified
human_verification:
  - test: "Mobile real-device search and version selection UAT"
    expected: "On a phone-width browser, search by Chinese/pinyin/initials, see local results above the disabled online placeholder, select a specific multi-version asset, and confirm duplicate queued adds without text overlap or enabled online queue controls."
    why_human: "Visual layout, touch ergonomics, and an end-to-end browser flow against real catalog data cannot be fully verified by static inspection and unit tests."
    result: passed
    verified_by_user: 2026-05-07T07:28:32.330Z
---

# Phase 4: Search & Song Selection Verification Report

**Phase Goal:** 让用户可以用中文优先的方式快速找到正确歌曲，并在多版本情况下选到想唱的那一版
**Verified:** 2026-05-07T07:11:21Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User can search queueable songs by Chinese title, artist, pinyin, initials, alias, and searchHints. | VERIFIED | `searchFormalSongs` normalizes query input and scores title, artist, alias, pinyin, initials, and search hints in `apps/api/src/modules/catalog/repositories/song-repository.ts:258-344`; normalization/pinyin helpers are in `apps/api/src/modules/catalog/search-normalization.ts:6-22`; mobile calls `/songs/search` from `apps/mobile-controller/src/api/client.ts:82-95`. |
| 2 | Search results distinguish local queueable songs from the disabled online placeholder. | VERIFIED | API serializes `local` results separately from `online: { status: "disabled" }` in `apps/api/src/routes/song-search.ts:40-55`; mobile renders local status and `在线补歌` disabled copy in `apps/mobile-controller/src/App.tsx:113-181`. |
| 3 | Multi-version selection queues a specific `assetId`, while vocal switching remains playback-time control. | VERIFIED | Search groups verified switch families into version options in `apps/api/src/modules/catalog/repositories/song-repository.ts:438-511`; UI sends selected `version.assetId` in `apps/mobile-controller/src/App.tsx:129-163`; command route and service pass/validate `assetId` in `apps/api/src/routes/control-commands.ts:29-58` and `apps/api/src/modules/playback/session-command-service.ts:355-397`; playback vocal switching remains the separate `switch-vocal-mode` command. |
| 4 | Import candidates, review_required/non-ready assets, online_ephemeral assets, and unverified switch families do not leak into mobile formal search. | VERIFIED | Search reads only `songs`/`assets`, requires `s.status = 'ready'`, `a.status = 'ready'`, `a.source_type <> 'online_ephemeral'`, `a.switch_quality_status = 'verified'`, non-null `switch_family`, and a ready verified non-ephemeral counterpart in `apps/api/src/modules/catalog/repositories/song-repository.ts:266-344`. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/domain/src/index.ts` | Shared search response/version contracts | VERIFIED | `SongSearchResponse`, `SongSearchLocalResult`, `SongSearchVersionOption`, queue state, and online placeholder exist at lines 110-150. |
| `apps/api/src/modules/catalog/search-normalization.ts` | Chinese normalization and pinyin helpers | VERIFIED | NFKC, OpenCC simplified conversion, lowercase/separator folding, pinyin, and initials are implemented. |
| `apps/api/src/modules/catalog/search-ranking.ts` | Explicit ranking buckets | VERIFIED | Scores match the planned D-02 order, `title_exact: 1000` through `default: 100`. |
| `apps/api/src/db/migrations/0005_catalog_search.sql` / `apps/api/src/db/schema.ts` | Search columns and indexes | VERIFIED | Migration adds `pg_trgm`, artist pinyin/initials, title/artist/pinyin/alias/hint indexes, and queueable asset partial index; schema mirrors row fields. |
| `apps/api/src/modules/catalog/repositories/song-repository.ts` | Formal search read model | VERIFIED | Implements queueable filtering, ranking, artist key backfill, queue state, and version grouping. |
| `apps/api/src/routes/song-search.ts` / `apps/api/src/server.ts` | Room-scoped search API wiring | VERIFIED | Route registered after available-songs; resolves room, queue state, and returns `SongSearchResponse`. |
| `apps/api/src/modules/playback/session-command-service.ts` | AssetId-aware queue command validation | VERIFIED | Selected asset must belong to the song, be ready, non-ephemeral, verified, and have a verified switch counterpart before append. |
| `apps/mobile-controller/src/api/client.ts`, `use-room-controller.ts`, `App.tsx`, `App.css` | Mobile search, debounce, inline version UI, duplicate confirmation | VERIFIED | Runtime loads empty search, debounces 250ms, immediate submit works, selected version add is exposed, and UI renders local/online/version states. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `admission-service.ts` | `search-normalization.ts` | `buildPinyinSearchKeys` | VERIFIED | Admission computes title and artist keys before song upsert. |
| `song-search.ts` | `song-repository.ts` | `dependencies.songs.searchFormalSongs` | VERIFIED | Route calls repository with query, limit, and queued song IDs. |
| `server.ts` | `song-search.ts` | `registerSongSearchRoutes` | VERIFIED | Registered with rooms, songs, and queue entry repositories. |
| `mobile client` | `/rooms/:roomSlug/songs/search` | `searchSongs` fetch | VERIFIED | Runtime uses `searchSongs` after session restore and on user input. |
| `mobile client` | `/commands/add-queue-entry` | selected `assetId` payload | VERIFIED | `addQueueEntry` includes `assetId` when selected. |
| `session-command-service.ts` | asset repository | selected asset/counterpart validation | VERIFIED | Queue append uses validated `selectedAsset.id`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `App.tsx` | `controller.songSearch.local` | `useRoomController.runSongSearch` -> `searchSongs` -> `/rooms/:roomSlug/songs/search` | Yes | FLOWING |
| `song-search.ts` | `records` | `dependencies.songs.searchFormalSongs({ query, limit, queuedSongIds })` | Yes | FLOWING |
| `song-repository.ts` | `SearchFormalSongRecord[]` | PostgreSQL SQL over `songs` and `assets` with ready/verified filters | Yes | FLOWING |
| `session-command-service.ts` | selected queue `assetId` | mobile payload -> route payload -> selected asset lookup/counterpart validation -> queue append | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| API search normalization, repository, route, and selected queue commands | `pnpm -F @home-ktv/api test -- catalog-search-normalization catalog-search-repository song-search-routes room-queue-commands` | 22 test files passed, 110 tests passed | PASS |
| Mobile search runtime/UI selection flow | `pnpm -F @home-ktv/mobile-controller test -- controller` | 1 test file passed, 21 tests passed | PASS |
| Workspace type safety | `pnpm typecheck` | 12 turbo tasks successful | PASS |
| Full build | Already-run supporting evidence from execution summaries: `pnpm build` passed | Not rerun during verification | PASS (supporting evidence) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| SRCH-01 | 04-01, 04-02, 04-03 | 用户可以按中文歌名关键词搜索可点歌曲 | SATISFIED | Normalized title search and mobile search endpoint/UI are wired. |
| SRCH-02 | 04-01, 04-02, 04-03 | 用户可以按歌手名搜索可点歌曲 | SATISFIED | Artist exact, artist pinyin, and artist initials search are implemented with backfill. |
| SRCH-03 | 04-01, 04-02, 04-03 | 用户可以按拼音全拼、拼音首字母、别名或预设 `searchHints` 搜索可点歌曲 | SATISFIED | Repository SQL includes title/artist pinyin, initials, aliases, and search hints; normalization tests cover pinyin/initial generation. |
| SRCH-04 | 04-01, 04-02, 04-03 | 搜索结果可以清楚区分本地可播歌曲与在线补歌候选 | SATISFIED | API and UI return/render local results separately from disabled online placeholder. |
| QUEU-02 | 04-02, 04-03 | 多版本时点歌前选择具体资源版本；原唱/伴唱切换通过播放中控制完成 | SATISFIED | Version rows carry `assetId`; enqueue validates and appends selected asset; vocal switching remains separate. |

No orphaned Phase 4 requirements found in `.planning/REQUIREMENTS.md`; all Phase 4 IDs appear in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `apps/mobile-controller/src/App.tsx` | 178 | `online-placeholder` | Info | Intentional Phase 4 disabled online supplement placeholder; no enabled queue/cache action is rendered. |
| Various touched files | n/a | Empty arrays/null handling | Info | Matches are initial state, fixture/default handling, or no-result compatibility paths; no user-visible stub blocks the phase goal. |

### Human Verification Completed

#### 1. Mobile Real-Device Search And Version Selection UAT

**Test:** On a phone-width browser connected to a real room/catalog, search by Chinese title, artist, pinyin, initials, alias/searchHint; choose each version of a multi-version song; confirm a duplicate add; verify the online placeholder remains disabled.
**Expected:** Local queueable songs appear above the online block, status/version labels are readable, selected version queues the intended asset, duplicate confirmation works, and no online candidate can be queued.
**Result:** Passed by user on 2026-05-07.
**Why human:** Static inspection and unit tests verify behavior and wiring, but visual layout, touch ergonomics, and real catalog data quality need browser UAT.

### Gaps Summary

No implementation gaps were found against the Phase 4 roadmap success criteria. Automated verification and human UAT passed.

---

_Verified: 2026-05-07T07:11:21Z_
_Verifier: Claude (gsd-verifier)_
