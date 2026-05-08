import type { PlaybackNotice, RoomSnapshot } from "@home-ktv/player-contracts";

export type TvDisplayKind = "booting" | "offline" | "waiting" | "idle" | "loading" | "playing" | "recovering" | "conflict";

export interface FirstPlayPromptModel {
  visible: boolean;
  heading: string;
  body: string;
}

export interface TvDisplayState {
  kind: TvDisplayKind;
  heading: string;
  detail: string;
  stateLabel: string;
  tone: "neutral" | "ready" | "warning" | "danger";
  firstPlayPrompt: FirstPlayPromptModel;
}

export const firstPlayPromptCopy = {
  heading: "点击电视开始播放",
  body: "浏览器需要一次点击授权播放声音，点击后会继续当前歌曲。"
} as const;

const hiddenFirstPlayPrompt: FirstPlayPromptModel = {
  ...firstPlayPromptCopy,
  visible: false
};

const noticeFallbackCopy: Record<PlaybackNotice["kind"], string> = {
  loading: "正在准备播放",
  recovering: "正在恢复播放",
  switch_failed_reverted: "切换失败，已恢复到原模式",
  playback_failed_skipped: "播放失败，已跳到下一首",
  recovery_fallback_start_over: "已恢复播放，本首从头开始"
};

export function formatPlaybackClock(positionMs: number, durationMs: number | null): string {
  return `${formatClockPart(positionMs)} / ${durationMs == null || !Number.isFinite(durationMs) ? "--:--" : formatClockPart(durationMs)}`;
}

export function noticeCopyFor(notice: PlaybackNotice | null): string | null {
  if (!notice) {
    return null;
  }

  if (notice.message.trim() && /[\u4E00-\u9FFF]/u.test(notice.message)) {
    return notice.message;
  }

  return noticeFallbackCopy[notice.kind];
}

export function deriveTvDisplayState(input: {
  status: "booting" | "ready" | "error";
  snapshot: RoomSnapshot | null;
  errorMessage: string | null;
  firstPlayBlocked: boolean;
}): TvDisplayState {
  if (input.status === "booting") {
    return baseState({
      detail: "正在准备客厅电视播放环境。",
      heading: "正在启动电视端",
      kind: "booting",
      stateLabel: "启动中",
      tone: "neutral"
    });
  }

  if (input.status === "error") {
    return baseState({
      detail: "请检查后台服务和电视网络，然后刷新电视页面。",
      heading: "电视端离线",
      kind: "offline",
      stateLabel: "离线",
      tone: "danger"
    });
  }

  if (!input.snapshot) {
    return baseState({
      detail: "电视端正在等待服务端房间快照。",
      heading: "等待房间状态",
      kind: "waiting",
      stateLabel: "等待中",
      tone: "warning"
    });
  }

  if (input.snapshot.conflict || input.snapshot.state === "conflict") {
    return baseState({
      detail: "请先关闭当前在线的电视端，再刷新这个页面。",
      heading: "已有电视端在线",
      kind: "conflict",
      stateLabel: "冲突",
      tone: "danger"
    });
  }

  if (input.snapshot.state === "error") {
    return baseState({
      detail: "请检查后台服务和电视网络，然后刷新电视页面。",
      heading: "电视端离线",
      kind: "offline",
      stateLabel: "离线",
      tone: "danger"
    });
  }

  const firstPlayPrompt = input.firstPlayBlocked && input.snapshot.currentTarget
    ? { ...firstPlayPromptCopy, visible: true }
    : hiddenFirstPlayPrompt;

  if (input.snapshot.state === "idle") {
    return baseState({
      detail: "用手机扫码进入点歌台，电视只负责播放和显示状态。",
      firstPlayPrompt,
      heading: "扫码点歌",
      kind: "idle",
      stateLabel: "待点歌",
      tone: "ready"
    });
  }

  if (input.snapshot.state === "loading") {
    return baseState({
      detail: "歌曲即将开始。",
      firstPlayPrompt,
      heading: "正在准备播放",
      kind: "loading",
      stateLabel: "准备中",
      tone: "warning"
    });
  }

  if (input.snapshot.state === "recovering") {
    return baseState({
      detail: "正在恢复当前歌曲和播放进度。",
      firstPlayPrompt,
      heading: "正在恢复播放",
      kind: "recovering",
      stateLabel: "恢复中",
      tone: "warning"
    });
  }

  return baseState({
    detail: "当前歌曲正在播放。",
    firstPlayPrompt,
    heading: "播放中",
    kind: "playing",
    stateLabel: "播放中",
    tone: "ready"
  });
}

function baseState(input: Omit<TvDisplayState, "firstPlayPrompt"> & { firstPlayPrompt?: FirstPlayPromptModel }): TvDisplayState {
  return {
    ...input,
    firstPlayPrompt: input.firstPlayPrompt ?? hiddenFirstPlayPrompt
  };
}

function formatClockPart(valueMs: number): string {
  const safe = Math.max(0, Math.trunc(valueMs));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
