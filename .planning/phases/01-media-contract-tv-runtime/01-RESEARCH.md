# Phase 1: Media Contract & TV Runtime - Research

**Researched:** 2026-04-28
**Domain:** 单后端 KTV 媒体契约、网页 TV Player 运行时、播放中原唱/伴唱切换
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Phase 1 首发交付形态是 **网页播放器**，而不是直接做 Android TV 原生壳。
- **D-02:** 虽然首发是网页播放器，但运行时边界必须从第一天就按“**未来确定会包成 Android TV 壳**”来设计，不能把实现写死成只适合普通浏览器页面的结构。
- **D-03:** 第一验证环境锁定为 **桌面 Chrome / 小主机接电视**，而不是电视自带浏览器或 Android 盒子浏览器。
- **D-04:** 用户不接受“只能播但不能切”的正式歌库体验；**正式歌库主路径必须具备原唱 / 伴唱切换能力**。
- **D-05:** 用户要求的切换能力不是“播放前选择原唱版或伴唱版”，而是 **播放中也必须可切**。
- **D-06:** “播放中切换”的体验目标是 **尽量接近无感 / 肉眼几乎感知不到**；明显中断、明显黑帧、明显时间跳变都不符合预期。
- **D-07:** 正式歌库的双资源准入标准必须严格：原唱版与伴唱版必须属于 **同版本、同时轴** 的资源对。
- **D-08:** 双资源时长差 `<=300ms` 才允许正式入库；`300ms-1s` 进入 `review-required`；`>1s` 直接拒绝进入正式歌库。
- **D-09:** planning docs 必须把“播放中原唱 / 伴唱切换”视为 **v1 硬约束**，并拆成三层：Phase 1 运行时切换能力、Phase 2 正式歌库准入规则、Phase 3 控制端触发能力。
- **D-10:** TV `idle` 状态下显示 **大二维码**，以便手机快速扫码入场。
- **D-11:** TV `playing` 状态下显示 **角落常驻小二维码**，而不是完全隐藏二维码。
- **D-12:** 播放中采用 **标准信息密度**：至少展示当前歌曲、下一首、当前原唱 / 伴唱状态，以及必要的加载 / 恢复提示。
- **D-13:** Phase 1 按 **最小基础设施底座** 规划：单 backend + PostgreSQL + NAS 文件存储 + `ffmpeg / ffprobe`。
- **D-14:** `Redis`、`BullMQ`、独立 `worker` 进程 **不是 Phase 1 必需项**；若后续 research / planning 发现必须引入，也应作为“被证明需要”而不是“预设必上”的基础设施。
- **D-15:** 播放失败、恢复中、播放器冲突等状态要 **用户可感知，但文案与表现保持产品化**，不要直接暴露过多技术细节。
- **D-16:** 如果第二个 TV Player 连接同一房间，新播放器应直接看到“当前已有主播放器在线，不能接管”的冲突提示；**Phase 1 不提供抢占接管**。
- **D-17:** 如果播放中原唱 / 伴唱切换失败，系统应 **立即回退到切换前模式**、给出产品化提示，并把该对资源标记为异常待复核。
- **D-18:** TV 重连 / 刷新后，应优先恢复到 **同一首歌的接近原进度**；若做不到，再退回当前曲目开头，并明确提示用户。

### the agent's Discretion
- 具体的播放器前端技术组织方式，只要满足“网页首发、Android TV 壳可接入”的边界要求即可。
- 具体的 TV 状态文案、图标、提示组件和节奏，可以由后续 planner / implementer 自行设计，但必须保持高可读、远距离可识别、且不破坏“产品化提示”的要求。
- 是否在 Phase 1 内先保留 `soft_sub` / `external_lrc` 的数据模型字段但不进入主播放链，可以由后续 planning 在不违背正式歌库准入规则的前提下自行细化。

