import type { PlayerConflictState } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import type { TvDisplayState } from "./tv-display-model.js";
import { tvTheme } from "../theme.js";

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
    color: tvTheme.colors.danger,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0,
    margin: "0 0 26px",
    textTransform: "none"
  },
  title: {
    color: tvTheme.colors.text,
    fontFamily: tvTheme.fonts.heading,
    fontSize: 96,
    fontWeight: 950,
    letterSpacing: 0,
    lineHeight: 0.94,
    margin: 0,
    maxWidth: 1080,
    overflowWrap: "anywhere"
  },
  detail: {
    color: tvTheme.colors.textMuted,
    fontSize: 32,
    lineHeight: 1.25,
    margin: "34px 0 0",
    maxWidth: 900,
    overflowWrap: "anywhere"
  },
  device: {
    background: tvTheme.colors.surface,
    border: "1px solid rgba(248, 113, 113, 0.34)",
    borderRadius: tvTheme.radii.panel,
    color: tvTheme.colors.text,
    fontSize: 26,
    fontWeight: 850,
    lineHeight: 1.18,
    margin: "28px 0 0",
    maxWidth: 720,
    overflowWrap: "anywhere",
    padding: "18px 22px"
  }
} satisfies Record<string, CSSProperties>;
