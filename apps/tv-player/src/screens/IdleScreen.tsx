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
    gap: 72,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: "100vh",
    padding: "72px 96px"
  },
  copy: {
    maxWidth: 920
  },
  kicker: {
    color: "#8fe6ad",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 1.5,
    margin: "0 0 28px",
    textTransform: "uppercase"
  },
  title: {
    color: "#fff8e7",
    fontSize: 96,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 0.92,
    margin: 0,
    overflowWrap: "anywhere"
  },
  detail: {
    color: "#d9d0b8",
    fontSize: 30,
    lineHeight: 1.24,
    margin: "32px 0 0",
    maxWidth: 760,
    overflowWrap: "anywhere"
  }
} satisfies Record<string, CSSProperties>;