### Deferred Ideas (OUT OF SCOPE)
- 更完整的界面视觉风格、字体、配色、氛围感等视觉设计细化，延后到 `$gsd-ui-phase 1` 再单独约束。
- 如果未来确实需要支持电视自带浏览器、Android 盒子浏览器或原生 Android TV 壳的差异化适配，作为后续实现研究点，而不是在本次讨论中先展开成多套目标。
</user_constraints>

<research_summary>
## Summary

Phase 1 不应该被理解成“先把 repo 搭起来再说”，而应该被理解成“先把 KTV 最脆弱的运行时契约锁死”。对这个项目来说，真正高风险的不是 CRUD，也不是播放器 UI，而是：服务端如何定义当前播放目标、TV 如何在网页环境里稳定接管这个目标、以及一对原唱/伴唱资源如何在播放中完成接近无感的切换并在失败时立即回退。

基于当前产品约束，最稳妥的实现路径是：`单 backend + PostgreSQL + NAS + Web TV Player`，服务端产出明确的 `playback target` / `switch target`，TV Player 用“双 video 元素 + 预加载 + 同进度重入 + 成功后切主”的方式做运行时切换。不要把切换建立在双音轨、实时 DSP、模糊文件名推断或在线播放器魔法上；切换体验来自严格的资源配对和明确的状态机，而不是来自浏览器自动帮你做对。

**Primary recommendation:** Phase 1 先落地“服务端权威播放目标 + 网页 TV 运行时 + 双资源切换/回退协议”，并把 autoplay 拒绝、播放器冲突、重连恢复都当成主功能而不是异常路径。
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 24.15.0 LTS | 后端运行时 | 统一 API、状态机、工具脚本和共享 TS 包，足够支撑 Phase 1 的单进程基线。 |
| TypeScript | 5.9.2 | 共享类型系统 | 当前项目最大的长期风险是协议漂移；Phase 1 就需要把协议、媒体契约、事件载荷收敛成共享类型。 |
| Fastify | 5.8.5 | HTTP + WebSocket 网关 | 轻量、明确、可控，适合“手机发命令、TV 报事实、服务端产完整状态”的边界。 |
| PostgreSQL | 18.3 | 持久化真相源 | `Song` / `Asset` / `Room` / `PlaybackSession` / `DeviceSession` / `PlaybackEvent` 都适合关系建模。 |
| React | 19.2.5 | TV Web Player UI | 当前目标是网页首发，React 足够表达 TV 状态 UI 与播放器运行时壳层。 |
| Vite | 8.0.10 | TV 前端构建 | 绿地单页播放器 + 后续 mobile/admin 分应用时都足够轻。 |
| FFmpeg / ffprobe | 8.x line | 媒体探测与离线标准化 | Phase 1 虽不做完整导入流水线，但运行时和 seed 数据都依赖资源探测与时长/编码确认。 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.3.6 | 运行时协议校验 | 对 HTTP 命令、WS 事件、播放器上报和环境变量做边界校验。 |
| Drizzle ORM | 0.45.2 | PostgreSQL schema / query layer | 适合 Phase 1 直接锁定 schema，而不牺牲对 SQL 的可见性。 |
| `@fastify/websocket` | 11.x stable line | WebSocket 接入 | 用于房间状态快照和播放器事实状态上报。 |
| TanStack Query | 5.100.5 | 后续 mobile/admin 服务端状态缓存 | Phase 1 不是主角，但后续 Phase 3/4 可直接接。 |
| BullMQ | 5.76.2 | 可选异步任务层 | 只有当扫描/缓存/重试复杂度被真实工作负载证明需要时再引入。 |
| `ioredis` | 5.x stable line | 可选 Redis 客户端 | 只有当需要热状态缓存、pub/sub 或队列持久化时再引入。 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fastify | NestJS | Nest 更重，Phase 1 需要的是协议可控性，不是更厚的框架壳。 |
| Browser `<video>` + 双元素切换 | MSE / WebCodecs 自建拼接 | 复杂度明显更高，不适合作为首个可唱闭环主路径。 |
| 单 backend | backend + worker + Redis from day one | 未来可能需要，但现在会把精力从运行时契约转移到基础设施编排。 |

