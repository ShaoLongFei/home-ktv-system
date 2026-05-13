import type { PlaybackNotice } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { firstPlayPromptCopy, noticeCopyFor } from "../screens/tv-display-model.js";
import { tvTheme } from "../theme.js";

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
      <span style={{ ...styles.pill, ...noticeTone(notice) }}>{noticeLabelFor(notice)}</span>
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

function noticeTone(notice: PlaybackNotice): CSSProperties {
  if (notice.kind === "playback_failed_skipped" || notice.kind === "switch_failed_reverted") {
    return {
      background: `rgba(248, 113, 113, 0.18)`,
      borderColor: "rgba(248, 113, 113, 0.42)",
      color: tvTheme.colors.danger
    };
  }

  if (notice.kind === "recovery_fallback_start_over") {
    return {
      background: "rgba(52, 211, 153, 0.16)",
      borderColor: "rgba(52, 211, 153, 0.38)",
      color: tvTheme.colors.success
    };
  }

  return {
    background: "rgba(251, 191, 36, 0.16)",
    borderColor: "rgba(251, 191, 36, 0.4)",
    color: tvTheme.colors.warning
  };
}

const styles = {
  banner: {
    alignItems: "center",
    backdropFilter: "blur(16px)",
    background: tvTheme.colors.surface,
    border: `1px solid ${tvTheme.colors.border}`,
    borderRadius: tvTheme.radii.pill,
    color: tvTheme.colors.text,
    display: "flex",
    fontSize: 20,
    fontWeight: 800,
    gap: 18,
    maxWidth: "min(760px, 100%)",
    minWidth: 0,
    padding: "14px 22px"
  },
  pill: {
    border: "1px solid transparent",
    borderRadius: tvTheme.radii.pill,
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
