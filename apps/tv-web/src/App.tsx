import type { RoomSnapshot } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { InteractionOverlay } from "./components/InteractionOverlay.js";
import { IdleScreen } from "./screens/IdleScreen.js";
import { PlayingScreen } from "./screens/PlayingScreen.js";
import { useTvPlaybackRuntime } from "./runtime/use-tv-playback-runtime.js";
import { createTvRoom, readTvRoomSlug, tvRoomExists } from "./runtime/player-client.js";
import { deriveTvDisplayState, type TvDisplayState } from "./screens/tv-display-model.js";
import { tvTheme } from "./theme.js";

export function App() {
  const [roomSlug, setRoomSlug] = useState<string>(() => readTvRoomSlug() ?? "living-room");

  useEffect(() => {
    let cancelled = false;
    const stored = readTvRoomSlug();
    const ensure = async (): Promise<string | null> => {
      if (stored && (await tvRoomExists(stored))) {
        return null;
      }
      return createTvRoom();
    };
    void ensure().then((slug) => {
      if (!slug) {
        return;
      }
      if (cancelled) {
        return;
      }
      setRoomSlug(slug);
      try {
        const url = new URL(globalThis.location.href);
        url.searchParams.set("room", slug);
        globalThis.history.replaceState({}, "", url);
      } catch {
        // ignore
      }
    });
    return () => {
      cancelled = true;
    };
  }, [roomSlug]);

  return <TvRoomApp roomSlug={roomSlug} />;
}

function TvRoomApp({ roomSlug }: { roomSlug: string }) {
  const activeVideoRef = useRef<HTMLVideoElement>(null);
  const standbyVideoRef = useRef<HTMLVideoElement>(null);
  const runtime = useTvPlaybackRuntime({ activeVideoRef, standbyVideoRef, roomSlug });
  const isPlaybackScreen =
    runtime.roomState.status === "ready" &&
    Boolean(runtime.snapshot?.currentTarget) &&
    (runtime.snapshot?.state === "playing" || runtime.snapshot?.state === "loading" || runtime.snapshot?.state === "recovering");

  return (
    <main style={styles.shell}>
      <style>{globalStyles}</style>
      <video ref={activeVideoRef} onEnded={runtime.handleVideoEnded} playsInline preload="auto" style={styles.video} />
      <video ref={standbyVideoRef} onEnded={runtime.handleVideoEnded} playsInline preload="auto" style={styles.video} />
      <div style={isPlaybackScreen ? styles.playbackShade : styles.atmosphere} />
      <div style={styles.content}>
        {renderScreen(
          runtime.roomState.status,
          runtime.snapshot,
          runtime.roomState.errorMessage,
          runtime.playbackPositionMs,
          runtime.durationMs,
          runtime.firstPlayBlocked,
          runtime.handleFirstPlayPromptClick,
          runtime.localPlaybackConfirmed,
          runtime.client
        )}
      </div>
      <InteractionOverlay interactions={runtime.interactions} />
    </main>
  );
}

function renderScreen(
  status: "booting" | "ready" | "error",
  snapshot: RoomSnapshot | null,
  errorMessage: string | null,
  playbackPositionMs: number,
  durationMs: number | null,
  firstPlayBlocked: boolean,
  onFirstPlayPromptClick: () => void,
  localPlaybackConfirmed: boolean,
  client: ReturnType<typeof useTvPlaybackRuntime>["client"]
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

  if (snapshot.state === "error") {
    return <SystemScreen displayState={displayState} />;
  }

  if (snapshot.state === "playing" || snapshot.state === "loading" || snapshot.state === "recovering") {
    return (
      <PlayingScreen
        displayState={displayState}
        snapshot={snapshot}
        playbackPositionMs={playbackPositionMs}
        durationMs={durationMs}
        onFirstPlayPromptClick={onFirstPlayPromptClick}
        showStateLabel={!localPlaybackConfirmed}
      />
    );
  }

  return (
    <IdleScreen
      client={client}
      displayState={displayState}
      pairing={snapshot.pairing}
      {...(snapshot.volumePercent != null ? { volumePercent: snapshot.volumePercent } : {})}
    />
  );
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
    background: `linear-gradient(135deg, ${tvTheme.colors.background} 0%, ${tvTheme.colors.backgroundElevated} 58%, #020617 100%)`,
    color: tvTheme.colors.text,
    fontFamily: tvTheme.fonts.body,
    minHeight: "100vh",
    overflow: "hidden",
    position: "relative",
    width: "100vw"
  },
  atmosphere: {
    background:
      `linear-gradient(90deg, rgba(34, 211, 238, 0.05) 1px, transparent 1px), linear-gradient(0deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px), linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(5, 7, 13, 0.72) 100%)`,
    backgroundSize: "48px 48px, 48px 48px, 100% 100%",
    inset: 0,
    opacity: 0.5,
    pointerEvents: "none",
    position: "absolute"
  },
  playbackShade: {
    background: "linear-gradient(180deg, rgba(0, 0, 0, 0.18) 0%, transparent 32%, transparent 66%, rgba(0, 0, 0, 0.26) 100%)",
    inset: 0,
    pointerEvents: "none",
    position: "absolute"
  },
  content: {
    minHeight: "100vh",
    position: "relative",
    zIndex: 1
  },
  video: {
    background: tvTheme.colors.background,
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
    color: tvTheme.colors.accent,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0,
    margin: "0 0 24px",
    textTransform: "none"
  },
  systemTitle: {
    color: tvTheme.colors.text,
    fontFamily: tvTheme.fonts.heading,
    fontSize: 96,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 0.94,
    margin: 0,
    overflowWrap: "anywhere"
  },
  systemDetail: {
    color: tvTheme.colors.textMuted,
    fontSize: 34,
    lineHeight: 1.24,
    margin: "30px 0 0",
    maxWidth: 880,
    overflowWrap: "anywhere"
  }
} satisfies Record<string, CSSProperties>;

const globalStyles = `
html,
body,
#root {
  background: ${tvTheme.colors.background};
  height: 100%;
  margin: 0;
  overflow: hidden;
  width: 100%;
}

* {
  box-sizing: border-box;
}
`;
