# Project Research Summary

**Project:** 家庭包厢式 KTV 系统
**Domain:** Single-room home living-room KTV system
**Researched:** 2026-04-28
**Confidence:** HIGH

## Executive Summary

This project should be built as a local-first, single-room home KTV product whose primary job is to make the singing loop stable: join from a phone, find a song quickly, manage the queue, and keep the TV playing the right asset without drift. Research across current home karaoke products, self-hosted/open-source systems, and the project’s own architecture note all point to the same conclusion: the TV must stay playback-only, the phone must own the user interaction surface, and the server must own room/session truth.

The recommended architecture is a modular monolith with explicit boundaries around `Session Engine`, `Catalog/Search`, `Media Pipeline`, `Asset Gateway`, and thin device clients. This structure is not about premature purity; it is the smallest shape that prevents the real failure modes in this domain: queue drift, dirty media entering the playable library, provider-specific playback bugs, and operational dead ends when imports or cache jobs fail.

Research also reinforces the project’s existing scoping instincts. Local library management, Chinese-first search, queue operations, QR entry, TV playback reliability, and admin repair tools are core launch scope. Features often marketed as “complete karaoke” capabilities such as scoring, recording, runtime DSP, direct online playback, and multi-room support should be deferred until the baseline loop is boringly reliable.

## Key Findings

### Recommended Stack

The current best-fit stack stays close to the project’s draft technical direction: Node.js + TypeScript across the backend and workers, React + Vite for TV/mobile/admin frontends, Fastify for API and realtime ingress, PostgreSQL for durable domain state, Redis + BullMQ for room hot-state and jobs, and FFmpeg/ffprobe in the worker for media validation. This is a pragmatic stack for one codebase with several runtimes and strong shared contracts.

**Core technologies:**
- Node.js 24.15.0 LTS: backend runtime for API and worker
- React 19.2.5 + Vite 8.0.10: browser-first stack for TV, mobile, and admin
- Fastify 5.8.5: HTTP/WebSocket entry point for commands, queries, pairing, and player telemetry
- PostgreSQL 18.3: durable catalog/session/event store
- Redis 8.6.2 + BullMQ 5.76.2: hot room cache, heartbeats, and async asset-readiness jobs

### Expected Features

Current market/product research and the supplied architecture note agree on the launch essentials: phone-first room entry and control, Chinese-first song discovery, authoritative queue management, stable TV playback with current/next/QR display, local-first song library management, and online supplementation only through a cache-before-play flow.

**Must have (table stakes):**
- 手机扫码入场与房间连接 — users expect to join and control the room from the phone
- 中文优先搜索 — title, singer, pinyin, initials, aliases, and language filtering
- 已点队列管理 — add, remove, top, skip, and clear visibility into current/next songs
- TV 全屏播放与状态展示 — playback-only screen with join affordance and reconnect-safe rendering
- 稳定播放与失败恢复 — preloading, reconnect recovery, and alternate-asset/next-song fallback
- 本地歌库为主、在线补歌为辅 — online sources must resolve into managed assets before playback

**Should have (competitive but deferrable):**
- Artist/language/hotlist shortcuts and history/favorites
- Fair-queue or guest/admin control refinements
- Visual atmosphere or party-mode embellishments

**Defer (v2+):**
- 评分、录音、Battle/派对玩法
- 运行时升降调和播放中原/伴唱无缝切换
- 多房间、复杂权限或账号体系
- 直连在线播放、软件 DSP、AI 人声处理

### Architecture Approach

The architecture should separate the control loop from the media loop while keeping both anchored to one canonical domain model. `Session Engine` owns queue/playback truth, `Catalog/Search` owns discovery and dedupe, `Media Pipeline` owns ingest/cache/verification, and the TV player acts as an executor that pulls managed media and pushes telemetry.

**Major components:**
1. `API + Realtime Gateway` — pairing, command ingress, query endpoints, websocket fanout
2. `Session Engine` — authoritative room state, versioned transitions, fallback decisions
3. `Catalog/Search` — canonical `Song` model, aliases/pinyin, local-vs-online result grouping
4. `Media Pipeline Worker` — scans, probes, import review, online caching, asset verification
5. `Asset Gateway` — controlled static playback URLs for local and cached media
6. `TV Player` / `Mobile Controller` / `Admin UI` — thin clients with distinct responsibilities

### Critical Pitfalls

