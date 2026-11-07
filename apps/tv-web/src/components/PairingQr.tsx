import type { PairingInfo } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { create } from "qrcode";
import { tvTheme } from "../theme.js";

export interface PairingQrProps {
  pairing: PairingInfo;
  variant: "large" | "corner";
}

export interface QrModules {
  cells: boolean[];
  size: number;
}

const QUIET_ZONE_MODULES = 2;

export function PairingQr({ pairing, variant }: PairingQrProps) {
  const isLarge = variant === "large";
  const modules = createQrModules(pairing.qrPayload, isLarge ? 2 : 1);

  const target = pairing.controllerUrl || pairing.qrPayload;

  return (
    <a
      aria-label={isLarge ? "点击打开点歌台" : "打开点歌台"}
      href={target}
      rel="noreferrer"
      style={styles.link}
      target="_blank"
    >
      <figure style={isLarge ? styles.largeFrame : styles.cornerFrame}>
      <div
        aria-label={isLarge ? "large pairing QR" : "corner pairing QR"}
        style={qrStyle(isLarge, modules.size)}
        title={pairing.qrPayload}
      >
        {modules.cells.map((active, index) => (
          <span key={index} style={active ? styles.dotActive : styles.dot} />
        ))}
      </div>
      {isLarge ? <figcaption style={styles.largeCaption}>扫码或点击二维码进入点歌台</figcaption> : null}
      </figure>
    </a>
  );
}

export function createQrModules(payload: string, quietZoneModules = QUIET_ZONE_MODULES): QrModules {
  const qrCode = create(payload, {
    errorCorrectionLevel: "M"
  });
  const qrSize = qrCode.modules.size;
  const size = qrSize + quietZoneModules * 2;
  const cells = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size) - quietZoneModules;
    const column = (index % size) - quietZoneModules;
    if (row < 0 || column < 0 || row >= qrSize || column >= qrSize) {
      return false;
    }

    return qrCode.modules.get(row, column) === 1;
  });

  return {
    cells,
    size
  };
}

function qrStyle(isLarge: boolean, moduleSize: number): CSSProperties {
  return {
    ...(isLarge ? styles.largeQr : styles.cornerQr),
    gridTemplateColumns: `repeat(${moduleSize}, 1fr)`
  };
}

const styles = {
  link: {
    color: "inherit",
    display: "block",
    textDecoration: "none"
  },
  largeFrame: {
    backdropFilter: "blur(18px)",
    background: "rgba(255, 255, 255, 0.94)",
    border: "1px solid rgba(255, 255, 255, 0.72)",
    borderRadius: tvTheme.radii.panel,
    boxShadow: "0 28px 90px rgba(0, 0, 0, 0.46), 0 0 42px rgba(34, 211, 238, 0.10)",
    display: "grid",
    gap: 18,
    justifyItems: "center",
    margin: 0,
    padding: "16px 16px 14px"
  },
  cornerFrame: {
    background: "#ffffff",
    border: "none",
    borderRadius: 8,
    boxShadow: "0 14px 38px rgba(0, 0, 0, 0.35)",
    display: "grid",
    justifyItems: "center",
    margin: 0,
    padding: 4
  },
  largeQr: {
    width: "min(34vw, 380px)",
    minWidth: 260,
    aspectRatio: "1",
    background: tvTheme.colors.text,
    border: `2px solid ${tvTheme.colors.text}`,
    boxShadow: "0 22px 64px rgba(0, 0, 0, 0.42)",
    display: "grid",
    gap: 0,
    padding: 0
  },
  cornerQr: {
    width: 96,
    aspectRatio: "1",
    background: tvTheme.colors.text,
    border: "none",
    display: "grid",
    gap: 0,
    padding: 0
  },
  dot: {
    background: tvTheme.colors.text
  },
  dotActive: {
    background: "#020617"
  },
  largeCaption: {
    color: "#111827",
    fontSize: 24,
    fontWeight: 850,
    letterSpacing: 0,
    lineHeight: 1.15,
    textAlign: "center"
  }
} satisfies Record<string, CSSProperties>;
