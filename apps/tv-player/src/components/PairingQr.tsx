import type { PairingInfo } from "@home-ktv/player-contracts";
import type { CSSProperties } from "react";

export interface PairingQrProps {
  pairing: PairingInfo;
  variant: "large" | "corner";
}

export function PairingQr({ pairing, variant }: PairingQrProps) {
  const isLarge = variant === "large";

  return (
    <figure style={isLarge ? styles.largeFrame : styles.cornerFrame}>
      <div aria-label={isLarge ? "large pairing QR" : "corner pairing QR"} style={isLarge ? styles.largeQr : styles.cornerQr}>
        {Array.from({ length: 49 }).map((_, index) => (
          <span key={index} style={qrDotActive(index) ? styles.dotActive : styles.dot} />
        ))}
      </div>
      <figcaption style={isLarge ? styles.largeCaption : styles.cornerCaption}>
        {isLarge ? "Scan with your phone to pick songs" : pairing.roomSlug}
      </figcaption>
    </figure>
  );
}

function qrDotActive(index: number): boolean {
  return index % 2 === 0 || index % 6 === 0 || index === 9 || index === 39;
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
    gap: 8,
    gridTemplateColumns: "repeat(7, 1fr)",
    padding: 18
  },
  cornerQr: {
    width: 132,
    aspectRatio: "1",
    background: "#fff8e7",
    border: "5px solid #fff8e7",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.32)",
    display: "grid",
    gap: 4,
    gridTemplateColumns: "repeat(7, 1fr)",
    padding: 8
  },
  dot: {
    background: "#fff8e7"
  },
  dotActive: {
    background: "#11140f"
  },
  largeCaption: {
    color: "#fff8e7",
    fontSize: "clamp(24px, 3.1vw, 40px)",
    fontWeight: 800
  },
  cornerCaption: {
    color: "#fff8e7",
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: "uppercase"
  }
} satisfies Record<string, CSSProperties>;
