import type { PlaybackNotice } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { firstPlayPromptCopy, noticeCopyFor } from "../screens/tv-display-model.js";

export interface PlaybackStatusBannerProps {
  notice: PlaybackNotice | null;
}

export function PlaybackStatusBanner({ notice }: PlaybackStatusBannerProps) {
  const copy = noticeCopyFor(notice);
  if (!notice || !copy || (notice.kind === "loading" && copy === firstPlayPromptCopy.heading)) {
    return null;
  }

  return (
    <aside role="status" style={styles.banner}>
      <span style={styles.pill}>{noticeLabelFor(notice)}</span>
      <span style={styles.message}>{copy}</span>
    </aside>
  );
}

function noticeLabelFor(notice: PlaybackNotice): string {
  if (notice.kind === "loading") {
    return "准备中";
  }

  if (notice.kind === "switch_failed_reverted") {
    return "已回退";
  }

  if (notice.kind === "playback_failed_skipped") {
    return "已跳过";
  }

  if (notice.kind === "recovery_fallback_start_over") {
    return "已恢复";
  }

  return "提示";
}

const styles = {
  banner: {
    alignItems: "center",
    backdropFilter: "blur(16px)",
    background: "rgba(255, 248, 231, 0.12)",
    border: "1px solid rgba(255, 248, 231, 0.22)",
    borderRadius: 999,
    color: "#fff8e7",
    display: "flex",
    fontSize: 20,
    fontWeight: 800,
    gap: 18,
    maxWidth: "min(760px, 100%)",
    minWidth: 0,
    padding: "14px 22px"
  },
  pill: {
    background: "#f2c84b",
    borderRadius: 999,
    color: "#11140f",
    fontSize: 14,
    fontWeight: 900,
    padding: "8px 12px",
    whiteSpace: "nowrap"
  },
  message: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  }
} satisfies Record<string, CSSProperties>;
