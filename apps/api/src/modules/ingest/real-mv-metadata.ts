import path from "node:path";
import type { CompatibilityReason, Language, MediaInfoSummary } from "@home-ktv/domain";

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

export interface FilenameMetadataDraft {
  title: string;
  artistName?: string;
  language?: Language;
  genre?: string[];
}

export type RealMvMetadataSourceLabel = "mediainfo" | "filename" | "sidecar";

export interface RealMvMetadataSource {
  field: string;
  source: RealMvMetadataSourceLabel;
}

export interface RealMvMetadataConflict {
  field: string;
  values: Array<{ source: string; value: unknown }>;
}

export interface RealMvMetadataDraft extends RealMvSidecarMetadata {
  metadataSources: RealMvMetadataSource[];
  metadataConflicts: RealMvMetadataConflict[];
  scannerReasons: CompatibilityReason[];
  sidecarMetadata?: RealMvSidecarMetadata;
}

export interface BuildRealMvMetadataDraftInput {
  mediaInfoSummary?: MediaInfoSummary | null;
  mediaInfoTags?: Record<string, unknown>;
  filenameMetadata?: FilenameMetadataDraft;
  sidecarMetadata?: RealMvSidecarMetadata;
  scannerReasons?: CompatibilityReason[];
}

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

export function parseRealMvFilename(relativePath: string): FilenameMetadataDraft {
  const fileName = path.basename(relativePath);
  const stem = stripExtension(fileName).trim();
  const parts = stem.split("-").map((part) => part.trim()).filter(Boolean);
  const fallback = { title: stem };

  if (parts.length < 2) {
    return fallback;
  }

  const language = parts[2] ? parseFilenameLanguage(parts[2]) : undefined;
  const hasRecognizedTail = parts.length === 2 || Boolean(language);
  if (!hasRecognizedTail) {
    return fallback;
  }
  const artistName = parts[0];
  const titlePart = parts[1];
  if (!artistName || !titlePart) {
    return fallback;
  }

  return {
    artistName,
    title: stripTrailingDisplayMarker(titlePart),
    ...(language ? { language } : {}),
    ...(parts[3] ? { genre: [parts[3]] } : {})
  };
}

export function buildRealMvMetadataDraft(input: BuildRealMvMetadataDraftInput): RealMvMetadataDraft {
  const draft: RealMvMetadataDraft = {
    metadataSources: [],
    metadataConflicts: [],
    scannerReasons: [...(input.scannerReasons ?? [])],
    ...(input.sidecarMetadata ? { sidecarMetadata: input.sidecarMetadata } : {})
  };
  recordMediaInfoTechnicalSources(draft, input.mediaInfoSummary);

  const mediaInfoIdentity = readMediaInfoIdentityTags(input.mediaInfoTags);
  assignChosenField(draft, "title", chooseField("title", [
    { source: "mediainfo", value: mediaInfoIdentity.title },
    { source: "filename", value: input.filenameMetadata?.title },
    { source: "sidecar", value: input.sidecarMetadata?.title }
  ]));
  assignChosenField(draft, "artistName", chooseField("artistName", [
    { source: "mediainfo", value: mediaInfoIdentity.artistName },
    { source: "filename", value: input.filenameMetadata?.artistName },
    { source: "sidecar", value: input.sidecarMetadata?.artistName }
  ]));
  assignChosenField(draft, "language", chooseField("language", [
    { source: "mediainfo", value: mediaInfoIdentity.language },
    { source: "filename", value: input.filenameMetadata?.language },
    { source: "sidecar", value: input.sidecarMetadata?.language }
  ]));
  assignChosenField(draft, "genre", chooseField("genre", [
    { source: "filename", value: input.filenameMetadata?.genre },
    { source: "sidecar", value: input.sidecarMetadata?.genre }
  ]));
  assignChosenField(draft, "tags", chooseField("tags", [
    { source: "sidecar", value: input.sidecarMetadata?.tags }
  ]));
  assignChosenField(draft, "aliases", chooseField("aliases", [
    { source: "sidecar", value: input.sidecarMetadata?.aliases }
  ]));
  assignChosenField(draft, "searchHints", chooseField("searchHints", [
    { source: "sidecar", value: input.sidecarMetadata?.searchHints }
  ]));
  assignChosenField(draft, "releaseYear", chooseField("releaseYear", [
    { source: "sidecar", value: input.sidecarMetadata?.releaseYear }
  ]));
  assignChosenField(draft, "trackRoles", chooseField("trackRoles", [
    { source: "sidecar", value: input.sidecarMetadata?.trackRoles }
  ]));

  return draft;
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

function recordMediaInfoTechnicalSources(draft: RealMvMetadataDraft, mediaInfoSummary: MediaInfoSummary | null | undefined): void {
  if (!mediaInfoSummary) {
    return;
  }
  for (const field of ["durationMs", "container", "videoCodec", "resolution", "fileSizeBytes", "audioTracks"]) {
    draft.metadataSources.push({ field, source: "mediainfo" });
  }
}

function readMediaInfoIdentityTags(value: Record<string, unknown> | undefined): Partial<Pick<RealMvSidecarMetadata, "title" | "artistName" | "language">> {
  if (!value) {
    return {};
  }
  const identity: Partial<Pick<RealMvSidecarMetadata, "title" | "artistName" | "language">> = {};
  if (typeof value.title === "string") {
    identity.title = value.title;
  }
  if (typeof value.artistName === "string") {
    identity.artistName = value.artistName;
  } else if (typeof value.artist === "string") {
    identity.artistName = value.artist;
  }
  if (isLanguage(value.language)) {
    identity.language = value.language;
  }
  return identity;
}

function chooseField<T>(
  field: string,
  candidates: Array<{ source: RealMvMetadataSourceLabel; value: T | undefined }>
): { selected: { source: RealMvMetadataSourceLabel; value: T } | null; conflicts: RealMvMetadataConflict[] } {
  const present = candidates.filter((candidate): candidate is { source: RealMvMetadataSourceLabel; value: T } => candidate.value !== undefined);
  const selected = present[0] ?? null;
  if (!selected) {
    return { selected: null, conflicts: [] };
  }

  const conflicting = present.filter((candidate) => candidate.source !== selected.source && !metadataValuesEqual(candidate.value, selected.value));
  return {
    selected,
    conflicts: conflicting.length
      ? [{
          field,
          values: [
            { source: selected.source, value: selected.value },
            ...conflicting.map((candidate) => ({ source: candidate.source, value: candidate.value }))
          ]
        }]
      : []
  };
}

function assignChosenField<TKey extends keyof RealMvSidecarMetadata>(
  draft: RealMvMetadataDraft,
  field: TKey,
  result: {
    selected: { source: RealMvMetadataSourceLabel; value: RealMvSidecarMetadata[TKey] } | null;
    conflicts: RealMvMetadataConflict[];
  }
): void {
  if (!result.selected) {
    return;
  }
  (draft as RealMvSidecarMetadata)[field] = result.selected.value;
  draft.metadataSources.push({ field, source: result.selected.source });
  draft.metadataConflicts.push(...result.conflicts);
}

function metadataValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

function parseFilenameLanguage(value: string): Language | undefined {
  if (value === "国语" || value === "普通话") {
    return "mandarin";
  }
  if (value === "粤语") {
    return "cantonese";
  }
  return undefined;
}

function stripTrailingDisplayMarker(value: string): string {
  return value
    .replace(/\s*[\(（][^()（）]*[\)）]\s*$/u, "")
    .trim();
}

function stripExtension(fileName: string): string {
  return fileName.slice(0, fileName.length - path.extname(fileName).length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
