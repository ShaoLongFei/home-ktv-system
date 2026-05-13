import type { RoomSnapshot } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { PairingQr } from "../components/PairingQr.js";
import { PlaybackStatusBanner } from "../components/PlaybackStatusBanner.js";
import { formatPlaybackClock, type TvDisplayState } from "./tv-display-model.js";
import { tvTheme } from "../theme.js";

export interface PlayingScreenProps {
  displayState: TvDisplayState;
  snapshot: RoomSnapshot;
  playbackPositionMs: number;
  durationMs: number | null;
}

export function PlayingScreen({ displayState, snapshot, playbackPositionMs, durationMs }: PlayingScreenProps) {
  const target = snapshot.currentTarget;
  const nextSong = target?.nextQueueEntryPreview;
  const modeLabel = modeLabelFor(target?.vocalMode ?? "unknown");
  const clock = formatPlaybackClock(playbackPositionMs, durationMs);
  const nextSongLabel = nextSong ? `${nextSong.songTitle} - ${nextSong.artistName}` : "暂无下一首";

  return (
    <section style={styles.screen}>
      <div style={styles.topRail}>
        <div style={styles.statusSlot}>
          <PlaybackStatusBanner notice={snapshot.notice} />
        </div>
        <PairingQr pairing={snapshot.pairing} variant="corner" />
      </div>
      <div style={styles.nowPlaying}>
        <p style={styles.kicker}>当前播放</p>
        <h1 style={styles.title}>{target?.currentQueueEntryPreview.songTitle ?? displayState.heading}</h1>
        <p style={styles.artist}>{target?.currentQueueEntryPreview.artistName ?? displayState.detail}</p>
      </div>
      <footer style={styles.footer}>
        <div style={styles.footerMetric}>
          <span style={styles.metricLabel}>模式</span>
          <span style={{ ...styles.metricValue, ...modeAccent(target?.vocalMode ?? "unknown") }}>{modeLabel}</span>
        </div>
        <div style={styles.footerMetric}>
          <span style={styles.metricLabel}>状态</span>
          <span style={{ ...styles.metricValue, ...stateAccent(displayState.tone) }}>{displayState.stateLabel}</span>
        </div>
        <div style={styles.footerMetricTime}>
          <span style={styles.metricLabel}>时间</span>
          <span style={styles.timeValue}>{clock}</span>
        </div>
        <div style={styles.footerMetricWide}>
          <span style={styles.metricLabel}>下一首</span>
          <span style={styles.nextValue}>{nextSongLabel}</span>
        </div>
      </footer>
      {displayState.firstPlayPrompt.visible ? (
        <div role="status" style={styles.firstPlayPrompt}>
          <h2 aria-label="点击电视开始播放" style={styles.promptHeading}>
            {displayState.firstPlayPrompt.heading}
          </h2>
          <p style={styles.promptBody}>{displayState.firstPlayPrompt.body}</p>
        </div>
      ) : null}
    </section>
  );
}

function modeLabelFor(vocalMode: string): string {
  if (vocalMode === "original") {
    return "原唱";
  }

  if (vocalMode === "instrumental") {
    return "伴唱";
  }

  if (vocalMode === "dual") {
    return "双轨";
  }

  return "未识别";
}

function modeAccent(vocalMode: string): CSSProperties {
  if (vocalMode === "original") {
    return {
      background: "rgba(52, 211, 153, 0.16)",
      borderColor: "rgba(52, 211, 153, 0.38)",
      color: tvTheme.colors.success
    };
  }

  if (vocalMode === "instrumental") {
    return {
      background: "rgba(34, 211, 238, 0.14)",
      borderColor: "rgba(34, 211, 238, 0.36)",
      color: tvTheme.colors.accent
    };
  }

  return {
    background: "rgba(148, 163, 184, 0.12)",
    borderColor: tvTheme.colors.border,
    color: tvTheme.colors.text
  };
}

function stateAccent(tone: TvDisplayState["tone"]): CSSProperties {
  if (tone === "danger") {
    return {
      background: "rgba(248, 113, 113, 0.16)",
      borderColor: "rgba(248, 113, 113, 0.38)",
      color: tvTheme.colors.danger
    };
  }

  if (tone === "warning") {
    return {
      background: "rgba(251, 191, 36, 0.16)",
      borderColor: "rgba(251, 191, 36, 0.4)",
      color: tvTheme.colors.warning
    };
  }

  if (tone === "ready") {
    return {
      background: "rgba(52, 211, 153, 0.16)",
      borderColor: "rgba(52, 211, 153, 0.38)",
      color: tvTheme.colors.success
    };
  }

  return {
    background: "rgba(148, 163, 184, 0.12)",
    borderColor: tvTheme.colors.border,
    color: tvTheme.colors.text
  };
}

