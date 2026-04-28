# Feature Research

**Domain:** Home living-room KTV system for a single-room family setup
**Researched:** 2026-04-28
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist for a credible home KTV experience in this project shape. Missing these would make the MVP feel broken, not merely incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 手机入场与遥控点歌 | Current products consistently let guests join from a phone via QR or LAN pairing instead of operating the playback screen directly. | MEDIUM | Must fit this project’s hard rule: phone is the only controller, TV is display-only. Session join and device pairing are part of the core UX, not an extra. |
| 中文优先的歌曲发现 | Family KTV users expect to find songs by song title, singer, pinyin initials, language, and common aliases; exact-title-only search is not acceptable. | HIGH | This is the hardest “basic” feature. It depends on normalized metadata, alias handling, pinyin fields, and dedupe between local and online assets. |
| 已点队列管理 | Add, cancel/delete, top-priority queueing, cut/skip, and seeing current/next songs are standard KTV behaviors across both consumer products and open home systems. | MEDIUM | Queue operations must be server-authoritative to prevent mobile and TV drift. “顶歌/切歌/删歌” are MVP-level, not nice-to-have. |
| 电视端全屏播放与房间状态展示 | Users expect the TV to show the current song cleanly and continuously; at minimum it should surface now playing, next song, and room join QR. | MEDIUM | The TV should not carry search or management UI. Keep it to playback, status, and reconnect-safe rendering. |
| 基础演唱控制 | Original/accompaniment toggle, key adjustment, pause/replay/skip, and volume-related playback controls appear as standard controls in home karaoke products. | MEDIUM | This project should keep controls limited to playback-side options. Do not turn this into a software DSP surface. |
| 稳定播放与失败恢复 | At-home karaoke products are judged more harshly on broken playback than on missing flashy features. Users expect the next song to start reliably and state to recover after reconnects. | HIGH | Preload, end-of-track handling, retry/fallback, and reconnect recovery are product features, not only architecture concerns. |
| 本地歌库为主、在线补歌为辅 | In this project’s target shape, users expect a controllable home song library and only use online sources to fill gaps. | HIGH | Market products vary here, but for this self-hosted family setup it is table stakes. Online songs must still appear as the same logical “song” and be cached before play. |

### Differentiators (Competitive Advantage)

These are valuable, but they should be chosen deliberately and usually deferred until the core “stable singing loop” is proven.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 浏览捷径与轻量个性化 | Artist/language/hotlist/favorites/playlist shortcuts reduce typing and make casual family sessions easier. | MEDIUM | Mature KTV products include this, but it is reasonable to defer if search quality is already strong. Add after the search model is reliable. |
| 评分、录音、Battle/派对玩法 | These features create “party value” and make the system feel richer for repeat use, especially for kids and gatherings. | HIGH | Common in dedicated karaoke products, but they add state, storage, timing, and UX complexity. They are not needed to validate the MVP’s core value. |
| 公平队列与访客权限 | Fair queueing, guest/admin roles, and anti-hogging rules matter for larger parties and frequent hosting. | MEDIUM | Useful when usage shifts from family control to party hosting. Not required for a single-room household MVP where all users are effectively trusted. |
| 收藏、历史与快速重唱 | “Favorites”, recently sung, and replay shortcuts make repeat household usage faster and more personal. | LOW | Valuable once core usage is stable, but not critical for the first validation loop. |
| 视觉氛围增强 | Visualizations, themed backgrounds, or party overlays can make the living-room setup feel more like a real KTV room. | MEDIUM | Safe to defer. They do not improve the core ability to search, queue, and sing reliably. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that are tempting because they look “KTV-complete”, but would damage this MVP if pulled in too early.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| 电视端搜索或触屏式点歌主界面 | Dedicated karaoke boxes often ship with a local touchscreen or on-screen browsing, so it feels familiar. | It directly conflicts with the project’s interaction model, duplicates mobile flows, and expands sync complexity across two control surfaces. | Keep TV display-only and invest in a better mobile join/search/queue experience. |
| 在线直通播放 | It looks faster because users can sing uncached online songs immediately. | It weakens playback reliability, complicates error handling, and leaks provider instability into the player runtime. | Keep “search online -> cache -> play” as the only v1 online path. |
| 第一版做实时麦克风 DSP / AI 人声处理 / 专业修音 | These features sound impressive and are common in marketing for karaoke hardware. | They create latency, hardware-compatibility, and tuning problems while duplicating what the planned hardware chain should handle. | Leave mic effects to hardware; only expose playback-side controls such as original/accompaniment and key. |
| 多房间与复杂账号权限体系 | It sounds future-proof and some open systems support multiple rooms. | It introduces major state-model, device-binding, and admin complexity before the single-room loop is validated. | Preserve the `room` concept in data and API design, but ship only one living-room room in v1. |

