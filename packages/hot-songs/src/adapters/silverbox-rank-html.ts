import { load } from "cheerio";

import type { SourceDefinition, SourceRow } from "../contracts.js";
import { buildSourceFetchHeaders, fetchText } from "../fetch/http.js";
import type { CollectContext } from "../runner.js";

export async function collectSilverboxRankSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<SourceRow[]> {
  if (source.url === undefined) {
    throw new Error(`Source ${source.id} is missing a Silverbox rank URL`);
  }

  const html = await fetchText(
    source.url,
    context.timeoutMs ?? 10000,
    buildSourceFetchHeaders(source)
  );
  return parseSilverboxRankRows(
    source,
    html,
    context.generatedAt ?? new Date().toISOString()
  );
}

export function parseSilverboxRankRows(
  source: SourceDefinition,
  html: string,
  collectedAt = new Date().toISOString()
): SourceRow[] {
  const $ = load(html);
  const rows: SourceRow[] = [];

  $(".songList .songItem").each((index, element) => {
    const item = $(element);
    const rawTitle = item.find(".songTitle").first().text().trim();
    if (rawTitle.length === 0) {
      return;
    }

    const rawArtistText =
      item.find("> .singer").first().text().trim() ||
      item.find(".songBox .singer").first().text().trim();
    const rawArtists = splitArtists(rawArtistText);

    rows.push({
      sourceId: source.id,
      sourceType: source.sourceType,
      provider: source.provider,
      rank: parseRank(item.find(".rank span").first().text().trim()) ?? index + 1,
      rawTitle,
      rawArtists,
      sourceUrl: source.url ?? null,
      sourcePublishedAt: null,
      collectedAt,
      warnings: rawArtists.length === 0 ? ["missing-artist"] : []
    });
  });

  if (rows.length === 0) {
    throw new Error("Silverbox rank rows not found");
  }

  return rows;
}

function splitArtists(rawArtists: string): string[] {
  return rawArtists
    .split(/[、,，/&]/u)
    .map((artist) => artist.trim())
    .filter((artist) => artist.length > 0);
}

function parseRank(rankText: string): number | null {
  return /^\d+$/u.test(rankText) ? Number.parseInt(rankText, 10) : null;
}
