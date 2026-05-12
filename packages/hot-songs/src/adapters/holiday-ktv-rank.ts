import type { SourceDefinition, SourceRow } from "../contracts.js";
import { buildSourceFetchHeaders, fetchJson } from "../fetch/http.js";
import type { CollectContext } from "../runner.js";

export async function collectHolidayKtvRankSource(
  source: SourceDefinition,
  context: CollectContext
): Promise<SourceRow[]> {
  if (source.url === undefined) {
    throw new Error(`Source ${source.id} is missing a Holiday KTV URL`);
  }

  const firstPage = await fetchHolidayPage(source, context, 1);
  const maxPage = findMaxPage(firstPage);
  const remainingPageCount = Math.max(0, maxPage - 1);
  const remainingPages = await Promise.all(
    Array.from({ length: remainingPageCount }, (_, index) =>
      fetchHolidayPage(source, context, index + 2)
    )
  );

  return parseHolidayKtvRankRows(
    source,
    [firstPage, ...remainingPages],
    context.generatedAt ?? new Date().toISOString()
  );
}

export function parseHolidayKtvRankRows(
  source: SourceDefinition,
  data: unknown,
  collectedAt = new Date().toISOString()
): SourceRow[] {
  const pages = normalizePages(data);
  const sourcePublishedAt = pages
    .map((page) => decodeDate(getString(page, "sdate")))
    .find((date): date is string => date !== null) ?? null;

  const rows = pages.flatMap((page) => {
    const list = Array.isArray(page.DataList) ? page.DataList : [];
    return list
      .map((item, index) =>
        parseHolidayRow(source, item, index + 1, sourcePublishedAt, collectedAt)
      )
      .filter((row): row is SourceRow => row !== null);
  });

  if (rows.length === 0) {
    throw new Error("Holiday KTV rank rows not found");
  }

  return rows.map((row, index) => ({
    ...row,
    rank: row.rank ?? index + 1
  }));
}

async function fetchHolidayPage(
  source: SourceDefinition,
  context: CollectContext,
  page: number
): Promise<unknown> {
  return fetchJson("https://www.holiday.com.tw/Ashx/SongInfo.ashx", context.timeoutMs ?? 10000, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      referer: source.url ?? "https://www.holiday.com.tw/SongInfo/SongList.aspx",
      ...buildSourceFetchHeaders(source)
    },
    body: JSON.stringify([{ m: "top", ltype: "tc", page }])
  });
}

function normalizePages(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data) && data.every((item) => isRecord(item))) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.flatMap(normalizePages);
  }

  return isRecord(data) ? [data] : [];
}

function parseHolidayRow(
  source: SourceDefinition,
  item: unknown,
  fallbackRank: number,
  sourcePublishedAt: string | null,
  collectedAt: string
): SourceRow | null {
  if (!isRecord(item)) {
    return null;
  }

  const rawTitle = decodeText(getString(item, "songname"));
  if (rawTitle === null) {
    return null;
  }

  const rawArtists = splitArtists(decodeText(getString(item, "singer")) ?? "");
  return {
    sourceId: source.id,
    sourceType: source.sourceType,
    provider: source.provider,
    rank: parseRank(getString(item, "thisweek")) ?? fallbackRank,
    rawTitle,
    rawArtists,
    sourceUrl: source.url ?? null,
    sourcePublishedAt,
    collectedAt,
    warnings: rawArtists.length === 0 ? ["missing-artist"] : []
  };
}

function findMaxPage(data: unknown): number {
  const pages = normalizePages(data);
  for (const page of pages) {
    const pageList = page.Page;
    if (!Array.isArray(pageList)) {
      continue;
    }

    for (const item of pageList) {
      if (!isRecord(item)) {
        continue;
      }

      const maxPage = getNumber(item, "MaxPage");
      if (maxPage !== null) {
        return maxPage;
      }
    }
  }

  return 1;
}

function decodeDate(value: string | null): string | null {
  const decoded = decodeText(value);
  if (decoded === null) {
    return null;
  }

  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/u.exec(decoded);
  return match === null ? null : `${match[1]}-${match[2]}-${match[3]}`;
}

function decodeText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function splitArtists(rawArtists: string): string[] {
  return rawArtists
    .replaceAll("．", "、")
    .split(/[、,，/&]/u)
    .map((artist) => artist.trim())
    .filter((artist) => artist.length > 0);
}

function parseRank(value: string | null): number | null {
  return value !== null && /^\d+$/u.test(value) ? Number.parseInt(value, 10) : null;
}

function getString(value: Record<string, unknown>, key: string): string | null {
  const nestedValue = value[key];
  return typeof nestedValue === "string" && nestedValue.trim().length > 0
    ? nestedValue.trim()
    : null;
}

function getNumber(value: Record<string, unknown>, key: string): number | null {
  const nestedValue = value[key];
  if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
    return nestedValue;
  }

  return typeof nestedValue === "string" && /^\d+$/u.test(nestedValue)
    ? Number.parseInt(nestedValue, 10)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
