import type { PlayerConflictState } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";

export interface ConflictScreenProps {
  conflict: PlayerConflictState;
}

export function ConflictScreen({ conflict }: ConflictScreenProps) {
  return (
    <section style={styles.screen}>
      <p style={styles.kicker}>room already connected</p>
      <h1 style={styles.title}>This screen will not take over.</h1>
      <p style={styles.detail}>
        Active player: {conflict.activeDeviceName}. Disconnect that player first, then refresh this screen.
      </p>
    </section>
  );
}

const styles = {
  screen: {
    display: "grid",
    minHeight: "100vh",
    placeContent: "center",
    padding: "8vw"
  },
  kicker: {
    color: "#ff9b72",
    fontSize: "clamp(22px, 3vw, 38px)",
    fontWeight: 900,
    letterSpacing: 1.4,
    margin: "0 0 26px",
    textTransform: "uppercase"
  },
  title: {
    color: "#fff8e7",
    fontSize: "clamp(56px, 8vw, 116px)",
    fontWeight: 950,
    letterSpacing: -3,
    lineHeight: 0.94,
    margin: 0,
    maxWidth: 1080
  },
  detail: {
    color: "#d9d0b8",
    fontSize: "clamp(24px, 3.2vw, 40px)",
    lineHeight: 1.25,
    margin: "34px 0 0",
    maxWidth: 900
  }
} satisfies Record<string, CSSProperties>;
