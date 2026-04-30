# Phase 3: Room Sessions & Queue Control - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 03-Room Sessions & Queue Control
**Areas discussed:** 扫码入场与控制会话恢复, 多人控制权限与防误触规则, 实时同步方式与手机控制首屏, 队列命令语义和自动推进, 管理员二维码 / token 管理

---

## 扫码入场与控制会话恢复

### `pairingToken` 有效期

| Option | Description | Selected |
|--------|-------------|----------|
| 15 分钟 | 短时有效但不容易刚扫码就过期 | ✓ |
| 5 分钟 | 更安全但家庭场景略烦 | |
| 30 分钟 | 更宽松 | |

**User's choice:** 15 分钟。
**Notes:** 采用推荐项。

### 控制会话保存方式

| Option | Description | Selected |
|--------|-------------|----------|
| 服务端控制会话 + httpOnly cookie + 本地 device id | 刷新 / 短断线恢复更稳 | ✓ |
| localStorage 保存控制 token | 实现轻但安全性弱一点 | |
| 不保存长期会话 | 每次都依赖二维码 token | |

**User's choice:** 服务端控制会话 + httpOnly cookie + 本地 device id。
**Notes:** 采用推荐项。

### 恢复规则

| Option | Description | Selected |
|--------|-------------|----------|
| 已建立会话可恢复 | `pairingToken` 过期不影响既有会话 | ✓ |
| token 一过期就要求重扫 | 更严格但体验差 | |
| 会话一直保留 | 直到管理员手动清理 | |

**User's choice:** 已建立会话可在刷新 / 短断线后恢复；`pairingToken` 过期不影响既有会话。
**Notes:** 采用推荐项。

### token 轮换后的影响

| Option | Description | Selected |
|--------|-------------|----------|
| 新扫码必须用新 token，既有会话继续有效 | 不打断已经入场的手机 | ✓ |
| 轮换后立即踢掉所有手机 | 最严格 | |
| 新旧 token 短时间并存 | 降低误伤但状态更复杂 | |

**User's choice:** 新扫码必须使用新 token；既有控制会话继续有效到超时。
**Notes:** 采用推荐项。

---

## 多人控制权限与防误触规则

### 多个手机控制端权限

| Option | Description | Selected |
|--------|-------------|----------|
| 所有手机平权 | 家庭 KTV 场景最轻 | ✓ |
| 第一个进入的是 host | 危险操作只有 host 能做 | |
| 管理员可指定 host | 权限更细但复杂 | |

**User's choice:** 所有手机平权。
**Notes:** 采用推荐项。

### 切歌确认

| Option | Description | Selected |
|--------|-------------|----------|
| 切当前歌需要二次确认 | 防误触 | ✓ |
| 不确认，点了立即切 | 操作最快 | |
| 长按按钮触发 | 不弹确认但交互成本高 | |

**User's choice:** 切掉当前正在播放歌曲需要二次确认。
**Notes:** 采用推荐项。

### 删除队列项确认

| Option | Description | Selected |
|--------|-------------|----------|
| 不弹确认，但提供短暂撤销 | 只删除未播放队列项 | ✓ |
| 每次删除都二次确认 | 更保守 | |
| 不做撤销，点了立即删除 | 最轻但易误触 | |

**User's choice:** 删除未播放队列项不弹确认，但提供短暂撤销。
**Notes:** 采用推荐项。

### 原唱 / 伴唱切换确认

| Option | Description | Selected |
|--------|-------------|----------|
| 不需要二次确认，按钮即时切换 | 常用播放控制 | ✓ |
| 需要确认 | 更保守但打断操作 | |
| 只有当前点歌人可以切换 | 引入权限区分 | |

**User's choice:** 原唱 / 伴唱切换不需要二次确认，按钮即时触发。
**Notes:** 采用推荐项。

---

## 实时同步方式与手机控制首屏

### 实时同步方式

| Option | Description | Selected |
|--------|-------------|----------|
| WebSocket 做主同步 | 手机、TV、服务端状态闭环最直接 | ✓ |
| SSE 推状态 + HTTP 发命令 | 单向推送更简单 | |
| 继续短轮询 | 保持最轻实现 | |

**User's choice:** WebSocket 做主同步。
**Notes:** 采用推荐项。

### WebSocket 断线降级

| Option | Description | Selected |
|--------|-------------|----------|
| 自动重连，失败时退回低频轮询并显示状态 | 更稳 | ✓ |
| 只自动重连，不做轮询降级 | 实现更轻 | |
| 断线后要求用户刷新页面 | 最简单但体验差 | |

**User's choice:** 自动重连，失败时退回低频轮询并显示离线 / 重连状态。
**Notes:** 采用推荐项。

### 手机控制首屏重点

| Option | Description | Selected |
|--------|-------------|----------|
| 当前播放 + 切换 + 队列 + 点歌入口 + TV 在线状态 | 功能完整 | ✓ |
| 队列优先 | 当前播放压缩成顶部条 | |
| 当前播放优先 | 队列放第二屏 | |

