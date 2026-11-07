import type { FastifyInstance } from "fastify";
import type {
  OnlineCandidateCard,
  SongSearchIndexedQueueState,
  SongSearchIndexedResult,
  SongSearchNasResult,
  SongSearchOnlineResult,
  SongSearchResponse
} from "@home-ktv/domain";
import { normalizeSearchText } from "../modules/catalog/search-normalization.js";
import type { OnlineCatalogCandidate } from "../modules/online/igeba/igeba-provider.js";
import type { KtvIndexReadRepository } from "../modules/ktv-index/ktv-index-read-repository.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";

export interface SongSearchRouteDependencies {
  rooms: RoomRepository;
  queueEntries: QueueEntryRepository;
  ktvIndex?: Pick<KtvIndexReadRepository, "searchIndexedSongs">;
  onlineCatalog?: {
    search(keyword: string, limit: number): Promise<OnlineCatalogCandidate[]>;
    searchPage?(keyword: string, options: { page: number; pageSize: number }): Promise<{
      candidates: OnlineCatalogCandidate[];
      pageCount: number;
    }>;
  };
}

interface SongSearchQuery {
  q?: string;
  limit?: string | number;
  offset?: string | number;
}

const ONLINE_SEARCH_PAGE_SIZE = 40;

export async function registerSongSearchRoutes(
  server: FastifyInstance,
  dependencies: SongSearchRouteDependencies
): Promise<void> {
  server.get<{ Params: { roomSlug: string }; Querystring: SongSearchQuery }>(
    "/rooms/:roomSlug/songs/search",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const query = String(request.query.q ?? "");
      const rawLimit = request.query.limit;
      const parsedLimit =
        typeof rawLimit === "number" ? Math.trunc(rawLimit) : Number.parseInt(String(rawLimit ?? ""), 10);
      const limit = Math.min(50, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 30));
      const queue = await dependencies.queueEntries.listEffectiveQueue(room.id);
      const queuedNasAssetIds = queue
        .filter((entry) => (entry.source?.sourceType ?? "nas") === "nas")
        .map((entry) => entry.source?.assetId ?? entry.assetId);
      const indexedResults =
        (await dependencies.ktvIndex?.searchIndexedSongs({
          query,
          limit: Math.min(20, limit),
          versionsPerSong: 4,
          queuedIndexedAssetIds: queuedNasAssetIds,
          unreadableIndexedAssetIds: []
        })) ?? [];
      const offset = parseOffset(request.query.offset);
      const onlinePage = await loadOnlineCandidatesPage(dependencies, query, offset);
      const onlineCandidates = annotateNasMatches(onlinePage.candidates, indexedResults);
      const response: SongSearchResponse = {
        query,
        nas: {
          status: indexedResults.length > 0 ? "available" : "unavailable",
          message: indexedResults.length > 0 ? "找到 NAS 曲库结果" : "未找到 NAS 曲库结果",
          results: indexedResults.map(toNasSearchResult)
        },
        online: buildOnlineSection(dependencies, onlineCandidates, onlinePage.nextOffset)
      };

      await reply.send(response);
    }
  );
}

/**
 * 取一页在线搜索结果。
 * igeba 按页给，offset 换算成页码；pageCount 换算成下一页的 offset。
 */
async function loadOnlineCandidatesPage(
  dependencies: SongSearchRouteDependencies,
  query: string,
  offset: number
): Promise<{ candidates: OnlineCatalogCandidate[]; nextOffset: number | null }> {
  const catalog = dependencies.onlineCatalog;
  if (!catalog || query.trim().length === 0) {
    return { candidates: [], nextOffset: null };
  }

  if (catalog.searchPage) {
    const page = Math.floor(offset / ONLINE_SEARCH_PAGE_SIZE) + 1;
    const result = await catalog.searchPage(query, { page, pageSize: ONLINE_SEARCH_PAGE_SIZE });
    const loaded = page * ONLINE_SEARCH_PAGE_SIZE;
    const nextOffset = loaded < result.pageCount * ONLINE_SEARCH_PAGE_SIZE ? loaded : null;
    return { candidates: result.candidates, nextOffset };
  }

  return { candidates: await catalog.search(query, ONLINE_SEARCH_PAGE_SIZE), nextOffset: null };
}

