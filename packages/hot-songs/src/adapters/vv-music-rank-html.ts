import { load } from "cheerio";

import type { SourceDefinition, SourceRow } from "../contracts.js";
import { buildSourceFetchHeaders, fetchText } from "../fetch/http.js";
import type { CollectContext } from "../runner.js";

const defaultRowsPerPage = 20;

export async function collectVvMusicRankSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<SourceRow[]> {
  if (source.url === undefined) {
    throw new Error(`Source ${source.id} is missing a VV music rank URL`);
  }

  const collectedAt = context.generatedAt ?? new Date().toISOString();
  const firstPageHtml = await fetchText(
    source.url,
    context.timeoutMs ?? 10000,
    buildSourceFetchHeaders(source)
  );
  const firstPageRows = parseVvMusicRankRows(source, firstPageHtml, collectedAt);
  const totalRows = parseTotalRowCount(firstPageHtml);
  const rowsPerPage = firstPageRows.length || defaultRowsPerPage;
  const maxPage = Math.ceil((totalRows ?? source.targetRows) / rowsPerPage);
  const pagesToFetch = Math.min(maxPage, Math.ceil(source.targetRows / rowsPerPage));
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, pagesToFetch - 1) }, (_, index) =>
      fetchText(
        buildPageUrl(source.url as string, index + 2),
        context.timeoutMs ?? 10000,
        buildSourceFetchHeaders(source)
      )
    )
  );

  return [firstPageHtml, ...remainingPages]
    .flatMap((html) => parseVvMusicRankRows(source, html, collectedAt))
    .map((row, index) => ({
      ...row,
      rank: row.rank ?? index + 1
    }))
    .slice(0, source.targetRows);
}

export function parseVvMusicRankRows(
  source: SourceDefinition,
  html: string,
  collectedAt = new Date().toISOString()
): SourceRow[] {
  const $ = load(html);
  const rows: SourceRow[] = [];

  $(".musicRow").each((index, element) => {
    const item = $(element);
    const rawTitle =
      item.find(".songName a").first().attr("title")?.trim() ??
      item.find(".songName").first().text().trim();
    if (rawTitle.length === 0) {
      return;
    }

    const rawArtists = splitArtists(item.find(".songAuthor").first().text());
    rows.push({
      sourceId: source.id,
      sourceType: source.sourceType,
      provider: source.provider,
      rank: parseRank(item.find(".listNum span").first().text().trim()) ?? index + 1,
      rawTitle,
      rawArtists,
      sourceUrl: source.url ?? null,
      sourcePublishedAt: null,
      collectedAt,
      warnings: rawArtists.length === 0 ? ["missing-artist"] : []
    });
  });

  if (rows.length === 0) {
    throw new Error("VV music rank rows not found");
  }

  return rows;
}

function parseTotalRowCount(html: string): number | null {
  const $ = load(html);
  const totalText = $(".totalPage span").first().text().trim();
  return /^\d+$/u.test(totalText) ? Number.parseInt(totalText, 10) : null;
}

function buildPageUrl(url: string, page: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set("curPage", String(page));
  return parsed.toString();
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
