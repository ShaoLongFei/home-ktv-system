import type { PlaybackTarget } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";

type TvRuntimeState = "booting" | "idle" | "playing" | "conflict";

const runtimeState: TvRuntimeState = "idle";

function createStateCopy(activeTarget: PlaybackTarget | null): Record<TvRuntimeState, { title: string; detail: string }> {
  return {
    booting: {
      title: "Starting player",
      detail: "Preparing the room display"
    },
    idle: {
      title: "Living Room KTV",
      detail: "Scan to join from your phone"
    },
    playing: {
      title: activeTarget?.queueEntryId ?? "Current song",
      detail: activeTarget ? `${activeTarget.vocalMode} mode` : "Waiting for playback target"
    },
    conflict: {
      title: "Player already online",
      detail: "This screen cannot take over the room"
    }
  };
}

function readInitialPlaybackTarget(): PlaybackTarget | null {
  return null;
}

function QrMark() {
  return (
    <div aria-label="Room pairing QR" style={styles.qr}>
      {Array.from({ length: 25 }).map((_, index) => (
        <span key={index} style={index % 2 === 0 || index % 7 === 0 ? styles.qrDotActive : styles.qrDot} />
      ))}
    </div>
  );
}

export function App() {
  const activeTarget = readInitialPlaybackTarget();
  const stateCopy = createStateCopy(activeTarget);
  const copy = stateCopy[runtimeState];

  return (
    <main style={styles.screen}>
      <section style={styles.stage}>
        <div style={styles.nowPlaying}>
          <p style={styles.kicker}>{runtimeState}</p>
          <h1 style={styles.title}>{copy.title}</h1>
          <p style={styles.detail}>{copy.detail}</p>
        </div>
        <aside style={styles.panel}>
          <QrMark />
          <div>
            <p style={styles.panelLabel}>Room</p>
            <p style={styles.room}>living-room</p>
          </div>
        </aside>
      </section>
      <footer style={styles.footer}>
        <span>Next: queue empty</span>
        <span>Mode: {activeTarget?.vocalMode ?? "instrumental"}</span>
      </footer>
    </main>
  );
}

const styles = {
  screen: {
    minHeight: "100vh",
    width: "100vw",
    background: "#090b08",
    color: "#f7f1df",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    overflow: "hidden"
  },
  stage: {
    flex: 1,
    display: "grid",
    alignItems: "center",
    gap: "clamp(24px, 5vw, 48px)",
    gridTemplateColumns: "minmax(0, 1fr) minmax(180px, 280px)",
    padding: "clamp(32px, 8vh, 96px) clamp(24px, 6vw, 84px)"
  },
  nowPlaying: {
    maxWidth: 980
  },
  kicker: {
    margin: "0 0 24px",
    color: "#f0c64a",
    fontSize: 28,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0
  },
  title: {
    margin: 0,
    fontSize: "clamp(44px, 7vw, 84px)",
    lineHeight: 1,
    letterSpacing: 0,
    fontWeight: 900
  },
  detail: {
    margin: "28px 0 0",
    color: "#d9d1bd",
    fontSize: "clamp(22px, 3vw, 34px)",
    lineHeight: 1.25
  },
  panel: {
    display: "grid",
    gap: 24,
    justifyItems: "center"
  },
  qr: {
    width: "clamp(132px, 18vw, 196px)",
    aspectRatio: "1",
    background: "#f7f1df",
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 10,
    padding: 18
  },
  qrDot: {
    background: "#f7f1df"
  },
  qrDotActive: {
    background: "#090b08"
  },
  panelLabel: {
    margin: 0,
    color: "#80d99b",
    fontSize: 18,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0
  },
  room: {
    margin: "8px 0 0",
    fontSize: 28,
    fontWeight: 800,
    textAlign: "center",
    letterSpacing: 0
  },
  footer: {
    minHeight: 76,
    padding: "0 6vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#f7f1df",
    background: "#161812",
    fontSize: "clamp(18px, 2vw, 24px)",
    fontWeight: 700
  }
} satisfies Record<string, CSSProperties>;
