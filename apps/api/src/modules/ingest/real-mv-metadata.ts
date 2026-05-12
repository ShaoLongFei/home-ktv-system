import type { CompatibilityReason, Language } from "@home-ktv/domain";

export interface RealMvSidecarTrackRoles {
  original?: number | string;
  instrumental?: number | string;
}

export interface RealMvSidecarMetadata {
  title?: string;
  artistName?: string;
  language?: Language;
  genre?: string[];
  tags?: string[];
  aliases?: string[];
  searchHints?: string[];
  releaseYear?: number | null;
  trackRoles?: RealMvSidecarTrackRoles;
}

export type ParseRealMvSidecarJsonResult =
  | { status: "ok"; metadata: RealMvSidecarMetadata }
  | { status: "invalid"; reasons: CompatibilityReason[] };

export const RealMvSidecarMetadataSchema = {
  parse(value: unknown): RealMvSidecarMetadata {
    const result = parseRealMvSidecarMetadataValue(value);
    if (result.status === "invalid") {
      throw new Error(result.reasons[0]?.message ?? "Invalid real MV sidecar metadata");
    }
    return result.metadata;
  }
};

export function parseRealMvSidecarJson(raw: string): ParseRealMvSidecarJsonResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: "invalid",
      reasons: [scannerWarning("sidecar-json-invalid", "song.json could not be parsed as JSON")]
    };
  }

  return parseRealMvSidecarMetadataValue(parsed);
}

function parseRealMvSidecarMetadataValue(value: unknown): ParseRealMvSidecarJsonResult {
  if (!isRecord(value)) {
    return invalidSchema("song.json must be a JSON object");
  }

  const metadata: RealMvSidecarMetadata = {};
  const stringFields = ["title", "artistName"] as const;
  for (const field of stringFields) {
    const result = readOptionalString(value, field);
    if (result.status === "invalid") {
      return invalidSchema(`${field} must be a string`);
    }
    if (result.value !== undefined) {
      metadata[field] = result.value;
    }
  }

  if (value.language !== undefined) {
    if (!isLanguage(value.language)) {
      return invalidSchema("language must be mandarin, cantonese, or other");
    }
    metadata.language = value.language;
  }

  const arrayFields = ["genre", "tags", "aliases", "searchHints"] as const;
  for (const field of arrayFields) {
    const result = readOptionalStringArray(value, field);
    if (result.status === "invalid") {
      return invalidSchema(`${field} must be an array of strings`);
    }
    if (result.value !== undefined) {
      metadata[field] = result.value;
    }
  }

  if (value.releaseYear !== undefined) {
    const releaseYear = value.releaseYear;
    if (releaseYear !== null && (typeof releaseYear !== "number" || !Number.isInteger(releaseYear) || releaseYear < 0)) {
      return invalidSchema("releaseYear must be a non-negative integer or null");
    }
    metadata.releaseYear = releaseYear;
  }

  if (value.trackRoles !== undefined) {
    const trackRoles = parseTrackRoles(value.trackRoles);
    if (trackRoles.status === "invalid") {
      return invalidSchema(trackRoles.message);
    }
    metadata.trackRoles = trackRoles.value;
  }

  return { status: "ok", metadata };
}

function parseTrackRoles(value: unknown): { status: "ok"; value: RealMvSidecarTrackRoles } | { status: "invalid"; message: string } {
  if (!isRecord(value)) {
    return { status: "invalid", message: "trackRoles must be an object" };
  }

  const roles: RealMvSidecarTrackRoles = {};
  for (const role of ["original", "instrumental"] as const) {
    const roleValue = value[role];
    if (roleValue === undefined) {
      continue;
    }
    if (typeof roleValue !== "number" && typeof roleValue !== "string") {
      return { status: "invalid", message: `trackRoles.${role} must be a number or string` };
    }
    roles[role] = roleValue;
  }
  return { status: "ok", value: roles };
}

function readOptionalString(
  value: Record<string, unknown>,
  field: string
): { status: "ok"; value: string | undefined } | { status: "invalid" } {
  const fieldValue = value[field];
  if (fieldValue === undefined) {
    return { status: "ok", value: undefined };
  }
  return typeof fieldValue === "string" ? { status: "ok", value: fieldValue } : { status: "invalid" };
}

function readOptionalStringArray(
  value: Record<string, unknown>,
  field: string
): { status: "ok"; value: string[] | undefined } | { status: "invalid" } {
  const fieldValue = value[field];
  if (fieldValue === undefined) {
    return { status: "ok", value: undefined };
  }
  return Array.isArray(fieldValue) && fieldValue.every((item) => typeof item === "string")
    ? { status: "ok", value: fieldValue }
    : { status: "invalid" };
}

function invalidSchema(message: string): ParseRealMvSidecarJsonResult {
  return {
    status: "invalid",
    reasons: [scannerWarning("sidecar-schema-invalid", message)]
  };
}

function scannerWarning(code: string, message: string): CompatibilityReason {
  return {
    code,
    severity: "warning",
    message,
    source: "scanner"
  };
}

function isLanguage(value: unknown): value is Language {
  return value === "mandarin" || value === "cantonese" || value === "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
