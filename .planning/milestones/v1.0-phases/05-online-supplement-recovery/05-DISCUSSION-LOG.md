# Phase 5: Online Supplement & Recovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 05-Online Supplement & Recovery
**Areas discussed:** 补歌入口与候选展示, Provider 与缓存闸门, Ready 准入与失败回退, 运维恢复视图

---

## 补歌入口与候选展示

| Option | Description | Selected |
|--------|-------------|----------|
| 本地无结果时显示在线候选和“请求补歌” | 本地没有搜到时，直接给在线候选和发起补歌入口，用户能立刻理解下一步动作。 | ✓ |
| 本地无结果时只显示“请求补歌” | 不展示候选，只保留一个请求入口。 |  |
| 每次搜索都显示在线候选，本地结果永远在上 | 在线候选总是出现，本地结果只是其中一部分。 |  |

**User's choice:** 本地无结果时显示在线候选和“请求补歌”
**Notes:** 直接把补歌能力暴露在搜索无结果场景里。

| Option | Description | Selected |
|--------|-------------|----------|
| 默认不打扰，只在底部弱提示 | 本地有结果时，在线候选作为弱提示，不影响主结果阅读。 |  |
| 完全不显示在线补歌 | 本地有结果时隐藏在线内容。 |  |
| 展示在线候选区，但排在本地结果下方 | 本地优先，在线候选只作为补充。 | ✓ |

**User's choice:** 展示在线候选区，但排在本地结果下方
**Notes:** 保持本地主路径优先，不让在线补歌抢位。

| Option | Description | Selected |
|--------|-------------|----------|
| 标题、歌手、来源、时长、候选类型、可靠性/风险标签 | 保留足够判断信息，但不暴露过多技术细节。 | ✓ |
| 只展示标题、歌手、来源 | 极简展示，信息少。 |  |
| 展示缩略图、链接、分辨率、说明等更多信息 | 更丰富，但更重。 |  |

**User's choice:** 标题、歌手、来源、时长、候选类型、可靠性/风险标签
**Notes:** 候选卡片需要有风险感知。

| Option | Description | Selected |
|--------|-------------|----------|
| 显示任务状态流，ready 后提示用户点歌 | 明确补歌任务进度，ready 只是可点，不自动入队。 | ✓ |
| ready 后自动加入队列 | 让补歌更像一键完成。 |  |
| 只告诉用户“已提交” | 后续状态主要在后台处理。 |  |

**User's choice:** 显示任务状态流，ready 后提示用户点歌
**Notes:** 结果要清楚，不能直接自动塞进播放队列。

---

## Provider 与缓存闸门

| Option | Description | Selected |
|--------|-------------|----------|
| 只允许自有或明确授权的 provider 进入缓存 | 风险最低，发现层和缓存层分得最清楚。 |  |
| 先提供一个内部 demo provider | 便于测试，但仍限制范围。 |  |
| 允许所有已启用 provider 进入缓存，管理员可关闭 | 先覆盖面，再靠 kill-switch 控制。 | ✓ |

**User's choice:** 允许所有已启用 provider 进入缓存，管理员可关闭
**Notes:** Provider 开关要保留可控性。

| Option | Description | Selected |
|--------|-------------|----------|
| 所有在线候选先进入 `review_required` | 统一前置人工审核，再允许缓存。 |  |
| 明确可信 provider 可以直接缓存，其他 provider 走审核 | 有选择地放行。 |  |
| 选中就直接缓存，失败后再退回审核 | 不做统一前置审核。 | ✓ |

**User's choice:** 选中就直接缓存，失败后再退回审核
**Notes:** 不把审核做成统一闸门。

| Option | Description | Selected |
|--------|-------------|----------|
| 完整生命周期：`discovered / selected / review_required / fetching / fetched / ready / failed / stale / promoted / purged` | 任务状态足够细，方便后续修复。 | ✓ |
| 简化为 `pending / running / ready / failed / promoted` | 简化实现。 |  |
| 再压缩成 `pending / ready / failed` | 最轻量。 |  |

**User's choice:** 完整生命周期：`discovered / selected / review_required / fetching / fetched / ready / failed / stale / promoted / purged`
**Notes:** 状态完整，但不代表每个候选都必须经过所有阶段。

| Option | Description | Selected |
|--------|-------------|----------|
| ready 后仍需用户显式选择 | 可播，但不自动入队。 | ✓ |
| ready 后自动放入队列末尾 | 让用户少一步操作。 |  |
| ready 后自动顶到当前曲后面 | 更强的补歌自动化。 |  |

