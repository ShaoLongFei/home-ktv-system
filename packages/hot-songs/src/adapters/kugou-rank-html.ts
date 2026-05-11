import { load } from "cheerio";

import type { SourceDefinition, SourceRow } from "../contracts.js";
import { buildSourceFetchHeaders, fetchText } from "../fetch/http.js";
import type { CollectContext } from "../runner.js";

export async function collectKugouRankHtmlSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<SourceRow[]> {
  if (source.url === undefined) {
    throw new Error(`Source ${source.id} is missing a Kugou rank URL`);
  }

  const urls = source.urls ?? [source.url];
  const pages = await Promise.all(
    urls.map((url) =>
      fetchText(
        url,
        context.timeoutMs ?? 10000,
        buildSourceFetchHeaders(source)
      )
    )
  );

  return parseKugouRankHtmlRows(
    source,
    pages.length === 1 ? pages[0] ?? "" : pages,
    context.generatedAt ?? new Date().toISOString()
  );
}

export function parseKugouRankHtmlRows(
  source: SourceDefinition,
  html: string | readonly string[],
  collectedAt = new Date().toISOString()
): SourceRow[] {
  if (typeof html !== "string") {
    const rows = html.flatMap((pageHtml, pageIndex) =>
      parseKugouRankHtmlPageRows(
        source,
        pageHtml,
        collectedAt,
        source.urls?.[pageIndex] ?? source.url ?? null
      )
    );

    return rows.map((row, index) => ({
      ...row,
      rank:
        row.rank !== null && row.rank > index
          ? row.rank
          : index + 1
    }));
  }

  return parseKugouRankHtmlPageRows(
    source,
    html,
    collectedAt,
    source.url ?? source.urls?.[0] ?? null
  );
}

function parseKugouRankHtmlPageRows(
  source: SourceDefinition,
  html: string,
  collectedAt: string,
  sourceUrl: string | null
): SourceRow[] {
  const $ = load(html);
  const rows: SourceRow[] = [];

  $(".pc_temp_songlist li").each((index, element) => {
    const item = $(element);
    const rankText = item.find(".pc_temp_num").first().text().trim();
    const songNode = item.find(".pc_temp_songname").first();
    const rawText = (songNode.attr("title") ?? songNode.text()).trim();
    const parsed = parseKugouTitle(rawText);
    if (parsed === null) {
      return;
    }

    rows.push({
      sourceId: source.id,
      sourceType: source.sourceType,
      provider: source.provider,
      rank: parseRank(rankText) ?? index + 1,
      rawTitle: parsed.title,
      rawArtists: parsed.artists,
      sourceUrl,
      sourcePublishedAt: null,
      collectedAt,
      warnings: parsed.artists.length === 0 ? ["missing-artist"] : []
    });
  });

  if (rows.length === 0) {
    throw new Error("Kugou rank rows not found");
  }

  return rows;
}

function parseKugouTitle(
  rawText: string
): { artists: string[]; title: string } | null {
  if (rawText.length === 0) {
    return null;
  }

  const separatorIndex = rawText.indexOf(" - ");
  if (separatorIndex === -1) {
    return {
      artists: [],
      title: rawText
    };
  }

  return {
    artists: splitArtists(rawText.slice(0, separatorIndex)),
    title: rawText.slice(separatorIndex + 3).trim()
  };
}

function splitArtists(rawArtists: string): string[] {
  return rawArtists
    .split(/[、/&]/u)
    .map((artist) => artist.trim())
    .filter((artist) => artist.length > 0);
}

function parseRank(rankText: string): number | null {
  return /^\d+$/u.test(rankText) ? Number.parseInt(rankText, 10) : null;
}
