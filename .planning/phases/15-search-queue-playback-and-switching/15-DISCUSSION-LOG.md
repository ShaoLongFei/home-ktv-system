# Phase 15: Search, Queue, Playback, and Switching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 15-search-queue-playback-and-switching
**Areas discussed:** Queue default vocal mode, single-asset switching, runtime failure behavior, unavailable/preprocess state

---

## Queue Default Vocal Mode

| Option | Description | Selected |
|--------|-------------|----------|
| Default accompaniment | Queue accompaniment when confirmed; block if no accompaniment track exists. | |
| Prompt original/accompaniment while queueing | User chooses mode every time they queue a real-MV song. | |
| Follow current playback mode | Queue mode follows the current room playback state: accompaniment when accompaniment is active, otherwise original. | yes |

**User's choice:** 点歌时不选择伴唱还是原唱，此状态依据当时播放的状态，如果用户开了伴唱就用伴唱，没开就用原唱。
**Notes:** The context records a fallback assumption that when no current playback state exists, accompaniment is the KTV-safe default unless existing code exposes a stronger room-level default.

---

## Single-Asset Switching

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing switch flow | Reuse `switch-vocal-mode` and switch transition semantics, but support same-Asset `selectedTrackRef` switching. | yes |
| Add real-MV-only switch command | Create a separate command and runtime path for single-file track switching. | |
| Defer switching | Phase 15 plays real MV but does not implement original/accompaniment switching. | |

**User's choice:** 扩展现有切换链路支持“同一 Asset 内切 trackRef”。
**Notes:** Existing session-version, realtime, telemetry, rollback, and conflict behavior should stay intact.

---

## Runtime Failure Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Disable until verified | Disable switch button until the TV runtime has verified capability. | |
| Always clickable with rollback | Button can be clicked; if the TV cannot switch tracks, playback remains/reverts and shows a clear message. | yes |
| Hide unsupported control | Hide switch button when unsupported. | |

**User's choice:** 按钮始终可点，失败后回退并提示。
**Notes:** This is reconciled with capability gating by treating the click as a runtime switch attempt. TV commits only when the audio-track switch actually succeeds.

---

## Unavailable And Preprocess State

| Option | Description | Selected |
|--------|-------------|----------|
| Disabled in search, details in Admin | Search keeps songs visible but disables queue action with "需预处理/暂不可播放"; Admin retains details. | yes |
| Detailed compatibility in search | Mobile search also shows low-level codec/probe reasons. | |
| Hide unavailable songs | Search hides songs that are not queueable. | |

**User's choice:** 搜索页不允许点歌，显示“需预处理/暂不可播放”；Admin 保留详细原因。
**Notes:** Mobile should stay simple. Detailed compatibility reasons remain in Admin.

---

## the agent's Discretion

- Exact same-Asset switch target schema.
- Exact Chinese copy and visual layout for disabled Mobile search rows.
- Exact audio-track API implementation and fallback behavior inside TV runtime.

## Deferred Ideas

- Native Android TV app and native track switching.
- Automatic transcoding/remuxing.
- Media acquisition or download workflows.
