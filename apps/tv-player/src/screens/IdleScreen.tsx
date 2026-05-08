import type { PairingInfo } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { PairingQr } from "../components/PairingQr.js";
import type { TvDisplayState } from "./tv-display-model.js";

export interface IdleScreenProps {
  displayState: TvDisplayState;
  pairing: PairingInfo;
}

export function IdleScreen({ displayState, pairing }: IdleScreenProps) {
  return (
    <section style={styles.screen}>
      <div style={styles.copy}>
        <p style={styles.kicker}>电视已连接</p>
        <h1 aria-label="扫码点歌" style={styles.title}>
          {displayState.heading}
        </h1>
        <p style={styles.detail}>{displayState.detail}</p>
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
    letterSpacing: 0,
    margin: "0 0 28px",
    textTransform: "none"
  },
  title: {
    color: "#fff8e7",
    fontSize: 96,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 0.92,
    margin: 0,
    maxWidth: 920,
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