## Feature Dependencies

```text
手机入场与遥控点歌
    └──requires──> 会话发现/二维码绑定
                           └──requires──> 服务端作为唯一状态真相

中文优先的歌曲发现
    └──requires──> 统一 Song/Asset 模型
                           └──requires──> 标准化元数据 + 拼音/别名字段

已点队列管理
    └──requires──> 服务端队列状态机
                           └──enhances──> 电视端当前/下一首展示

基础演唱控制
    └──requires──> 播放器运行时可控能力
                           └──requires──> 资源级能力识别（原唱/伴唱、可调 key）

在线补歌
    └──requires──> 在线搜索/解析
                           └──requires──> 缓存任务与失败回退

评分/录音/Battle
    └──requires──> 稳定播放时序 + 麦克风链路约定 + 额外存储

多房间
    └──conflicts──> 单房间 MVP 聚焦

电视端搜索/触屏主控
    └──conflicts──> 手机唯一控制端
```

### Dependency Notes

- **手机入场与遥控点歌 requires 会话发现/二维码绑定:** “Scan and join” is the practical entry point for family use. Without it, the phone-only control model becomes annoying to enter.
- **中文优先的歌曲发现 requires 统一 Song/Asset 模型:** Search quality falls apart if local files and online补歌 appear as separate, conflicting items.
- **已点队列管理 requires 服务端队列状态机:** Queue actions are the main shared-state surface. If queue truth lives on clients, playback drift is inevitable.
- **基础演唱控制 requires 资源级能力识别:** Original/accompaniment and key controls only work cleanly if the system knows what each playable asset actually supports.
- **在线补歌 requires 缓存任务与失败回退:** This project’s documented constraint is “cache before play”; online补歌 is not complete without that pipeline.
- **评分/录音/Battle requires 稳定播放时序 + 麦克风链路约定:** These features pile complexity onto the exact part of the system the MVP is trying to keep simple.
- **多房间 conflicts with 单房间 MVP 聚焦:** Designing for it in the schema is correct; shipping it in v1 is not.
- **电视端搜索/触屏主控 conflicts with 手机唯一控制端:** Two control surfaces would dilute the product and complicate every state transition.

## MVP Definition

### Launch With (v1)

Minimum viable product for this project’s documented goal: stable, family-friendly singing in one living room.

- [ ] 手机扫码入场与房间连接 — required to make phone-only control practical
- [ ] 中文优先搜索（歌名、歌手、拼音、首字母、别名、语种） — core to usable song selection
- [ ] 点歌/删歌/顶歌/切歌/查看当前与下一首 — the minimum queue loop users expect
- [ ] 电视端全屏播放 + 当前歌曲/下一首/二维码展示 — required room display behavior
- [ ] 本地歌库管理 + 在线补歌先缓存后播放 — required to support the project’s local-first content model
- [ ] 基础播放控制（原/伴唱、升降调、暂停/重唱/切歌） — enough control to feel like a real KTV, without crossing into DSP
- [ ] 断线重连、预加载、失败回退 — required for “stable singing”, which is the product’s core value

### Add After Validation (v1.x)

- [ ] 收藏、最近点唱、快速重唱 — add once repeated household use appears in testing
- [ ] Artist/language/hotlist browse shortcuts — add after search relevance is proven and metadata quality is stable
- [ ] 访客权限或轻量管理员模式 — add if parties with many participants become common
- [ ] 资源健康与手动补救工具 — add when online补歌 starts generating real operational edge cases