1. **Treating online songs as a primary playback path** — avoid by making local assets the main path and requiring cache-before-play for online additions
2. **Skipping a canonical `Song` / `Asset` / `SourceRecord` model** — avoid by freezing the domain contract early
3. **Allowing dirty media straight into the playable library** — avoid by separating raw import from approved catalog entry
4. **Letting phones or the TV bypass one server-side session engine** — avoid by keeping queue/playback state versioned and authoritative on the server
5. **Deferring admin/recovery tooling too far** — avoid by shipping minimal import, cache, device, and playback repair surfaces in the MVP roadmap

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation and Media Contract
**Rationale:** Everything depends on a stable `Song` / `Asset` / `Room` / `PlaybackSession` model plus controlled asset URLs.
**Delivers:** Monorepo skeleton, shared domain/protocol packages, asset gateway, database schema baseline.
**Addresses:** Canonical modeling, local-first boundaries, no-runtime-DSP rule.
**Avoids:** Rewrites caused by filename-centric or provider-centric modeling.

### Phase 2: Local Library Ingest and Catalog Operations
**Rationale:** The local library is the primary content path; it must become trustworthy before UX layering.
**Delivers:** Scan/import pipeline, metadata normalization, review-required states, song/asset maintenance surfaces.
**Uses:** FFmpeg/ffprobe, PostgreSQL, worker jobs, admin repair flows.
**Implements:** Media pipeline, catalog write model, import review basics.

### Phase 3: Session Engine, Pairing, and TV Playback Core
**Rationale:** KTV success depends more on consistent room state than on broad feature count.
**Delivers:** Room session reducer, QR entry, controller sessions, TV sync, playback telemetry, reconnect recovery.
**Addresses:** Server-authoritative queue/playback truth and single active TV ownership.
**Avoids:** Mobile/TV drift and silent player conflicts.

### Phase 4: Mobile Control and Search Experience
**Rationale:** Once the room loop and TV runtime are deterministic, the mobile controller can safely sit on top of them.
**Delivers:** Phone join flow, Chinese-first search, queue operations, current/next views, version/variant selection before queueing.
**Uses:** Search read model, shared protocol contracts, TanStack Query/Router or equivalent.
**Implements:** User-facing singing flow from scan to queue control.

### Phase 5: Online Supplementation and Operator Hardening
**Rationale:** Online support and ops tooling should layer onto a proven local-first core, not define it.
**Delivers:** Online candidate search, cache-before-play jobs, provider kill-switches, failure handling, richer admin repair/observability.
**Addresses:** Missing-song recovery without compromising playback stability.
**Avoids:** Direct online playback and unmaintainable provider coupling.

### Phase Ordering Rationale

- The domain contract must precede ingest, and ingest must precede dependable search.
- Local library trust must precede online supplementation, otherwise the system optimizes the least stable content path first.
- The session engine and TV playback loop must stabilize before expanding mobile UX, because queue/search polish cannot compensate for room-state drift.
- Admin repair tooling must be present before the project depends on messy real-world media and online providers.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Media normalization policy, codec contract, `song.json` evolution, duplicate merge rules
- **Phase 3:** TV runtime/autoplay constraints on the actual deployment target and reconnect semantics
- **Phase 5:** Provider compliance boundaries, cache lifecycle, and alternate-asset ranking

Phases with standard patterns (lower research burden):
- **Phase 1:** Monorepo/package structure and shared schema setup
- **Phase 4:** Mobile query/mutation flows on top of an already-defined protocol surface

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified from current package metadata and official release sources |
| Features | HIGH | Strong agreement between official product docs and the supplied architecture note |
| Architecture | MEDIUM | Boundary choices are opinionated, but they align with the product constraints and common system shapes |
| Pitfalls | MEDIUM | Domain-specific failure modes are clear, though exact operational pain will depend on real media/provider behavior |

**Overall confidence:** HIGH

### Gaps to Address

- Exact TV runtime profile still needs confirmation on the real target device/browser stack
- Final codec/container normalization policy should be locked before large-scale ingest
- Online provider scope and compliance rules need explicit implementation-time review

## Sources

### Primary (HIGH confidence)
- [PROJECT.md](../PROJECT.md)
- [KTV-ARCHITECTURE.md](../../docs/KTV-ARCHITECTURE.md)
- [STACK.md](./STACK.md)
- [FEATURES.md](./FEATURES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PITFALLS.md](./PITFALLS.md)
- Official Node distribution index
- Official PostgreSQL docs: https://www.postgresql.org/docs/current/
- Official Redis releases: https://github.com/redis/redis/releases
- Official Caddy releases: https://github.com/caddyserver/caddy/releases

### Secondary (MEDIUM confidence)
- KaraFun features and remote-control docs: https://www.karafun.com/features/ , https://www.karafun.com/help/general-questions-iphone_454.html
- Singing Machine support docs: https://support.singingmachine.com/
- Duochang K88 manual: https://help.duochang.cc/Application/Admin/View/Instruction/product/K88.html
- PiKaraoke repository: https://github.com/vicwomg/pikaraoke
- Karaoke Eternal repository: https://github.com/bhj/KaraokeEternal

### Tertiary (LOW confidence)
- None used for roadmap-critical recommendations

---
*Research completed: 2026-04-28*
*Ready for roadmap: yes*
