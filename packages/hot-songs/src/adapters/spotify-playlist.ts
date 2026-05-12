import { load } from "cheerio";

import type { SourceDefinition, SourceRow } from "../contracts.js";
import { buildSourceFetchHeaders, fetchText } from "../fetch/http.js";
import type { CollectContext } from "../runner.js";

export async function collectSpotifyPlaylistSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<SourceRow[]> {
  if (source.url === undefined) {
    throw new Error(`Source ${source.id} is missing a Spotify playlist URL`);
  }

  const html = await fetchText(
    buildSpotifyEmbedUrl(source.url),
    context.timeoutMs ?? 10000,
    buildSourceFetchHeaders(source)
  );
  return parseSpotifyPlaylistRows(
    source,
    html,
    context.generatedAt ?? new Date().toISOString()
  );
}

export function parseSpotifyPlaylistRows(
  source: SourceDefinition,
  html: string,
  collectedAt = new Date().toISOString()
): SourceRow[] {
  const rows = parseRowsFromJsonScripts(source, html, collectedAt);
  if (rows.length > 0) {
    return rows;
  }

  const domRows = parseRowsFromDom(source, html, collectedAt);
  if (domRows.length > 0) {
    return domRows;
  }

  throw new Error("Spotify playlist rows not found");
}

function buildSpotifyEmbedUrl(url: string): string {
  const parsed = new URL(url);
  const playlistId = parsed.pathname.split("/").filter(Boolean).at(-1);
  if (playlistId === undefined || playlistId.length === 0) {
    return url;
  }

  return `https://open.spotify.com/embed/playlist/${playlistId}`;
}

function parseRowsFromJsonScripts(
  source: SourceDefinition,
  html: string,
  collectedAt: string
): SourceRow[] {
  const $ = load(html);
  const candidates: SourceRow[][] = [];

  $("script").each((_, element) => {
    const scriptText = $(element).text().trim();
    if (scriptText.length === 0 || !scriptText.includes("{")) {
      return;
    }

    try {
      collectCandidateRows(
        JSON.parse(scriptText) as unknown,
        source,
        collectedAt,
        candidates
      );
    } catch {
      // Many Spotify scripts are executable code rather than JSON state.
    }
  });

  candidates.sort((left, right) => right.length - left.length);
  return candidates[0] ?? [];
}

function collectCandidateRows(
  value: unknown,
  source: SourceDefinition,
  collectedAt: string,
  candidates: SourceRow[][]
): void {
  if (Array.isArray(value)) {
    const rows = value
      .map((item, index) => parseSpotifyRow(source, item, index + 1, collectedAt))
      .filter((row): row is SourceRow => row !== null);
    if (rows.length > 0) {
      candidates.push(rows);
    }

    for (const item of value) {
      collectCandidateRows(item, source, collectedAt, candidates);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const nestedValue of Object.values(value)) {
    collectCandidateRows(nestedValue, source, collectedAt, candidates);
  }
}

function parseSpotifyRow(
  source: SourceDefinition,
  item: unknown,
  rank: number,
  collectedAt: string
): SourceRow | null {
  if (!isRecord(item)) {
    return null;
  }

  const track =
    getRecord(item, "track") ??
    getRecord(item, "episode") ??
    getRecord(item, "item") ??
    item;
  const rawTitle = getString(track, ["name", "title"]);
  const rawArtists = extractArtists(track);

  if (rawTitle === null || rawArtists.length === 0) {
    return null;
  }

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
    warnings: []
  };
}

function parseRowsFromDom(
  source: SourceDefinition,
  html: string,
  collectedAt: string
): SourceRow[] {
  const $ = load(html);
  const rows: SourceRow[] = [];

  $('[data-testid="tracklist-row"], [role="row"]').each((index, element) => {
    const item = $(element);
    const textParts = item
      .text()
      .split(/\n+/u)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const rawTitle = textParts[0];
    const rawArtist = textParts[1];
    if (rawTitle === undefined || rawArtist === undefined) {
      return;
    }

    rows.push({
      sourceId: source.id,
      sourceType: source.sourceType,
      provider: source.provider,
      rank: index + 1,
      rawTitle,
      rawArtists: splitArtists(rawArtist),
      sourceUrl: source.url ?? null,
      sourcePublishedAt: null,
      collectedAt,
      warnings: []
    });
  });

  return rows;
}

function extractArtists(value: Record<string, unknown>): string[] {
  const artistValue =
    value.artists ??
    value.artist ??
    value.singers ??
    value.singer ??
    value.artistName ??
    value.subtitle;

  if (typeof artistValue === "string") {
    return splitArtists(artistValue);
  }

  if (Array.isArray(artistValue)) {
    return artistValue.flatMap((artist) => {
      if (typeof artist === "string") {
        return splitArtists(artist);
      }

      if (isRecord(artist)) {
        const name = getString(artist, ["name", "title"]);
        return name === null ? [] : [name];
      }

      return [];
    });
  }

  if (isRecord(artistValue)) {
    const name = getString(artistValue, ["name", "title"]);
    return name === null ? [] : [name];
  }

  return [];
}

function splitArtists(rawArtists: string): string[] {
  return rawArtists
    .split(/[、,，/&]/u)
    .map((artist) => artist.trim())
    .filter((artist) => artist.length > 0);
}

function getRecord(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const nestedValue = value[key];
  return isRecord(nestedValue) ? nestedValue : null;
}

function getString(
  value: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const nestedValue = value[key];
    if (typeof nestedValue === "string" && nestedValue.trim().length > 0) {
      return nestedValue.trim();
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
