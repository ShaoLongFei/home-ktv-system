import type { CompatibilityReason, CompatibilityStatus, TrackRoles } from "@home-ktv/domain";

export interface RealMvAdmissionPolicy {
  mode: "review_first";
  reservedAutoAdmit: {
    reserved: true;
    eligible: boolean;
    reasons: readonly string[];
  };
}

export function deriveRealMvAdmissionPolicy(input: {
  title: string | null | undefined;
  artistName: string | null | undefined;
  compatibilityStatus: CompatibilityStatus;
  trackRoles: TrackRoles;
  scannerReasons: readonly CompatibilityReason[];
}): RealMvAdmissionPolicy {
  const reasons: string[] = [];

  if (isBlank(input.title)) {
    reasons.push("missing-title");
  }

  if (isBlank(input.artistName)) {
    reasons.push("missing-artist");
  }

  if (input.compatibilityStatus !== "playable") {
    reasons.push("compatibility-not-playable");
  }

  if (input.trackRoles.original === null) {
    reasons.push("missing-original-track");
  }

  if (input.trackRoles.instrumental === null) {
    reasons.push("missing-instrumental-track");
  }

  if (input.scannerReasons.length > 0) {
    reasons.push("scanner-reasons-present");
  }

  return {
    mode: "review_first",
    reservedAutoAdmit: {
      reserved: true,
      eligible: reasons.length === 0,
      reasons
    }
  };
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}
