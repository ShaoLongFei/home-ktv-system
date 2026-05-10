import { load } from "cheerio";

import type { SourceDefinition, SourceRow } from "../contracts.js";
import { fetchText } from "../fetch/http.js";
import type { CollectContext } from "../runner.js";

export async function collectQqToplistSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<SourceRow[]> {
  if (source.url === undefined) {
    throw new Error(`Source ${source.id} is missing a QQ toplist URL`);
  }

  const html = await fetchText(source.url, context.timeoutMs ?? 10000);
  return parseQqToplistRows(
    source,
    html,
    context.generatedAt ?? new Date().toISOString()
  );
}

export function parseQqToplistRows(
  source: SourceDefinition,
  html: string,
  collectedAt = new Date().toISOString()
): SourceRow[] {
  const initialData = parseInitialData(html);
  if (initialData === null) {
    throw new Error("QQ toplist data not found");
  }

  const sourcePublishedAt = findDateString(initialData);
  const rows = findSongList(initialData)
    .map((item, index) =>
      parseSongRow(source, item, index + 1, sourcePublishedAt, collectedAt)
    )
    .filter((row): row is SourceRow => row !== null);

  if (rows.length === 0) {
    throw new Error("QQ toplist data not found");
  }

  return rows;
}

function parseInitialData(html: string): unknown | null {
  const $ = load(html);
  for (const script of $("script").toArray()) {
    const scriptText = $(script).text();
    const markerIndex = scriptText.indexOf("window.__INITIAL_DATA__");
    if (markerIndex === -1) {
      continue;
    }

    const assignmentIndex = scriptText.indexOf("=", markerIndex);
    if (assignmentIndex === -1) {
      continue;
    }

    const jsonText = extractBalancedObject(scriptText, assignmentIndex + 1);
    if (jsonText === null) {
      continue;
    }

    return JSON.parse(jsonText) as unknown;
  }

  return null;
}

function extractBalancedObject(text: string, startIndex: number): string | null {
  const firstBrace = text.indexOf("{", startIndex);
  if (firstBrace === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = firstBrace; index < text.length; index += 1) {
    const character = text[index];
    if (character === undefined) {
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        inString = false;
      }
      continue;
    }

    if (character === "\"" || character === "'") {
      inString = true;
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(firstBrace, index + 1);
      }
    }
  }

  return null;
}

function findSongList(value: unknown): unknown[] {
  const candidates: unknown[][] = [];

  function visit(candidate: unknown): void {
    if (Array.isArray(candidate)) {
      if (candidate.some(hasSongTitle)) {
        candidates.push(candidate);
      }

      for (const item of candidate) {
        visit(item);
      }
      return;
    }

    if (!isRecord(candidate)) {
      return;
    }

    for (const nestedValue of Object.values(candidate)) {
      visit(nestedValue);
    }
  }

  visit(value);
  candidates.sort((left, right) => scoreSongArray(right) - scoreSongArray(left));
  return candidates[0] ?? [];
}

function parseSongRow(
  source: SourceDefinition,
  item: unknown,
  fallbackRank: number,
  sourcePublishedAt: string | null,
  collectedAt: string
): SourceRow | null {
  if (!isRecord(item)) {
    return null;
  }

  const songInfo = getRecord(item, "songInfo") ?? getRecord(item, "song");
  const rawTitle =
    getString(songInfo, ["name", "title", "songName", "songname"]) ??
    getString(item, ["name", "title", "songName", "songname"]);

  if (rawTitle === null) {
    return null;
  }

  const rawArtists = extractArtistNames(item, songInfo);
  const warnings = [
    ...(sourcePublishedAt === null ? ["missing-source-published-at"] : []),
    ...(rawArtists.length === 0 ? ["missing-artist"] : [])
  ];

  return {
    sourceId: source.id,
    sourceType: source.sourceType,
    provider: source.provider,
    rank: getNumber(item, ["rank", "rankValue", "index"]) ?? fallbackRank,
    rawTitle,
    rawArtists,
    sourceUrl: source.url ?? null,
    sourcePublishedAt,
    collectedAt,
    warnings
  };
}

function hasSongTitle(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const songInfo = getRecord(value, "songInfo") ?? getRecord(value, "song");
  return (
    getString(songInfo, ["name", "title", "songName", "songname"]) !== null ||
    getString(value, ["name", "title", "songName", "songname"]) !== null
  );
}

function scoreSongArray(values: unknown[]): number {
  return values.filter(hasSongTitle).length;
}

function extractArtistNames(
  item: Record<string, unknown>,
  songInfo: Record<string, unknown> | null
): string[] {
  const artistValues = [
    songInfo?.singer,
    songInfo?.singers,
    songInfo?.artist,
    songInfo?.artists,
    songInfo?.singerName,
    item.singer,
    item.singers,
    item.artist,
    item.artists,
    item.singerName
  ];

  return [...new Set(artistValues.flatMap(normalizeArtistValue))];
}

function normalizeArtistValue(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[、,，/]/u)
      .map((artist) => artist.trim())
      .filter((artist) => artist.length > 0);
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeArtistValue);
  }

  if (isRecord(value)) {
    const artistName = getString(value, ["name", "title", "singerName"]);
    return artistName === null ? [] : [artistName];
  }

  return [];
}

function findDateString(value: unknown): string | null {
  if (typeof value === "string") {
    return value.match(/\d{4}-\d{2}-\d{2}/u)?.[0] ?? null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const dateString = findDateString(item);
      if (dateString !== null) {
        return dateString;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of [
    "period",
    "date",
    "updateTime",
    "publishDate",
    "publishedAt"
  ]) {
    const dateString = findDateString(value[key]);
    if (dateString !== null) {
      return dateString;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const dateString = findDateString(nestedValue);
    if (dateString !== null) {
      return dateString;
    }
  }

  return null;
}

function getRecord(
  value: unknown,
  key: string
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const nestedValue = value[key];
  return isRecord(nestedValue) ? nestedValue : null;
}

function getString(
  value: unknown,
  keys: string[]
): string | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const nestedValue = value[key];
    if (typeof nestedValue === "string" && nestedValue.trim().length > 0) {
      return nestedValue.trim();
    }
  }

  return null;
}

function getNumber(
  value: unknown,
  keys: string[]
): number | null {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const nestedValue = value[key];
    if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
      return nestedValue;
    }
    if (typeof nestedValue === "string" && /^\d+$/u.test(nestedValue)) {
      return Number.parseInt(nestedValue, 10);
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
