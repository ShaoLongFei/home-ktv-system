# Phase 1: Media Contract & TV Runtime - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 01-media-contract-tv-runtime
**Areas discussed:** TV runtime target, playable asset contract, TV screen composition, MVP infrastructure floor, failure/conflict UX, seamless switching acceptance, dual-asset admission threshold, switch failure handling, reconnect recovery semantics

---

## TV Runtime Target

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | 纯浏览器优先，先做固定地址网页播放器 | |
| 2 | 浏览器优先，但从第一天就按未来 Android TV 壳接入设计边界 | ✓ |
| 3 | 直接按特定设备 / 壳层首发 | |

**User's choice:** 2，先网页，但后续肯定会包成 Android TV 壳  
**Notes:** 用户随后补充首测目标选择了桌面 Chrome / 小主机接电视，而不是电视自带浏览器或 Android 盒子浏览器。

---

## Playable Asset Contract

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | 严格主路径：正式可播资源只接受本地视频 + `hard_sub` + 浏览器友好编码，`soft_sub` / `external_lrc` 不进入主链 | |
| 2 | 稍微放宽：`hard_sub` 为主，稳定的 `soft_sub` 可正式入库 | |
| 3 | 更开放：`hard_sub` / `soft_sub` 都可作为正式资源，只要能播先收 | ✓ |

**User's choice:** 3  
**Notes:** 用户进一步补充：正式歌库必须具备原唱 / 伴唱切换能力，否则会在使用中引发“为什么切不了”的疑问。

---

## Switching Capability Definition

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | 播放前可选原唱版 / 伴唱版即可 | |
| 2 | 播放中也必须可切 | ✓ |
| 3 | 其他定义 | |

**User's choice:** 2  
**Notes:** 这与当前 roadmap / requirements 里把“播放中切换”后置到后续 phase 的设定冲突，用户随后明确要求按“产品硬约束”处理，而不是保持当前 roadmap 不变。

---

## Roadmap Conflict Handling

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | 保持当前 roadmap，不把播放中切换提前 | |
| 2 | 视为产品硬约束，后续需要先改 roadmap / requirements | ✓ |

**User's choice:** 2  
**Notes:** 讨论中明确：不能把“播放中原唱/伴唱切换”继续当作 v2 事项假装忽略。

---

## TV Screen Composition

| Option | Description | Selected |
|--------|-------------|----------|
| A1 | `idle` 大二维码，`playing` 角落常驻小二维码 | ✓ |
| A2 | `idle` 大二维码，播放时隐藏二维码 | |
| A3 | 始终小二维码 | |
| A4 | 自定义 | |

| Option | Description | Selected |
|--------|-------------|----------|
| B1 | 极简：只显示当前歌曲、下一首、二维码 | |
| B2 | 标准：当前歌曲、下一首、原唱 / 伴唱状态、必要提示 | ✓ |
| B3 | 运维型：显示更多诊断状态 | |
| B4 | 自定义 | |

**User's choice:** A1 B2  
**Notes:** 用户希望信息清楚，但不想一开始做成显式诊断面板。

---

## MVP Infrastructure Floor

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | 最小底座：单 backend + PostgreSQL + NAS + `ffmpeg / ffprobe` | ✓ |
| 2 | 从第一天就引入 Redis / worker / job 底座 | |
| 3 | 自定义折中方案 | |

**User's choice:** 1  
**Notes:** `Redis / BullMQ / 独立 worker` 不作为 Phase 1 必需项。

---

## Failure and Conflict UX

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | 用户可感知，但尽量产品化 | ✓ |
| 2 | 尽量少打扰，优先静默恢复 | |
| 3 | 显式诊断型 | |

| Option | Description | Selected |
|--------|-------------|----------|
| a | 新播放器直接看到“已有主播放器在线，不能接管” | ✓ |
| b | 新播放器允许手动申请抢占 | |
| c | 其他方案 | |

**User's choice:** 1 a  
**Notes:** 冲突提示要明确，但不暴露过多技术细节；第二个 TV Player 不提供抢占。

---

## Seamless Switching Acceptance

| Option | Description | Selected |
|--------|-------------|----------|
| A | `<=300ms` 的静音 / 黑帧可接受，不允许从头播，不允许明显跳时轴 | |
| B | `<=1s` 中断可以接受，只要仍在当前段落附近 | |
| C | 基本必须肉眼无感，几乎看不出切换 | ✓ |
| D | 自定义 | |

**User's choice:** 1C  
**Notes:** 用户把“近乎无感切换”当成正式歌库切换能力的体验底线。

---

## Dual-Asset Admission Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| A | 同版本、同时轴；时长差 `<=300ms` 正式入库，`300ms-1s` 进 `review-required`，`>1s` 拒绝 | ✓ |
| B | 同版本即可，时长差 `<=1s` 也可正式入库 | |
| C | 主观试听感觉能切就可正式入库 | |
| D | 自定义 | |

**User's choice:** 2A  
**Notes:** 用户要求正式歌库有很高的一致性，不能靠“差不多能切”糊弄。

---

## Switch Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| A | 回退到切换前模式，给出产品化提示，并标记资源异常待复核 | ✓ |
| B | 停在当前歌并提示用户重试 / 切歌 | |
| C | 失败一次就把这首歌从正式歌库下线 | |
| D | 自定义 | |

**User's choice:** 3A  
**Notes:** 用户更重视使用中的确定性，切失败后应快速回到可唱状态。

---

## Reconnect Recovery Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| A | 优先恢复到同一首歌的接近原进度；做不到再退回曲目开头并提示 | ✓ |
| B | 只要恢复到同一首歌即可，从头也可以 | |
| C | 恢复不了原进度就直接进入错误态 | |
| D | 自定义 | |

**User's choice:** 4A  
**Notes:** 恢复目标不仅是“同一首歌”，还要尽量维持正在唱的上下文。

---

## the agent's Discretion

- 具体前端技术实现、提示样式、图标和状态组件留给后续研究 / planning 决定。
- 更完整的视觉风格和界面气质延后到 `gsd-ui-phase 1` 处理。

## Deferred Ideas

- 更细的视觉风格、配色、字体、氛围感等 UI 风格约束，后续通过 `gsd-ui-phase 1` 单独定义。
