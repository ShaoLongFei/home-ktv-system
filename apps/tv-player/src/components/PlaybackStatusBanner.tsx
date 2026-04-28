import type { PlaybackNotice, PlaybackNoticeKind } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";

export const playbackStatusCopy: Record<PlaybackNoticeKind, string> = {
  loading: "Loading the next song.",
  recovering: "Reconnecting playback and restoring the song.",
  switch_failed_reverted: "Switch failed. Playback returned to the previous vocal mode.",
  recovery_fallback_start_over: "Playback reconnected, but this song restarted from the beginning."
};

export interface PlaybackStatusBannerProps {
  notice: PlaybackNotice | null;
}

export function PlaybackStatusBanner({ notice }: PlaybackStatusBannerProps) {
  if (!notice) {
    return null;
  }

  return (
    <aside role="status" style={styles.banner}>
      <span style={styles.pill}>{notice.kind.replaceAll("_", " ")}</span>
      <span>{notice.message || playbackStatusCopy[notice.kind]}</span>
    </aside>
  );
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
    fontSize: "clamp(18px, 2vw, 24px)",
    fontWeight: 800,
    gap: 18,
    padding: "14px 22px"
  },
  pill: {
    background: "#f2c84b",
    borderRadius: 999,
    color: "#11140f",
    fontSize: 14,
    fontWeight: 900,
    padding: "8px 12px",
    textTransform: "uppercase"
  }
} satisfies Record<string, CSSProperties>;
