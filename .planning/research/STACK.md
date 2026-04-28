# Stack Research

**Domain:** Home living-room KTV system
**Researched:** 2026-04-28
**Confidence:** HIGH

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

```bash
# Core
pnpm add fastify @fastify/websocket zod drizzle-orm pg

# Frontend
pnpm add react react-dom @tanstack/react-query @tanstack/react-router zustand

# Dev dependencies
pnpm add -D typescript vite turbo @types/node

# Optional later
pnpm add bullmq ioredis
```

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

**If the TV target reliably supports H.264/AAC `mp4`:**
- Use browser-native `<video>` playback with controlled static URLs
- Because it keeps the TV runtime simple and predictable for MVP

**If later phases require adaptive or remote-friendly playback:**
- Add `hls.js` behind a capability check in the TV app only
- Because streaming complexity should not leak into mobile, session, or catalog code

**If online supplementation grows into a large operational surface:**
- Keep provider adapters and cache jobs in the worker package, not the TV or API client layer
- Because provider volatility should stay isolated behind the `Asset` readiness contract

**If Phase 1 stays within the current MVP floor:**
- Keep a single backend process plus PostgreSQL/NAS/FFmpeg as the baseline
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
- Official Redis releases: https://github.com/redis/redis/releases
- Official Caddy releases: https://github.com/caddyserver/caddy/releases
- Official BullMQ docs: https://docs.bullmq.io/
- Official Fastify docs: https://fastify.dev/
- Official React docs: https://react.dev/
- Official Vite docs: https://vite.dev/
- Official Drizzle docs: https://orm.drizzle.team/

---
*Stack research for: home living-room KTV system*
*Researched: 2026-04-28*