**Installation:**
```bash
pnpm add fastify @fastify/websocket zod drizzle-orm pg
pnpm add react react-dom
pnpm add -D typescript vite @types/node

# Optional later
pnpm add bullmq ioredis
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure
```text
apps/
├── api/                    # Fastify API + websocket gateway
├── tv-player/              # 浏览器首发的 TV 播放器
└── worker/                 # 可选 later：扫描/缓存/重试
packages/
├── domain/                 # Song/Asset/Room/PlaybackSession model
├── protocol/               # command / state / event schema
├── session-engine/         # 状态机 reducer / command handlers
└── player-contracts/       # TV runtime target / telemetry contract
```

### Pattern 1: Server-Authored Playback Target
**What:** TV 不自己推断“现在该播什么”，而是消费服务端下发的完整播放目标。
**When to use:** 当前歌曲加载、切歌、重连恢复、播放中原唱/伴唱切换。
**Example:**
```typescript
type PlaybackTarget = {
  roomId: "living-room";
  sessionVersion: number;
  queueEntryId: string;
  assetId: string;
  switchFamily: string | null;
  vocalMode: "original" | "instrumental";
  playbackUrl: string;
  resumePositionMs: number;
  nextQueueEntryPreview: { songTitle: string; artistName: string } | null;
};
```

### Pattern 2: Dual-Video Preload and Commit
**What:** 当前播放元素继续占屏，目标资源在备用 video 元素里预加载、seek、尝试 `play()`，确认成功后再切主。
**When to use:** 播放中原唱/伴唱切换、重连后同曲目近进度恢复。
**Example:**
```typescript
async function switchToPreparedTarget(active: HTMLVideoElement, standby: HTMLVideoElement, target: PlaybackTarget) {
  standby.src = target.playbackUrl;
  standby.load();
  await waitFor(standby, "loadedmetadata");
  standby.currentTime = target.resumePositionMs / 1000;
  await tryPlay(standby);
  standby.requestVideoFrameCallback(() => commitVideoSwap(active, standby));
}
```

### Pattern 3: Rollback-First Switching
**What:** 切换不是“先停旧的，再赌新的”，而是“新资源确认能播后才提交；若失败立即维持或回退旧资源”。
**When to use:** 所有播放中原唱/伴唱切换。
**Example:**
```typescript
async function tryPlay(video: HTMLVideoElement) {
  try {
    await video.play();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error };
  }
}
```

### Pattern 4: Device Truth Split
**What:** 手机只发命令，TV 只报事实，服务端独占房间真相。
**When to use:** 全阶段。
**Anti-Patterns to Avoid**
- **Single video `src` destructive switch:** 直接替换当前播放 video 的 `src` 很容易产生明显黑帧和回退困难。
- **Capability by filename guessing:** 不允许靠 `伴奏` / `原唱` 字样猜测切换配对。
- **TV-driven state truth:** TV 不得因为本地播放到哪了就自行决定房间状态或下一首。
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 播放器事实状态 | 手写松散 JSON 回调 | Zod 校验的 `player.telemetry.*` schema | 播放器事件最容易漂移，边界必须强校验。 |
| 资源配对能力 | 文件名猜测器 | `switchFamily` + `vocalMode` + verified pair state | 文件名永远不够稳定，Phase 1 需要显式契约。 |
| 播放授权/恢复 | 让 TV 自己记局部状态真相 | 服务端快照 + `resumePositionMs` + `sessionVersion` | 断线恢复和多端一致性都依赖服务端裁决。 |
| 运行时人声处理 | WebAudio / DSP 路径 | 明确的双资源切换 | 复杂度、效果和性能都不适合首版主路径。 |

**Key insight:** Phase 1 的难点不是“缺少一个神奇播放器库”，而是需要把媒体资源、状态机和 TV 运行时交界面收束成一套可验证的协议。
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: 把 autoplay 当成“浏览器会自己处理”
**What goes wrong:** 页面一开就想直接带声播放，结果 `play()` 被拒绝，TV 卡在空白或假播放状态。
**Why it happens:** 桌面 Chrome 对带声 autoplay 有策略限制，脚本调用 `play()` 也受这个限制。
**How to avoid:** 所有 `play()` 都必须处理 Promise；Phase 1 明确实现 `NotAllowedError` 的产品化提示或受控环境启动策略。
**Warning signs:** UI 提示“正在播放”，但 `video.play()` Promise 已 reject；重连后需要本地点击才能恢复。

### Pitfall 2: 用未验证资源对强行做播放中切换
**What goes wrong:** 切换后明显跳时间轴、黑帧过长、甚至切到错误版本。
**Why it happens:** 把“有两个文件”误当成“有一对可切资源”。
**How to avoid:** Phase 1 运行时只接受显式 `switchFamily`，并对 seed 数据维持严格的手工验证；Phase 2 再把它升级成正式准入流水线。
**Warning signs:** 运行时需要写大量“如果切不过就再试一次”的补丁逻辑。

### Pitfall 3: 只用一个 video 元素做一切
**What goes wrong:** `src` 替换会中断当前播放，无法平滑预加载，也难以失败回退。
**Why it happens:** 浏览器原生 `<video>` 看起来足够简单，容易让人忽略切换场景。
**How to avoid:** 从一开始就按 active/standby 双元素运行时组织播放器。
**Warning signs:** 切换代码的第一步就是 `video.pause(); video.src = ...`

### Pitfall 4: 直到 Phase 3 才发现 TV runtime 自己也在定义状态
**What goes wrong:** 后续手机控制接入时，TV 和服务端对“当前曲目 / 当前模式 / 当前进度”各说各话。
**Why it happens:** 早期实现把 TV 当成薄 UI，但实际上它偷偷承担了业务裁决。
**How to avoid:** Phase 1 就冻结命令/状态/事件边界，并让 TV 只消费 target、只上报事实。
**Warning signs:** TV 本地 state 里出现 `queue`, `nextSongDecision`, `canTakeOverRoom` 之类业务字段。
</common_pitfalls>

<code_examples>
## Code Examples

### 处理 `play()` Promise 与 autoplay 拒绝
```typescript
async function safeStart(video: HTMLVideoElement) {
  try {
    await video.play();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, reason: "autoplay-blocked", error };
  }
}
```

### 用 `requestVideoFrameCallback()` 做切主时机
```typescript
function commitWhenFrameReady(video: HTMLVideoElement, onReady: () => void) {
  if ("requestVideoFrameCallback" in video) {
    video.requestVideoFrameCallback(() => onReady());
    return;
  }

  video.addEventListener("playing", onReady, { once: true });
}
```

### 服务端生成切换目标而不是让 TV 猜
```typescript
type SwitchTarget = {
  fromAssetId: string;
  toAssetId: string;
  resumePositionMs: number;
  expectedMode: "original" | "instrumental";
  rollbackAssetId: string;
};
```
</code_examples>

<sota_updates>
## State of the Art (2024-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 假设脚本 `play()` 一定成功 | 必须显式处理 Promise reject 和 autoplay policy | 现代浏览器已普遍收紧 autoplay | TV runtime 不能把“自动播放成功”当默认前提。 |
| 依赖 `playing` / `canplay` 粗粒度事件做所有切换时机 | 在支持平台上可用 `requestVideoFrameCallback()` 更精细地观察视频帧何时真正提交 | 近年浏览器支持度提升，MDN 标记为 2024 baseline | 对桌面 Chrome 目标可作为切换体验优化，但仍需 `playing` 回退路径。 |
| 先做基础设施，再补播放语义 | 对 KTV 这类状态机产品，应先冻结播放目标契约和回退语义 | 这是产品工程上的最佳实践，而非单一库升级 | Phase 1 计划必须优先协议和运行时，不是优先队列或搜索。 |

**New tools/patterns to consider:**
- `requestVideoFrameCallback()`：适合桌面 Chrome 目标环境，用于更稳妥地判定备用 video 已经真正准备好切主。
- Promise-based media control：`play()` 成败必须进入 UI/状态机，而不是只写日志。

**Deprecated/outdated:**
- “播放前选择原唱/伴唱就够了” 这套思路对当前 Phase 1 已经过时。
- “先默认上 Redis/BullMQ/worker 再说” 对当前 Phase 1 是过度前置。
</sota_updates>

<open_questions>
## Open Questions

1. **Phase 1 的近无感切换最终能否稳定打到什么预算？**
   - What we know: 用户体验目标是肉眼几乎无感；正式入库要求 Phase 2 会锁到严格配对资源。
   - What's unclear: 在桌面 Chrome + mini PC + 真实电视链路上，双 video 预加载后实际黑帧/静音窗口能稳定收敛到多少。
   - Recommendation: 计划里把“实机 smoke test + 切换时延测量 + rollback 验证”当 Phase 1 必测项，而不是留到 UAT 才看。

2. **Phase 1 是否需要立即拆出独立 worker？**
   - What we know: 当前没有代码，且用户明确要求最小底座；Phase 1 也不包含完整在线缓存流水线。
   - What's unclear: 如果实现中发现播放器事件写库、seed 媒体探测或状态广播明显阻塞单 backend，是否需要提前引入异步进程。
   - Recommendation: 先按单 backend 设计代码边界，让任务接口可抽离，但默认不在 Phase 1 落 `Redis/BullMQ/worker`。

3. **切换运行时是否需要直接依赖 `requestVideoFrameCallback()`？**
   - What we know: 目标环境是桌面 Chrome，API 已成熟可用；但未来 Android TV 壳的 WebView 策略仍未验证。
   - What's unclear: 后续壳层是否全部稳定支持同等行为。
   - Recommendation: 计划中把它作为优先优化路径，同时保留基于 `playing` 事件的兼容切主回退。
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — 项目级边界与核心价值
- `.planning/ROADMAP.md` — 当前 phase 划分与 success criteria
- `.planning/REQUIREMENTS.md` — Phase 1 requirement IDs
- `.planning/phases/01-media-contract-tv-runtime/01-CONTEXT.md` — 用户锁定决策
- `docs/KTV-ARCHITECTURE.md` — 媒体模型、TV runtime、切换、二维码与冲突语义
- `.planning/research/SUMMARY.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/STACK.md`
- `.planning/research/PITFALLS.md`

### Official browser/runtime references
- Chrome autoplay policy — https://developer.chrome.com/blog/autoplay
- MDN `HTMLMediaElement.play()` — https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play
- MDN `HTMLVideoElement.requestVideoFrameCallback()` — https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback

### Secondary (MEDIUM confidence)
- PiKaraoke Bluetooth AV sync notes — https://github.com/vicwomg/pikaraoke/wiki/Bluetooth-Audio-Video-Sync
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Fastify + PostgreSQL + Web TV runtime
- Ecosystem: React/Vite, browser media APIs, optional Redis/BullMQ later
- Patterns: server-authored playback target, dual-video switching, rollback-first runtime
- Pitfalls: autoplay, switching on dirty assets, TV/runtime truth drift

**Confidence breakdown:**
- Standard stack: HIGH - 项目级 stack 已存在且与用户新决策只需做轻量修正
- Architecture: HIGH - 当前 phase 边界和运行时目标已经在 CONTEXT/ROADMAP/架构文档中明确
- Pitfalls: HIGH - 这些失败模式直接由浏览器媒体行为和用户约束决定
- Code examples: MEDIUM - 示例是 Phase 1 推荐模式，不是现成项目代码

**Research date:** 2026-04-28
**Valid until:** 2026-05-28
</metadata>

---

*Phase: 01-media-contract-tv-runtime*
*Research completed: 2026-04-28*
*Ready for planning: yes*
