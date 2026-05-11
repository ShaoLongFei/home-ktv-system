import { load } from "cheerio";

import type { SourceDefinition, SourceRow } from "../contracts.js";
import { buildSourceFetchHeaders, fetchText } from "../fetch/http.js";
import type { CollectContext } from "../runner.js";

export async function collectTencentMusicYobangSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<SourceRow[]> {
  if (source.url === undefined) {
    throw new Error(`Source ${source.id} is missing a Tencent Music chart URL`);
  }

  const html = await fetchText(
    source.url,
    context.timeoutMs ?? 10000,
    buildSourceFetchHeaders(source)
  );
  return parseTencentMusicYobangRows(
    source,
    html,
    context.generatedAt ?? new Date().toISOString()
  );
}

export function parseTencentMusicYobangRows(
  source: SourceDefinition,
  html: string,
  collectedAt = new Date().toISOString()
): SourceRow[] {
  const $ = load(html);
  const jsonText = $("#__NEXT_DATA__").text().trim();
  if (jsonText.length === 0) {
    throw new Error("Tencent Music chart data not found");
  }

  const data = JSON.parse(jsonText) as unknown;
  const pageProps = getRecord(getRecord(getRecord(data, "props"), "pageProps"), "");
  const sourcePublishedAt = findDateString(pageProps) ?? findDateString(data);
  const chartsList = findChartsList(data);
  const rows = chartsList
    .map((item, index) => parseSongRow(source, item, index + 1, sourcePublishedAt, collectedAt))
    .filter((row): row is SourceRow => row !== null);

  if (rows.length === 0) {
    throw new Error("Tencent Music chart data not found");
  }

  return rows;
}

function findChartsList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.some((item) => parseTitle(item) !== null)
      ? value
      : value.flatMap(findChartsList);
  }

  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.chartsList)) {
    return value.chartsList;
  }

  for (const nestedValue of Object.values(value)) {
    const rows = findChartsList(nestedValue);
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
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

  const rawTitle = parseTitle(item);
  if (rawTitle === null) {
    return null;
  }

  const rawArtists = normalizeArtists(item.singerName ?? item.singers ?? item.artist);

  return {
    sourceId: source.id,
    sourceType: source.sourceType,
    provider: source.provider,
    rank: getNumber(item.rank) ?? fallbackRank,
    rawTitle,
    rawArtists,
    sourceUrl: source.url ?? null,
    sourcePublishedAt,
    collectedAt,
    warnings: rawArtists.length === 0 ? ["missing-artist"] : []
  };
}

function parseTitle(item: unknown): string | null {
  if (!isRecord(item)) {
    return null;
  }

  for (const key of ["songName", "trackNameShow", "name", "title"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeArtists(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[、,，/&]/u)
      .map((artist) => artist.trim())
      .filter((artist) => artist.length > 0);
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeArtists);
  }

  if (isRecord(value)) {
    return normalizeArtists(value.name);
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

  for (const nestedValue of Object.values(value)) {
    const dateString = findDateString(nestedValue);
    if (dateString !== null) {
      return dateString;
    }
  }

  return null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/u.test(value)) {
    return Number.parseInt(value, 10);
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

  if (key.length === 0) {
    return value;
  }

  const nestedValue = value[key];
  return isRecord(nestedValue) ? nestedValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
