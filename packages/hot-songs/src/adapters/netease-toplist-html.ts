import { load } from "cheerio";

import type { SourceDefinition, SourceRow } from "../contracts.js";
import { buildSourceFetchHeaders, fetchText } from "../fetch/http.js";
import type { CollectContext } from "../runner.js";

export async function collectNeteaseToplistHtmlSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<SourceRow[]> {
  if (source.url === undefined) {
    throw new Error(`Source ${source.id} is missing a NetEase toplist URL`);
  }

  const html = await fetchText(
    source.url,
    context.timeoutMs ?? 10000,
    buildSourceFetchHeaders(source)
  );
  return parseNeteaseToplistHtmlRows(
    source,
    html,
    context.generatedAt ?? new Date().toISOString()
  );
}

export function parseNeteaseToplistHtmlRows(
  source: SourceDefinition,
  html: string,
  collectedAt = new Date().toISOString()
): SourceRow[] {
  const $ = load(html);
  const jsonText = $("#song-list-pre-data").text().trim();
  if (jsonText.length === 0) {
    throw new Error("NetEase toplist data not found");
  }

  const data = JSON.parse(jsonText) as unknown;
  const songRows = Array.isArray(data) ? data : [];
  const rows = songRows
    .map((item, index) => parseSongRow(source, item, index + 1, collectedAt))
    .filter((row): row is SourceRow => row !== null);

  if (rows.length === 0) {
    throw new Error("NetEase toplist data not found");
  }

  return rows;
}

function parseSongRow(
  source: SourceDefinition,
  item: unknown,
  rank: number,
  collectedAt: string
): SourceRow | null {
  if (!isRecord(item)) {
    return null;
  }

  const rawTitle = getString(item, "name") ?? getString(item, "title");
  if (rawTitle === null) {
    return null;
  }

  const rawArtists = normalizeArtists(item.artists ?? item.ar ?? item.singers);

  return {
    sourceId: source.id,
    sourceType: source.sourceType,
    provider: source.provider,
    rank,
    rawTitle,
    rawArtists,
    sourceUrl: source.url ?? null,
    sourcePublishedAt: null,
    collectedAt,
    warnings: rawArtists.length === 0 ? ["missing-artist"] : []
  };
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
    const artistName = getString(value, "name");
    return artistName === null ? [] : [artistName];
  }

  return [];
}

function getString(
  value: Record<string, unknown>,
  key: string
): string | null {
  const nestedValue = value[key];
  return typeof nestedValue === "string" && nestedValue.trim().length > 0
    ? nestedValue.trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
