import type { PlayerConflictState } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import type { TvDisplayState } from "./tv-display-model.js";

export interface ConflictScreenProps {
  conflict: PlayerConflictState;
  displayState: TvDisplayState;
}

export function ConflictScreen({ conflict, displayState }: ConflictScreenProps) {
  return (
    <section style={styles.screen}>
      <p style={styles.kicker}>连接冲突</p>
      <h1 style={styles.title}>{displayState.heading}</h1>
      <p style={styles.detail}>{displayState.detail}</p>
      <p style={styles.device}>当前在线：{conflict.activeDeviceName}</p>
    </section>
  );
}

const styles = {
  screen: {
    display: "grid",
    minHeight: "100vh",
    placeContent: "center",
    padding: "72px"
  },
  kicker: {
    color: "#ff9b72",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0,
    margin: "0 0 26px",
    textTransform: "none"
  },
  title: {
    color: "#fff8e7",
    fontSize: 96,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 0.94,
    margin: 0,
    maxWidth: 1080,
    overflowWrap: "anywhere"
  },
  detail: {
    color: "#d9d0b8",
    fontSize: 32,
    lineHeight: 1.25,
    margin: "34px 0 0",
    maxWidth: 900,
    overflowWrap: "anywhere"
  },
  device: {
    background: "rgba(17, 20, 15, 0.76)",
    border: "1px solid rgba(255, 155, 114, 0.3)",
    borderRadius: 20,
    color: "#fff8e7",
    fontSize: 26,
    fontWeight: 850,
    lineHeight: 1.18,
    margin: "28px 0 0",
    maxWidth: 720,
    overflowWrap: "anywhere",
    padding: "18px 22px"
  }
} satisfies Record<string, CSSProperties>;