**User's choice:** 当前播放 + 原唱 / 伴唱切换 + 队列 + 点歌入口 + TV 在线状态。
**Notes:** 采用推荐项。

### Phase 3 点歌入口

| Option | Description | Selected |
|--------|-------------|----------|
| 最小已入库歌曲列表 / 选择歌曲入口 | 满足 QUEU-01，完整搜索留 Phase 4 | ✓ |
| 只做接口和测试 | 不做手机端点歌 UI | |
| 暂时用后台或测试入口加歌 | 手机端 Phase 4 再做点歌入口 | |

**User's choice:** Phase 3 提供最小“已入库歌曲列表 / 选择歌曲”入口；完整搜索留 Phase 4。
**Notes:** 采用推荐项。

---

## 队列命令语义和自动推进

### 顶歌语义

| Option | Description | Selected |
|--------|-------------|----------|
| 顶到当前播放之后的第一位 | 不打断当前歌曲 | ✓ |
| 立即插播并打断当前歌曲 | 更激进 | |
| 只上移一位 | 更细粒度但效率低 | |

**User's choice:** 顶歌移动到当前播放之后的第一位，不打断当前歌曲。
**Notes:** 采用推荐项。

### 切歌语义

| Option | Description | Selected |
|--------|-------------|----------|
| 切当前歌后立即推进下一首，队列空则 idle | 行为明确 | ✓ |
| 切当前歌后暂停等待用户点下一首 | 更保守 | |
| 只标记 skipped，由 TV 心跳推进 | 延迟更大 | |

**User's choice:** 切当前歌后立即推进下一首；队列空则回 `idle`。
**Notes:** 采用推荐项。

### 播放结束自动推进

| Option | Description | Selected |
|--------|-------------|----------|
| TV 上报 ended 后服务端立即推进下一首 | KTV 队列连续播放 | ✓ |
| 等手机端发下一首命令 | 更手动 | |
| 延迟几秒展示结束状态再推进 | 有过渡但拖慢流程 | |

**User's choice:** TV 上报 `ended` 后，服务端立即推进下一首并生成新 target。
**Notes:** 采用推荐项。

### 并发命令冲突

| Option | Description | Selected |
|--------|-------------|----------|
| 按 session version / command id 做幂等和冲突拒绝 | 服务端权威 | ✓ |
| 最后写入者覆盖 | 简单但易漂移 | |
| 手机端本地乐观更新为主 | 容易和服务端真相冲突 | |

**User's choice:** 服务端按 `sessionVersion` / `commandId` 做幂等和冲突拒绝，客户端收到最新 snapshot 后刷新。
**Notes:** 采用推荐项。

---

## 管理员二维码 / token 管理

### 管理员刷新 token 的位置

| Option | Description | Selected |
|--------|-------------|----------|
| Admin 房间状态页提供刷新入口 | 管理路径清晰 | ✓ |
| 只提供 API，不做 Admin UI | 实现更少但不便用 | |
| TV 屏幕也提供隐藏入口 | 增加 TV 操作复杂度 | |

**User's choice:** Admin 房间状态页提供刷新入口。
**Notes:** 采用推荐项。

### 刷新 token 后旧二维码

| Option | Description | Selected |
|--------|-------------|----------|
| 旧 token 立即失效；既有控制会话不受影响 | 清晰且不打断已入场用户 | ✓ |
| 旧 token 保留 1 分钟重叠期 | 降低误伤但状态复杂 | |
| 同时踢掉所有控制端 | 严格但体验差 | |

**User's choice:** 旧 token 立即失效；既有控制会话不受影响。
**Notes:** 采用推荐项。

### Admin 展示信息

| Option | Description | Selected |
|--------|-------------|----------|
| token 过期时间、在线控制端数量、TV 在线状态、当前队列摘要 | 管理所需最小信息 | ✓ |
| 只展示 token 和二维码 | 信息不足 | |
| 完整控制端设备列表和操作历史 | 更完整但超出 Phase 3 必要范围 | |

**User's choice:** 展示 token 过期时间、在线控制端数量、TV 在线状态、当前队列摘要。
**Notes:** 采用推荐项。

### 控制会话闲置超时

| Option | Description | Selected |
|--------|-------------|----------|
| 2 小时无活动后过期 | 家庭场景够宽松 | ✓ |
| 30 分钟无活动后过期 | 更严格 | |
| 当天内一直有效，到次日清理 | 更宽松 | |

**User's choice:** 控制会话 2 小时无活动后过期。
**Notes:** 采用推荐项。

---

## the agent's Discretion

- 具体 WebSocket envelope、重连退避、低频轮询间隔、命令幂等保存期限和前端离线提示样式由后续 planning / implementation 决定。

## Deferred Ideas

- 完整中文搜索、多版本点歌选择、在线补歌缓存、播放失败备用资源回退和细粒度权限模型不进入 Phase 3。
