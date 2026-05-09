import type { RoomSnapshot } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { useRef } from "react";
import { ConflictScreen } from "./screens/ConflictScreen.js";
import { IdleScreen } from "./screens/IdleScreen.js";
import { PlayingScreen } from "./screens/PlayingScreen.js";
import { useTvPlaybackRuntime } from "./runtime/use-tv-playback-runtime.js";
import { deriveTvDisplayState, type TvDisplayState } from "./screens/tv-display-model.js";

export function App() {
  const activeVideoRef = useRef<HTMLVideoElement>(null);
  const standbyVideoRef = useRef<HTMLVideoElement>(null);
  const runtime = useTvPlaybackRuntime({ activeVideoRef, standbyVideoRef });

  return (
    <main style={styles.shell}>
      <video ref={activeVideoRef} onEnded={runtime.handleVideoEnded} playsInline preload="auto" style={styles.video} />
      <video ref={standbyVideoRef} onEnded={runtime.handleVideoEnded} playsInline preload="auto" style={styles.video} />
      <div style={styles.atmosphere} />
      <div style={styles.content}>
        {renderScreen(
          runtime.roomState.status,
          runtime.snapshot,
          runtime.roomState.errorMessage,
          runtime.playbackPositionMs,
          runtime.durationMs,
          runtime.firstPlayBlocked
        )}
      </div>
    </main>
  );
}

function renderScreen(
  status: "booting" | "ready" | "error",
  snapshot: RoomSnapshot | null,
  errorMessage: string | null,
  playbackPositionMs: number,
  durationMs: number | null,
  firstPlayBlocked: boolean
) {
  const displayState = deriveTvDisplayState({
    errorMessage,
    firstPlayBlocked,
    snapshot,
    status
  });

  if (status === "booting") {
    return <SystemScreen displayState={displayState} />;
  }

  if (status === "error") {
    return <SystemScreen displayState={displayState} />;
  }

  if (!snapshot) {
    return <SystemScreen displayState={displayState} />;
  }

  if (snapshot.conflict) {
    return <ConflictScreen conflict={snapshot.conflict} displayState={displayState} />;
  }

  if (snapshot.state === "error") {
    return <SystemScreen displayState={displayState} />;
  }

  if (snapshot.state === "playing" || snapshot.state === "loading" || snapshot.state === "recovering") {
    return <PlayingScreen displayState={displayState} snapshot={snapshot} playbackPositionMs={playbackPositionMs} durationMs={durationMs} />;
  }

  return <IdleScreen displayState={displayState} pairing={snapshot.pairing} />;
}

function SystemScreen({ displayState }: { displayState: TvDisplayState }) {
  return (
    <section style={styles.systemScreen}>
      <p style={styles.systemKicker}>家庭 KTV</p>
      <h1 style={styles.systemTitle}>{displayState.heading}</h1>
      <p style={styles.systemDetail}>{displayState.detail}</p>
    </section>
  );
}

const styles = {
  shell: {
    background: "linear-gradient(135deg, #050604 0%, #11140f 54%, #070806 100%)",
    color: "#fff8e7",
    fontFamily: "Avenir Next, Futura, Gill Sans, Trebuchet MS, sans-serif",
    minHeight: "100vh",
    overflow: "hidden",
    position: "relative",
    width: "100vw"
  },
  atmosphere: {
    background:
      "linear-gradient(90deg, rgba(255, 248, 231, 0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(255, 248, 231, 0.03) 1px, transparent 1px)",
    backgroundSize: "42px 42px",
    inset: 0,
    opacity: 0.42,
    pointerEvents: "none",
    position: "absolute"
  },
  content: {
    minHeight: "100vh",
    position: "relative",
    zIndex: 1
  },
  video: {
    background: "#050604",
    height: "100vh",
    inset: 0,
    objectFit: "contain",
    position: "absolute",
    width: "100vw",
    zIndex: 0
  },
  systemScreen: {
    display: "grid",
    minHeight: "100vh",
    placeContent: "center",
    padding: "64px"
  },
  systemKicker: {
    color: "#8fe6ad",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 1.5,
    margin: "0 0 24px",
    textTransform: "uppercase"
  },
  systemTitle: {
    color: "#fff8e7",
    fontSize: 96,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 0.94,
    margin: 0,
    overflowWrap: "anywhere"
  },
  systemDetail: {
    color: "#d9d0b8",
    fontSize: 34,
    lineHeight: 1.24,
    margin: "30px 0 0",
    maxWidth: 880,
    overflowWrap: "anywhere"
  }
} satisfies Record<string, CSSProperties>;
