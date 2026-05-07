import type { RoomSnapshot } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { PairingQr } from "../components/PairingQr.js";
import { PlaybackStatusBanner } from "../components/PlaybackStatusBanner.js";

export interface PlayingScreenProps {
  snapshot: RoomSnapshot;
  playbackPositionMs: number;
  durationMs: number | null;
}

export function PlayingScreen({ snapshot, playbackPositionMs, durationMs }: PlayingScreenProps) {
  const target = snapshot.currentTarget;
  const nextSong = target?.nextQueueEntryPreview;
  const modeLabel = modeLabelFor(target?.vocalMode ?? "unknown");

  return (
    <section style={styles.screen}>
      <div style={styles.topRail}>
        <PlaybackStatusBanner notice={snapshot.notice} />
        <PairingQr pairing={snapshot.pairing} variant="corner" />
      </div>
      <div style={styles.nowPlaying}>
        <p style={styles.kicker}>now singing</p>
        <h1 style={styles.title}>{target?.currentQueueEntryPreview.songTitle ?? "Loading song"}</h1>
        <p style={styles.artist}>{target?.currentQueueEntryPreview.artistName ?? "Preparing playback"}</p>
      </div>
      <footer style={styles.footer}>
        <div style={styles.footerMetric}>
          <span style={styles.metricLabel}>Mode</span>
          <span style={{ ...styles.metricValue, ...modeAccent(target?.vocalMode ?? "unknown") }}>{modeLabel}</span>
        </div>
        <div style={styles.footerMetric}>
          <span style={styles.metricLabel}>Time</span>
          <span style={styles.metricValue}>{formatTime(playbackPositionMs)} / {formatTime(durationMs ?? 0)}</span>
        </div>
        <div style={styles.footerMetricWide}>
          <span style={styles.metricLabel}>Next</span>
          <span style={styles.metricValue}>{nextSong ? `${nextSong.songTitle} - ${nextSong.artistName}` : "queue empty"}</span>
        </div>
      </footer>
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

  return "unknown";
}

function modeAccent(vocalMode: string): CSSProperties {
  if (vocalMode === "original") {
    return {
      background: "rgba(143, 230, 173, 0.18)",
      borderColor: "rgba(143, 230, 173, 0.35)",
      color: "#b5f5c5"
    };
  }

  if (vocalMode === "instrumental") {
    return {
      background: "rgba(242, 200, 75, 0.18)",
      borderColor: "rgba(242, 200, 75, 0.35)",
      color: "#ffe39d"
    };
  }

  return {
    background: "rgba(255, 248, 231, 0.08)",
    borderColor: "rgba(255, 248, 231, 0.16)",
    color: "#fff8e7"
  };
}

function formatTime(valueMs: number): string {
  const safe = Math.max(0, Math.trunc(valueMs));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const styles = {
  screen: {
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    minHeight: "100vh",
    padding: "48px 64px"
  },
  topRail: {
    alignItems: "start",
    display: "flex",
    justifyContent: "space-between",
    minHeight: 156
  },
  nowPlaying: {
    alignSelf: "center",
    maxWidth: 1120
  },
  kicker: {
    color: "#f2c84b",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 1.2,
    margin: "0 0 22px",
    textTransform: "uppercase"
  },
  title: {
    color: "#fff8e7",
    fontSize: 108,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 0.96,
    margin: 0,
    overflowWrap: "anywhere"
  },
  artist: {
    color: "#d9d0b8",
    fontSize: 40,
    fontWeight: 800,
    lineHeight: 1.15,
    margin: "28px 0 0",
    overflowWrap: "anywhere"
  },
  footer: {
    alignItems: "stretch",
    background: "rgba(17, 20, 15, 0.72)",
    border: "1px solid rgba(255, 248, 231, 0.14)",
    borderRadius: 24,
    color: "#fff8e7",
    display: "grid",
    gap: 20,
    gridTemplateColumns: "auto auto 1fr",
    padding: "22px 28px"
  },
  footerMetric: {
    display: "grid",
    gap: 8
  },
  footerMetricWide: {
    display: "grid",
    gap: 8,
    minWidth: 0
  },
  metricLabel: {
    color: "#d9d0b8",
    fontSize: 18,
    fontWeight: 850,
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  metricValue: {
    alignItems: "center",
    border: "1px solid rgba(255, 248, 231, 0.14)",
    borderRadius: 16,
    display: "inline-flex",
    fontSize: 26,
    fontWeight: 900,
    justifyContent: "center",
    maxWidth: "100%",
    lineHeight: 1,
    minHeight: 60,
    padding: "12px 18px",
    textAlign: "center",
    width: "fit-content",
    overflowWrap: "anywhere"
  }
} satisfies Record<string, CSSProperties>;
