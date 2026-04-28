<!-- GSD:project-start source:PROJECT.md -->
## Project

**家庭包厢式 KTV 系统**

这是一个面向家庭客厅场景的单房间包厢式 KTV 系统。电视只负责全屏播放，手机是唯一控制端，系统通过中心服务端统一管理点歌、队列、播放状态和媒体资源。第一版重点不是做“最花哨的 KTV”，而是先把本地歌库为主、在线补歌为辅的稳定可唱体验做扎实。

**Core Value:** 在家庭单电视场景下，让用户用手机完成全部点歌与控制，并稳定地把歌唱起来。

### Constraints

- **Product scope**: 第一版必须优先验证“稳定可唱”而不是“功能最全” — 复杂增强能力要延后
- **Interaction model**: 手机必须是唯一控制端 — 电视端不承载搜索和复杂操作
- **Playback model**: 播放状态只能由服务端状态机裁决 — 防止手机端与电视端状态漂移
- **Audio chain**: 软件不承担实时人声 DSP — 由硬件完成混响、监听、EQ 和最终混音
- **Media source**: 歌曲来源采用“本地为主、在线补歌为辅” — 在线源不允许成为主依赖
- **Online playback**: 第一版在线歌曲必须先缓存再播放 — 提高稳定性并简化失败恢复
- **Room model**: 第一版虽然只有一个房间，但数据模型必须保留 `room` 概念 — 避免后续推倒重来
- **Search quality**: 中文搜索体验必须覆盖歌名、歌手、拼音、首字母、别名与繁简体 — 否则点歌体验不可接受
- **Deployment**: 预期运行在家庭服务器拓扑中，业务与任务在 `lxc-dev`，歌库与缓存位于 `lxc-nas`
- **Compliance**: 在线歌源接入需要遵守明确的合规边界 — 具体 provider 选择与策略要在实施前再确认
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 24.15.0 LTS | Backend runtime for API and worker processes | Current LTS line with mature ecosystem support; a good fit for one TypeScript codebase spanning API, worker, and tooling. |
| TypeScript | 5.9.2 | Shared type system across TV, mobile, API, worker, and domain packages | This project’s biggest long-term risk is contract drift across multiple runtimes. TypeScript reduces that risk materially. |
| React | 19.2.5 | UI layer for `tv-player`, `mobile-controller`, and lightweight admin | Strong ecosystem, mature browser support, and easy reuse of design/system logic across the three frontends. |
| Vite | 8.0.10 | Frontend build/dev tool for TV, mobile, and admin apps | Fast local iteration, straightforward multi-app setup, and good fit for browser-first deployment. |
| Fastify | 5.8.5 | HTTP + WebSocket server for commands, queries, pairing, and realtime fanout | Lightweight, performant, schema-friendly, and easier to keep deterministic than heavier opinionated frameworks for this stateful product. |
| PostgreSQL | 18.3 | Durable store for catalog metadata, queue history, source records, pairing tokens, and playback events | Strong relational modeling, JSONB where needed, and `pg_trgm` support for incremental Chinese search/read-model work before introducing a separate search engine. |
| NAS + FFmpeg/ffprobe | Current stable line | Controlled media storage plus probe/validation tooling | Phase 1 depends on stable local assets and media inspection more directly than it depends on a background job stack. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.3.6 | Runtime validation for API schemas, command payloads, and event envelopes | Use at all external boundaries: HTTP input, WebSocket messages, config, and worker job payloads. |
| Drizzle ORM | 0.45.2 | Typed SQL access for the catalog/session database | Use if the team wants SQL-first control and shared TS types without hiding schema design behind a heavy abstraction. |
| BullMQ | 5.76.2 | Queueing for library scans, online-cache jobs, verification, and retries | Introduce only after Phase 1 if async asset-readiness workflows outgrow a single backend process. |
| TanStack Query | 5.100.5 | Server-state caching in the mobile controller and admin UI | Use where the UI consumes snapshots/lists from the API but still needs background refresh and optimistic affordances. |
| TanStack Router | 1.168.25 | Route/state composition for mobile and admin frontends | Use if the apps grow beyond a single screen and need typed route params plus cleaner route-level data loading. |
| Zustand | 5.0.12 | Lightweight local UI state for player controls, room presence, and transient interaction state | Use for local UI state that should not be mixed into the server-authoritative room/session model. |
| `pg` | 8.x stable line | PostgreSQL driver beneath Drizzle and direct SQL tooling | Use for database connectivity and maintenance scripts. |
| `ioredis` | 5.x stable line | Redis client for room cache, pub/sub, and BullMQ | Add only if later phases prove Redis is needed for hot-state or queue orchestration. |
| `@fastify/websocket` | 11.x stable line | WebSocket support for session snapshots and player telemetry | Use when Fastify handles both REST and realtime transport in one process. |
| `hls.js` | 1.x stable line | HLS fallback for future streaming-compatible assets | Use only if a later phase introduces HLS playback; do not pull it into MVP if `mp4`/static assets cover the target devices. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm 10.33.2 | Monorepo package manager | Good workspace ergonomics, fast installs, and sensible lockfile behavior for multi-app TypeScript repos. |
| Turborepo 2.9.6 | Task orchestration across apps/packages | Useful once API, worker, TV, mobile, and admin share builds, checks, and generated artifacts. |
| Caddy 2.11.2 | Reverse proxy and static asset/media serving | Clean fit for home/self-hosted deployment, TLS termination, and exposing controlled media routes. |
| FFmpeg / ffprobe 8.x line | Media probing and optional normalization | Use in the worker only. Probe every candidate asset; avoid runtime transcoding during playback. |
## Installation
# Core
# Frontend
# Dev dependencies
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Fastify | NestJS | Use Nest only if the team strongly prefers decorator-heavy structure and accepts more framework ceremony. This project benefits more from explicit control over protocols and state transitions. |
| PostgreSQL + `pg_trgm` | Meilisearch / Elasticsearch | Introduce a dedicated search engine only after the library size and ranking needs exceed what normalized fields plus Postgres can reasonably handle. |
| Drizzle ORM | Prisma | Use Prisma if schema introspection, migrations, and a more batteries-included DX matter more than direct SQL control. |
| Zustand | Redux Toolkit | Use Redux only if local UI state becomes complex enough to justify the extra ceremony and tooling. |
| Browser-native video + static `mp4` | HLS-first playback | Use HLS-first only if the project later standardizes on adaptive streaming outputs or remote distribution requirements. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Microservice-first architecture | This project’s hard problem is state correctness, not scale-out throughput. Splitting everything early adds failure modes without reducing product risk. | Modular monolith with clear package boundaries |
| Direct online playback on the TV | Couples playback stability to provider uptime, extractor drift, and network variance | Cache-before-play pipeline that produces managed local assets |
| Runtime transcoding / DSP in the playback path | Increases latency, device variance, and failure modes on home hardware | Pre-normalized assets plus hardware audio chain |
| Dedicated search infrastructure in v1 | Extra ops cost and complexity before search behavior itself is proven | PostgreSQL + normalized fields + `pg_trgm` |
| Heavy TV-side UI frameworks or duplicated control logic | Conflicts with the product rule that the phone is the only controller | Thin TV runtime focused on playback, status, and reconnect recovery |
## Stack Patterns by Variant
- Use browser-native `<video>` playback with controlled static URLs
- Because it keeps the TV runtime simple and predictable for MVP
- Add `hls.js` behind a capability check in the TV app only
- Because streaming complexity should not leak into mobile, session, or catalog code
- Keep provider adapters and cache jobs in the worker package, not the TV or API client layer
- Because provider volatility should stay isolated behind the `Asset` readiness contract
- Keep a single backend process plus PostgreSQL/NAS/FFmpeg as the baseline when Phase 1 stays within the current MVP floor
- Because the user explicitly wants minimal infrastructure until real workload proves otherwise
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node.js 24.15.0 | Fastify 5.8.5 | Current supported modern runtime combination for the backend |
| React 19.2.5 | Vite 8.0.10 | Current browser-app baseline for TV, mobile, and admin |
| TanStack Query 5.100.5 | React 19.2.5 | Current query layer fits the recommended React baseline |
| TanStack Router 1.168.25 | React 19.2.5 | Typed routing works cleanly with the recommended frontend stack |
| Drizzle ORM 0.45.2 | PostgreSQL 18.3 | Typed SQL approach suits the relational catalog/session model |
| BullMQ 5.76.2 | Redis 8.6.2 | Good fit for later cache/download/scan workflows once those jobs are split out of the main backend |
## Sources
- Internal project context: [PROJECT.md](../PROJECT.md)
- Internal architecture direction: [KTV-ARCHITECTURE.md](../../docs/KTV-ARCHITECTURE.md)
- npm registry package metadata — versions verified on 2026-04-28 for `react`, `vite`, `fastify`, `bullmq`, `zod`, `drizzle-orm`, `@tanstack/react-query`, `@tanstack/react-router`, `zustand`, `typescript`, `turbo`, `pnpm`
- Official Node distribution index — Node.js LTS version verified on 2026-04-28
- Official PostgreSQL docs: https://www.postgresql.org/docs/current/
- Official Caddy releases: https://github.com/caddyserver/caddy/releases
- Official BullMQ docs: https://docs.bullmq.io/
- Official Fastify docs: https://fastify.dev/
- Official React docs: https://react.dev/
- Official Vite docs: https://vite.dev/
- Official Drizzle docs: https://orm.drizzle.team/
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