### Future Consideration (v2+)

- [ ] 评分、录音、Battle/竞赛玩法 — only after playback and audio-chain assumptions are stable
- [ ] 可视化、主题、派对氛围联动 — defer until core UX is boringly reliable
- [ ] 多房间支持 — only when there is a real second-room requirement, not as speculative architecture scope

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| 手机扫码入场与遥控点歌 | HIGH | MEDIUM | P1 |
| 中文优先搜索 | HIGH | HIGH | P1 |
| 已点队列管理 | HIGH | MEDIUM | P1 |
| 电视端全屏播放与状态展示 | HIGH | MEDIUM | P1 |
| 稳定播放、预加载、失败恢复 | HIGH | HIGH | P1 |
| 本地歌库 + 在线补歌缓存播放 | HIGH | HIGH | P1 |
| 基础演唱控制 | HIGH | MEDIUM | P1 |
| 收藏/历史/快速重唱 | MEDIUM | LOW | P2 |
| 浏览捷径（语种/歌手/榜单） | MEDIUM | MEDIUM | P2 |
| 访客权限/公平队列 | MEDIUM | MEDIUM | P2 |
| 评分/录音/Battle | MEDIUM | HIGH | P3 |
| 多房间 | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| 手机遥控点歌 | KaraFun uses QR-based remote control in the browser so guests can browse the catalog and add songs to the queue. | Duochang K88 supports app-based same-LAN pairing and QR-based mobile song selection. | Treat mobile join + queue control as a first-class feature and keep TV playback-only. |
| 搜索与发现 | KaraFun emphasizes catalog search and playlists, with remote users browsing the catalog from phones. | K88 exposes song-title, singer, language, chart, genre, and favorites entry points, including pinyin-initial search. | Prioritize strong Chinese search first; add browse shortcuts after metadata and relevance are stable. |
| 队列与播放控制 | KaraFun exposes queue management plus song-level key/tempo/vocal settings. | K88 exposes top, cut, delete, shuffle, original/accompaniment, replay, and scoring toggles. | Ship the queue loop and a narrow set of playback controls; avoid feature sprawl into party gimmicks at launch. |
| 进阶娱乐功能 | KaraFun markets extras such as Vocal Match, Battle, and richer party features. | K88 includes scoring and recording. | Defer entertainment extras until the core local-first singing loop is proven stable. |
| 内容来源 | KaraFun is streaming/catalog-first. | K88 supports managed local storage and U-disk media import. | Stay local-first with online补歌 as a cached fallback, because that best fits the project’s architecture and reliability goals. |

## Sources

- Internal project scope: [PROJECT.md](../PROJECT.md)
- Internal product/system design: [KTV-ARCHITECTURE.md](../../docs/KTV-ARCHITECTURE.md)
- KaraFun feature overview: https://www.karafun.com/features/ (official, HIGH)
- KaraFun remote control help: https://www.karafun.com/help/general-questions-iphone_454.html (official, HIGH)
- Singing Machine mobile queue help: https://support.singingmachine.com/hc/en-us/articles/21152288432923-How-do-I-connect-my-phone-to-my-machine-to-browse-queue-and-control-music (official, HIGH)
- Singing Machine lead vocal control: https://support.singingmachine.com/hc/en-us/articles/1260804667470-How-do-I-turn-the-lead-vocals-on-or-off-in-the-mobile-app (official, HIGH)
- Singing Machine product features: https://singingmachine.com/products/smc2035 (official, MEDIUM)
- Duochang K88 electronic manual: https://help.duochang.cc/Application/Admin/View/Instruction/product/K88.html (official, HIGH)
- PiKaraoke README / current release context: https://github.com/vicwomg/pikaraoke (official project source, MEDIUM)
- Karaoke Eternal README / current release context: https://github.com/bhj/KaraokeEternal (official project source, MEDIUM)

---
*Feature research for: home living-room KTV system*
*Researched: 2026-04-28*