const styles = {
  screen: {
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    minHeight: "100vh",
    padding: "48px 64px",
    position: "relative"
  },
  topRail: {
    alignItems: "start",
    display: "flex",
    gap: 24,
    justifyContent: "space-between",
    minHeight: 156,
    minWidth: 0
  },
  statusSlot: {
    minWidth: 0
  },
  nowPlaying: {
    alignSelf: "center",
    maxWidth: 1120,
    minWidth: 0
  },
  kicker: {
    color: tvTheme.colors.accent,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0,
    margin: "0 0 22px",
    textTransform: "none"
  },
  title: {
    color: tvTheme.colors.text,
    fontFamily: tvTheme.fonts.heading,
    fontSize: 108,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 0.96,
    margin: 0,
    maxWidth: 1120,
    overflowWrap: "anywhere"
  },
  artist: {
    color: tvTheme.colors.textMuted,
    fontSize: 40,
    fontWeight: 800,
    lineHeight: 1.15,
    margin: "28px 0 0",
    overflowWrap: "anywhere"
  },
  footer: {
    alignItems: "stretch",
    backdropFilter: "blur(18px)",
    background: tvTheme.colors.surface,
    border: `1px solid ${tvTheme.colors.border}`,
    borderRadius: tvTheme.radii.panel,
    boxShadow: "0 18px 64px rgba(0, 0, 0, 0.32)",
    color: tvTheme.colors.text,
    display: "grid",
    gap: 16,
    gridTemplateColumns: "minmax(96px, auto) minmax(104px, auto) minmax(190px, auto) minmax(0, 1fr)",
    minWidth: 0,
    padding: "20px 24px"
  },
  footerMetric: {
    display: "grid",
    gap: 8,
    minWidth: 0
  },
  footerMetricTime: {
    display: "grid",
    gap: 8,
    minWidth: 190
  },
  footerMetricWide: {
    display: "grid",
    gap: 8,
    minWidth: 0
  },
  metricLabel: {
    color: tvTheme.colors.textWeak,
    fontSize: 18,
    fontWeight: 850,
    letterSpacing: 0,
    textTransform: "none"
  },
  metricValue: {
    alignItems: "center",
    border: `1px solid ${tvTheme.colors.border}`,
    borderRadius: tvTheme.radii.panel,
    display: "inline-flex",
    fontSize: 26,
    fontWeight: 900,
    justifyContent: "center",
    lineHeight: 1,
    minHeight: 60,
    minWidth: 92,
    padding: "12px 18px",
    textAlign: "center",
    width: "fit-content",
    overflowWrap: "anywhere"
  },
  timeValue: {
    alignItems: "center",
    border: `1px solid ${tvTheme.colors.border}`,
    borderRadius: 8,
    color: tvTheme.colors.text,
    display: "inline-flex",
    fontSize: 28,
    fontWeight: 950,
    justifyContent: "center",
    lineHeight: 1,
    minHeight: 60,
    minWidth: 190,
    padding: "12px 18px",
    whiteSpace: "nowrap"
  },
  nextValue: {
    alignItems: "center",
    border: `1px solid ${tvTheme.colors.border}`,
    borderRadius: 8,
    color: tvTheme.colors.text,
    display: "inline-flex",
    fontSize: 26,
    fontWeight: 900,
    justifyContent: "flex-start",
    lineHeight: 1,
    minHeight: 60,
    minWidth: 0,
    overflow: "hidden",
    padding: "12px 18px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  firstPlayPrompt: {
    backdropFilter: "blur(18px)",
    background: tvTheme.colors.surface,
    border: "1px solid rgba(251, 191, 36, 0.46)",
    borderRadius: tvTheme.radii.panel,
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.42)",
    left: "50%",
    maxWidth: 720,
    padding: "28px 32px",
    position: "absolute",
    textAlign: "center",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(720px, calc(100vw - 128px))"
  },
  promptHeading: {
    color: tvTheme.colors.warning,
    fontSize: 44,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 1.08,
    margin: 0,
    overflowWrap: "anywhere"
  },
  promptBody: {
    color: tvTheme.colors.text,
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.25,
    margin: "18px 0 0",
    overflowWrap: "anywhere"
  }
} satisfies Record<string, CSSProperties>;