function parseOffset(rawOffset: string | number | undefined): number {
  const parsed =
    typeof rawOffset === "number" ? Math.trunc(rawOffset) : Number.parseInt(String(rawOffset ?? ""), 10);
  return Math.max(0, Number.isFinite(parsed) ? parsed : 0);
}

function buildOnlineSection(
  dependencies: SongSearchRouteDependencies,
  candidates: readonly OnlineCandidateCard[],
  nextOffset: number | null
): SongSearchOnlineResult {
  if (!dependencies.onlineCatalog) {
    return {
      status: "disabled",
      message: "暂不启用线上补歌",
      requestSupplement: {
        visible: false,
        label: "请求补歌"
      },
      candidates: [],
      nextOffset: null
    };
  }

  return {
    status: "available",
    message: candidates.length > 0 ? `找到 ${candidates.length} 首在线曲库结果` : "未找到在线曲库结果",
    requestSupplement: {
      visible: false,
      label: "请求补歌"
    },
    candidates: [...candidates],
    nextOffset
  };
}

/**
 * 在线候选命中 NAS 曲库时，给它挂上可直接入队的本库资产。
 *
 * 这里不再像以前那样把重复项从在线结果里删掉：搜索面板只展示在线曲库，
 * 一旦删掉，本该用 NAS 文件播放的歌就会在搜索结果里彻底消失。
 */
function annotateNasMatches(
  candidates: readonly OnlineCatalogCandidate[],
  nasResults: readonly SongSearchIndexedResult[]
): OnlineCandidateCard[] {
  const nasMatchByKey = new Map<string, { assetId: string; queueState: SongSearchIndexedQueueState }>();
  if (nasResults.length > 0) {
    for (const result of nasResults) {
      const match = pickQueueableAsset(result);
      if (match) {
        nasMatchByKey.set(searchKey(result.title, result.artistName), match);
      }
    }
  }

  return candidates.map((candidate) => {
    const card = toOnlineCandidateCard(candidate);
    const match = nasMatchByKey.get(searchKey(candidate.title, candidate.artistName));
    if (!match) {
      return card;
    }
    return { ...card, nasAssetId: match.assetId, nasQueueState: match.queueState };
  });
}

function pickQueueableAsset(
  result: SongSearchIndexedResult
): { assetId: string; queueState: SongSearchIndexedQueueState } | null {
  const preferred =
    result.versions.find((version) => version.canQueue && version.queueState === "not_queued") ??
    result.versions.find((version) => version.canQueue);
  if (!preferred) {
    return null;
  }
  return { assetId: preferred.indexedAssetId, queueState: preferred.queueState };
}

function searchKey(title: string, artistName: string): string {
  return `${normalizeSearchText(title)}|${normalizeSearchText(artistName)}`;
}

function toOnlineCandidateCard(candidate: OnlineCatalogCandidate): OnlineCandidateCard {
  return {
    provider: candidate.provider,
    providerCandidateId: candidate.providerSongId,
    title: candidate.title,
    artistName: candidate.artistName,
    sourceLabel: candidate.sourceLabel,
    durationMs: candidate.durationMs,
    candidateType: "mv",
    reliabilityLabel: "medium",
    riskLabel: "normal",
    taskState: "discovered",
    taskId: null
  };
}

function toNasSearchResult(record: SongSearchIndexedResult): SongSearchNasResult {
  return {
    songId: record.indexedSongId,
    title: record.title,
    artistName: record.artistName,
    ...(record.styleTags ? { styleTags: record.styleTags } : {}),
    category: record.category,
    sourceLabel: "NAS曲库",
    matchReason: record.matchReason,
    versions: record.versions.map((version) => ({
      assetId: version.indexedAssetId,
      displayName: version.displayName,
      sourceLabel: "NAS曲库",
      extension: version.extension,
      sizeBytes: version.sizeBytes,
      audioTrackCount: version.audioTrackCount,
      ...(version.styleTags ? { styleTags: version.styleTags } : {}),
      category: version.category,
      queueState: version.queueState,
      canQueue: version.canQueue,
      disabledLabel: version.disabledLabel
    }))
  };
}
