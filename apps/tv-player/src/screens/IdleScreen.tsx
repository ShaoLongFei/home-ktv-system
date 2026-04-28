import type { PairingInfo } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { PairingQr } from "../components/PairingQr.js";

export interface IdleScreenProps {
  pairing: PairingInfo;
}

export function IdleScreen({ pairing }: IdleScreenProps) {
  return (
    <section style={styles.screen}>
      <div style={styles.copy}>
        <p style={styles.kicker}>living-room ready</p>
        <h1 style={styles.title}>Pick a song from your phone.</h1>
        <p style={styles.detail}>This screen only plays and reports status. Song search and control stay on mobile.</p>
      </div>
      <PairingQr pairing={pairing} variant="large" />
    </section>
  );
}

const styles = {
  screen: {
    alignItems: "center",
    display: "grid",
    gap: "min(6vw, 72px)",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: "100vh",
    padding: "clamp(36px, 8vh, 96px) clamp(28px, 7vw, 108px)"
  },
  copy: {
    maxWidth: 920
  },
  kicker: {
    color: "#8fe6ad",
    fontSize: "clamp(22px, 2.8vw, 36px)",
    fontWeight: 900,
    letterSpacing: 1.5,
    margin: "0 0 28px",
    textTransform: "uppercase"
  },
  title: {
    color: "#fff8e7",
    fontSize: "clamp(56px, 8vw, 118px)",
    fontWeight: 950,
    letterSpacing: -3,
    lineHeight: 0.92,
    margin: 0
  },
  detail: {
    color: "#d9d0b8",
    fontSize: "clamp(22px, 3vw, 34px)",
    lineHeight: 1.24,
    margin: "32px 0 0",
    maxWidth: 760
  }
} satisfies Record<string, CSSProperties>;
