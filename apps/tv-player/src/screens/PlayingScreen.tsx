import type { RoomSnapshot } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { PairingQr } from "../components/PairingQr.js";
import { PlaybackStatusBanner } from "../components/PlaybackStatusBanner.js";

export interface PlayingScreenProps {
  snapshot: RoomSnapshot;
}

export function PlayingScreen({ snapshot }: PlayingScreenProps) {
  const target = snapshot.currentTarget;
  const nextSong = target?.nextQueueEntryPreview;

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
        <span>Mode: {target?.vocalMode ?? "unknown"}</span>
        <span>Next: {nextSong ? `${nextSong.songTitle} - ${nextSong.artistName}` : "queue empty"}</span>
      </footer>
    </section>
  );
}

const styles = {
  screen: {
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    minHeight: "100vh",
    padding: "clamp(28px, 5vh, 64px) clamp(32px, 6vw, 88px)"
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
    fontSize: "clamp(22px, 2.6vw, 34px)",
    fontWeight: 900,
    letterSpacing: 1.2,
    margin: "0 0 22px",
    textTransform: "uppercase"
  },
  title: {
    color: "#fff8e7",
    fontSize: "clamp(64px, 10vw, 148px)",
    fontWeight: 950,
    letterSpacing: -4,
    lineHeight: 0.92,
    margin: 0
  },
  artist: {
    color: "#d9d0b8",
    fontSize: "clamp(30px, 4vw, 54px)",
    fontWeight: 800,
    margin: "28px 0 0"
  },
  footer: {
    alignItems: "center",
    background: "rgba(17, 20, 15, 0.72)",
    border: "1px solid rgba(255, 248, 231, 0.14)",
    borderRadius: 28,
    color: "#fff8e7",
    display: "flex",
    fontSize: "clamp(20px, 2.4vw, 30px)",
    fontWeight: 850,
    justifyContent: "space-between",
    padding: "24px 32px"
  }
} satisfies Record<string, CSSProperties>;
