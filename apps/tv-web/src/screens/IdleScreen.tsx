import type { PairingInfo } from "@home-ktv/player-contracts";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PairingQr } from "../components/PairingQr.js";
import type { IdlePlaylistItem, PlayerClient } from "../runtime/player-client.js";
import type { TvDisplayState } from "./tv-display-model.js";
import { tvTheme } from "../theme.js";

export interface IdleScreenProps {
  displayState: TvDisplayState;
  pairing: PairingInfo;
  client?: PlayerClient;
}

export function IdleScreen({ pairing, client }: IdleScreenProps) {
  const ambientVideoRef = useRef<HTMLVideoElement | null>(null);
  const [idleTracks, setIdleTracks] = useState<IdlePlaylistItem[]>([]);
  const [idleIndex, setIdleIndex] = useState(0);
  const [ambientBlocked, setAmbientBlocked] = useState(false);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    client
      .fetchIdlePlaylist()
      .then((response) => {
        if (!cancelled) {
          setIdleTracks(response.items);
          setIdleIndex(0);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client]);

  const idleTrack = idleTracks.length > 0 ? idleTracks[idleIndex % idleTracks.length] ?? null : null;

  useEffect(() => {
    const video = ambientVideoRef.current;
    if (!video || !idleTrack || !client) {
      return;
    }
    video.src = client.mediaUrl(idleTrack.url);
    video.volume = 0.35;
    video.play().then(
      () => setAmbientBlocked(false),
      () => setAmbientBlocked(true)
    );
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [client, idleTrack]);

  useEffect(() => {
    if (!ambientBlocked) {
      return;
    }
    const unlock = () => {
      void ambientVideoRef.current?.play().then(
        () => setAmbientBlocked(false),
        () => undefined
      );
    };
    globalThis.addEventListener("pointerdown", unlock, { once: true });
    return () => globalThis.removeEventListener("pointerdown", unlock);
  }, [ambientBlocked]);

  return (
    <section style={styles.screen}>
      <video
        aria-hidden="true"
        onEnded={() => setIdleIndex((index) => index + 1)}
        playsInline
        ref={ambientVideoRef}
        style={styles.ambientVideo}
      />
      <div style={styles.backdrop} />
      <div style={styles.leftPanel}>
        <p style={styles.brand}>HomeKTV</p>
        <h1 aria-label="今晚开唱" style={styles.title}>
          今晚开唱
        </h1>
        <div aria-hidden="true" style={styles.decorativeBars}>
          <span style={{ ...styles.bar, ...styles.barOne }} />
          <span style={{ ...styles.bar, ...styles.barTwo }} />
          <span style={{ ...styles.bar, ...styles.barThree }} />
          <span style={{ ...styles.bar, ...styles.barFour }} />
          <span style={{ ...styles.bar, ...styles.barFive }} />
        </div>
        <div style={styles.statusPill}>
          <span style={styles.statusDot} />
          <span>电视已连接</span>
        </div>
        {idleTrack ? (
          <p style={styles.ambientNowPlaying}>
            ♫ {idleTrack.title}
            {idleTrack.artistName ? ` · ${idleTrack.artistName}` : ""}
          </p>
        ) : null}
      </div>
      <div style={styles.qrColumn}>
        <PairingQr pairing={pairing} variant="large" />
      </div>
    </section>
  );
}

const styles = {
  ambientVideo: {
    height: 1,
    left: -9999,
    opacity: 0,
    pointerEvents: "none",
    position: "absolute",
    top: -9999,
    width: 1
  },
  ambientNowPlaying: {
    color: "rgba(248, 250, 252, 0.72)",
    fontSize: 18,
    fontWeight: 700,
    margin: "18px 0 0"
  },
  screen: {
    alignItems: "center",
    backgroundImage: "url('/home-ktv-idle-background.png')",
    backgroundPosition: "center",
    backgroundSize: "cover",
    display: "grid",
    gap: 80,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: "100vh",
    overflow: "hidden",
    padding: "72px 86px 72px 80px",
    position: "relative"
  },
  backdrop: {
    background:
      "linear-gradient(90deg, rgba(5, 7, 13, 0.88) 0%, rgba(5, 7, 13, 0.62) 48%, rgba(5, 7, 13, 0.18) 100%), linear-gradient(180deg, rgba(5, 7, 13, 0.28) 0%, rgba(5, 7, 13, 0.64) 100%)",
    inset: 0,
    position: "absolute"
  },
  leftPanel: {
    alignContent: "center",
    display: "grid",
    justifyItems: "start",
    maxWidth: 720,
    minWidth: 0,
    position: "relative",
    zIndex: 1
  },
  brand: {
    color: tvTheme.colors.text,
    fontFamily: tvTheme.fonts.heading,
    fontSize: 58,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 1,
    margin: 0
  },
  title: {
    color: tvTheme.colors.text,
    fontFamily: tvTheme.fonts.heading,
    fontSize: 42,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 1.06,
    margin: "20px 0 0",
    overflowWrap: "anywhere"
  },
  decorativeBars: {
    alignItems: "end",
    display: "flex",
    gap: 12,
    height: 132,
    marginTop: 42
  },
  bar: {
    borderRadius: 6,
    boxShadow: "0 14px 34px rgba(0, 0, 0, 0.24)",
    display: "block",
    width: 14
  },
  barOne: {
    background: tvTheme.colors.success,
    height: 50
  },
  barTwo: {
    background: tvTheme.colors.warning,
    height: 88
  },
  barThree: {
    background: "#FF6858",
    height: 132
  },
  barFour: {
    background: "#56A0FF",
    height: 74
  },
  barFive: {
    background: "rgba(248, 250, 252, 0.82)",
    height: 106
  },
  statusPill: {
    alignItems: "center",
    backdropFilter: "blur(16px)",
    background: "rgba(15, 23, 42, 0.56)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: tvTheme.radii.pill,
    color: tvTheme.colors.text,
    display: "inline-flex",
    fontSize: 20,
    fontWeight: 850,
    gap: 10,
    lineHeight: 1,
    marginTop: 36,
    padding: "13px 18px"
  },
  statusDot: {
    background: tvTheme.colors.success,
    borderRadius: tvTheme.radii.pill,
    boxShadow: "0 0 22px rgba(52, 211, 153, 0.56)",
    display: "inline-block",
    height: 10,
    width: 10
  },
  qrColumn: {
    alignItems: "center",
    display: "grid",
    justifyItems: "center",
    position: "relative",
    zIndex: 1
  }
} satisfies Record<string, CSSProperties>;
