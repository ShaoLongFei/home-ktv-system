import type { PairingInfo } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";
import { create } from "qrcode";

export interface PairingQrProps {
  pairing: PairingInfo;
  variant: "large" | "corner";
}

export interface QrModules {
  cells: boolean[];
  size: number;
}

const QUIET_ZONE_MODULES = 4;

export function PairingQr({ pairing, variant }: PairingQrProps) {
  const isLarge = variant === "large";
  const modules = createQrModules(pairing.qrPayload);

  return (
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
      <figcaption style={isLarge ? styles.largeCaption : styles.cornerCaption}>
        {isLarge ? "手机扫码点歌" : pairing.roomSlug}
      </figcaption>
    </figure>
  );
}

export function createQrModules(payload: string): QrModules {
  const qrCode = create(payload, {
    errorCorrectionLevel: "M"
  });
  const qrSize = qrCode.modules.size;
  const size = qrSize + QUIET_ZONE_MODULES * 2;
  const cells = Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size) - QUIET_ZONE_MODULES;
    const column = (index % size) - QUIET_ZONE_MODULES;
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
  largeFrame: {
    margin: 0,
    display: "grid",
    gap: 28,
    justifyItems: "center"
  },
  cornerFrame: {
    margin: 0,
    display: "grid",
    gap: 8,
    justifyItems: "center"
  },
  largeQr: {
    width: "min(34vw, 380px)",
    minWidth: 260,
    aspectRatio: "1",
    background: "#fff8e7",
    border: "10px solid #fff8e7",
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
    display: "grid",
    gap: 0,
    padding: 0
  },
  cornerQr: {
    width: 132,
    aspectRatio: "1",
    background: "#fff8e7",
    border: "5px solid #fff8e7",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.32)",
    display: "grid",
    gap: 0,
    padding: 0
  },
  dot: {
    background: "#fff8e7"
  },
  dotActive: {
    background: "#11140f"
  },
  largeCaption: {
    color: "#fff8e7",
    fontSize: 30,
    fontWeight: 800
  },
  cornerCaption: {
    color: "#fff8e7",
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: "none"
  }
} satisfies Record<string, CSSProperties>;
