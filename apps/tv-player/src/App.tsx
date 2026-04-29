import type { PlaybackNotice, RoomSnapshot } from "@home-ktv/player-contracts";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { ConflictScreen } from "./screens/ConflictScreen.js";
import { IdleScreen } from "./screens/IdleScreen.js";
import { PlayingScreen } from "./screens/PlayingScreen.js";
import { ActivePlaybackController } from "./runtime/active-playback-controller.js";
import { HeartbeatController } from "./runtime/heartbeat-controller.js";
import { createBrowserPlayerClient } from "./runtime/player-client.js";
import { RecoveryController } from "./runtime/recovery-controller.js";
import { SwitchController } from "./runtime/switch-controller.js";
import { createBrowserVideoPool, type DualVideoPool } from "./runtime/video-pool.js";
import { useRoomSnapshot } from "./runtime/use-room-snapshot.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

export function App() {
  const [client] = useState(() => createBrowserPlayerClient());
  const roomState = useRoomSnapshot(client);
  const activeVideoRef = useRef<HTMLVideoElement>(null);
  const standbyVideoRef = useRef<HTMLVideoElement>(null);
  const latestSnapshotRef = useRef<RoomSnapshot | null>(null);
  const videoPoolRef = useRef<DualVideoPool | null>(null);
  const [localNotice, setLocalNotice] = useState<PlaybackNotice | null>(null);

  useEffect(() => {
    latestSnapshotRef.current = roomState.snapshot;
  }, [roomState.snapshot]);

  useEffect(() => {
    if (!activeVideoRef.current || !standbyVideoRef.current || videoPoolRef.current) {
      return;
    }

    videoPoolRef.current = createBrowserVideoPool(activeVideoRef.current, standbyVideoRef.current);
  }, []);

  useEffect(() => {
    const pool = videoPoolRef.current;
    const snapshot = roomState.snapshot;
    if (!pool || !snapshot) {
      return;
    }

    void ensureCurrentPlayback(pool, snapshot, setLocalNotice);
  }, [roomState.snapshot]);

  useEffect(() => {
    const handlePointerDown = () => {
      const pool = videoPoolRef.current;
      const snapshot = roomState.snapshot;
      if (!pool || !snapshot) {
        return;
      }

      void ensureCurrentPlayback(pool, snapshot, setLocalNotice);
    };

    globalThis.addEventListener("pointerdown", handlePointerDown);
    return () => globalThis.removeEventListener("pointerdown", handlePointerDown);
  }, [roomState.snapshot]);

  useEffect(() => {
    const sendHeartbeat = () => {
      const pool = videoPoolRef.current;
      const snapshot = latestSnapshotRef.current;
      if (!pool || !snapshot) {
        return;
      }

      void new HeartbeatController({ client, videoPool: pool }).send(snapshot);
    };

    const intervalId = globalThis.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => globalThis.clearInterval(intervalId);
  }, [client]);

  useEffect(() => {
    const pool = videoPoolRef.current;
    const snapshot = roomState.snapshot;
    if (!pool || !snapshot || snapshot.state !== "recovering") {
      return;
    }

    const recoveryController = new RecoveryController({ client, videoPool: pool });
    void recoveryController.recover({ roomSlug: snapshot.roomSlug, deviceId: client.deviceId }).then((result) => {
      setLocalNotice(result.notice);
    });
  }, [client, roomState.snapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const pool = videoPoolRef.current;
      const snapshot = roomState.snapshot;
      if (event.key.toLowerCase() !== "v" || !pool || !snapshot) {
        return;
      }

      const switchController = new SwitchController({ client, deviceId: client.deviceId, videoPool: pool });
      void switchController.switchVocalMode(snapshot).then((result) => {
        if (result.status === "reverted") {
          setLocalNotice({
            kind: "switch_failed_reverted",
            message: result.message
          });
        }
      });
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [client, roomState.snapshot]);

  const snapshot = mergeLocalNotice(roomState.snapshot, localNotice);

  return (
    <main style={styles.shell}>
      <video ref={activeVideoRef} playsInline preload="auto" style={styles.video} />
      <video ref={standbyVideoRef} playsInline preload="auto" style={styles.video} />
      <div style={styles.atmosphere} />
      <div style={styles.content}>{renderScreen(roomState.status, snapshot, roomState.errorMessage)}</div>
    </main>
  );
}

function renderScreen(status: "booting" | "ready" | "error", snapshot: RoomSnapshot | null, errorMessage: string | null) {
  if (status === "booting") {
    return <SystemScreen title="Starting player" detail="Preparing the living-room display." />;
  }

  if (status === "error") {
    return <SystemScreen title="TV player offline" detail={errorMessage ?? "Unable to connect to the backend."} />;
  }

  if (!snapshot) {
    return <SystemScreen title="Waiting for room" detail="No room snapshot is available yet." />;
  }

  if (snapshot.conflict) {
    return <ConflictScreen conflict={snapshot.conflict} />;
  }

  if (snapshot.state === "playing" || snapshot.state === "loading" || snapshot.state === "recovering") {
    return <PlayingScreen snapshot={snapshot} />;
  }

  return <IdleScreen pairing={snapshot.pairing} />;
}

function SystemScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <section style={styles.systemScreen}>
      <p style={styles.systemKicker}>home ktv</p>
      <h1 style={styles.systemTitle}>{title}</h1>
      <p style={styles.systemDetail}>{detail}</p>
    </section>
  );
}

function mergeLocalNotice(snapshot: RoomSnapshot | null, localNotice: PlaybackNotice | null): RoomSnapshot | null {
  if (!snapshot || !localNotice) {
    return snapshot;
  }

  return {
    ...snapshot,
    notice: localNotice
  };
}

async function ensureCurrentPlayback(
  pool: DualVideoPool,
  snapshot: RoomSnapshot,
  setLocalNotice: Dispatch<SetStateAction<PlaybackNotice | null>>
): Promise<void> {
  const result = await new ActivePlaybackController({ videoPool: pool }).ensurePlaying(snapshot);

  if (result.status === "blocked") {
    setLocalNotice({
      kind: "loading",
      message: "Playback is ready. Click the TV page once to start the song."
    });
    return;
  }

  if (result.status === "playing") {
    setLocalNotice((notice) => (notice?.kind === "loading" ? null : notice));
  }
}

const styles = {
  shell: {
    background:
      "radial-gradient(circle at 18% 20%, rgba(143, 230, 173, 0.22), transparent 28%), radial-gradient(circle at 82% 8%, rgba(242, 200, 75, 0.2), transparent 32%), linear-gradient(135deg, #11140f 0%, #15180f 46%, #070806 100%)",
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
    padding: "8vw"
  },
  systemKicker: {
    color: "#8fe6ad",
    fontSize: "clamp(22px, 3vw, 36px)",
    fontWeight: 900,
    letterSpacing: 1.5,
    margin: "0 0 24px",
    textTransform: "uppercase"
  },
  systemTitle: {
    color: "#fff8e7",
    fontSize: "clamp(56px, 8vw, 116px)",
    fontWeight: 950,
    letterSpacing: -3,
    lineHeight: 0.94,
    margin: 0
  },
  systemDetail: {
    color: "#d9d0b8",
    fontSize: "clamp(24px, 3vw, 38px)",
    lineHeight: 1.24,
    margin: "30px 0 0",
    maxWidth: 880
  }
} satisfies Record<string, CSSProperties>;