**User's choice:** ready 后仍需用户显式选择
**Notes:** ready 只是可点状态，不自动推进队列。

---

## Ready 准入与失败回退

| Option | Description | Selected |
|--------|-------------|----------|
| 缓存完成并通过自动校验后立即可点 | ready 直接进入可播状态。 | ✓ |
| 缓存完成后先进入“待转正” | 需要管理员再确认。 |  |
| 缓存完成后只在后台可见 | 手机端继续隐藏。 |  |

**User's choice:** 缓存完成并通过自动校验后立即可点
**Notes:** ready 资源的可用性要及时。

| Option | Description | Selected |
|--------|-------------|----------|
| ready 在线资源只算临时补歌，不进入正式歌库语义 | 可以播，但仍然保持补歌属性。 | ✓ |
| 两者都算正式可点资源 | 对用户完全合并。 |  |
| 单独分组显示，和本地正式歌库区分很明显 | 强调分裂感。 |  |

**User's choice:** ready 在线资源只算临时补歌，不进入正式歌库语义
**Notes:** 可播放与正式库语义要分开。

| Option | Description | Selected |
|--------|-------------|----------|
| 直接跳下一首 | 最简单，复杂度最低。 | ✓ |
| 优先切换同曲备用资源，再不行跳下一首 | 更积极地救当前曲。 |  |
| 先重试当前资源一次，再切备用资源，最后跳下一首 | 最完整。 |  |

**User's choice:** 直接跳下一首
**Notes:** 不优先做同曲重试或备用资源切换。

| Option | Description | Selected |
|--------|-------------|----------|
| 显示失败原因和回退结果 | 让用户知道发生了什么。 | ✓ |
| 只显示“播放失败” | 更简洁但信息少。 |  |
| 显示更细的技术原因码 | 排障强，但更硬核。 |  |

**User's choice:** 显示失败原因和回退结果
**Notes:** 失败后的反馈要产品化。

---

## 运维恢复视图

| Option | Description | Selected |
|--------|-------------|----------|
| 展示房间状态、当前曲目、队列、TV 在线、控制端数量、最近事件、在线任务摘要 | 最符合运维恢复视图需要。 | ✓ |
| 只展示房间状态和当前队列 | 更轻量。 |  |
| 展示完整调试面板和所有任务字段 | 更偏 debug。 |  |

**User's choice:** 展示房间状态、当前曲目、队列、TV 在线、控制端数量、最近事件、在线任务摘要
**Notes:** 后台要可直接判断问题。

| Option | Description | Selected |
|--------|-------------|----------|
| 重试失败任务、清理失败任务、刷新房间状态、刷新 pairing token、转正资源 | 提供完整恢复动作。 | ✓ |
| 只读查看，不允许后台动作 | 只看不修。 |  |
| 允许重试和清理，但不允许转正 | 部分可操作。 |  |

**User's choice:** 重试失败任务、清理失败任务、刷新房间状态、刷新 pairing token、转正资源
**Notes:** 后台必须能修问题，不只是看问题。

| Option | Description | Selected |
|--------|-------------|----------|
| 每个任务卡片都能看到关联房间、候选、状态、失败原因和最近事件 | 任务与事件关联最清楚。 | ✓ |
| 只看任务列表，不强制关联事件 | 更简单。 |  |
| 只看事件流，不做任务卡片 | 更像日志视图。 |  |

**User's choice:** 每个任务卡片都能看到关联房间、候选、状态、失败原因和最近事件
**Notes:** 任务卡要有修复上下文。

| Option | Description | Selected |
|--------|-------------|----------|
| 要，且作为管理员显式操作 | 转正入口非常明确。 |  |
| 不要，自动完成就行 | 不把它做成显式主入口。 | ✓ |
| 只允许对本地资源转正，在线资源不提供入口 | 直接禁止在线转正。 |  |

**User's choice:** 不要，自动完成就行
**Notes:** 不在 Rooms 页单独暴露 ready 在线资源的显式转正按钮。

## the agent's Discretion

- 任务卡片的具体布局、状态徽标文案、刷新节奏和失败原因的视觉层级。
- Provider kill-switch 的具体入口位置和状态表达。
- `review_required` 在 UI 上的呈现方式，以及 ready 资源与本地正式资源的分组样式。
- 在线任务列表与最近事件的展开方式。

## Deferred Ideas

None — discussion stayed within phase scope.
