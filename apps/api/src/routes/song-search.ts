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
  };
}

interface SongSearchQuery {
  q?: string;
  limit?: string | number;
}

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
      const onlineCandidates = annotateNasMatches(
        await loadOnlineCandidates(dependencies, query, limit),
        indexedResults
      );
      const response: SongSearchResponse = {
        query,
        nas: {
          status: indexedResults.length > 0 ? "available" : "unavailable",
          message: indexedResults.length > 0 ? "找到 NAS 曲库结果" : "未找到 NAS 曲库结果",
          results: indexedResults.map(toNasSearchResult)
        },
        online: buildOnlineSection(dependencies, onlineCandidates)
      };

      await reply.send(response);
    }
  );
}

async function loadOnlineCandidates(
  dependencies: SongSearchRouteDependencies,
  query: string,
  limit: number
): Promise<OnlineCatalogCandidate[]> {
  if (!dependencies.onlineCatalog || query.trim().length === 0) {
    return [];
  }
  return dependencies.onlineCatalog.search(query, Math.min(limit, 20));
}

function buildOnlineSection(
  dependencies: SongSearchRouteDependencies,
  candidates: readonly OnlineCandidateCard[]
): SongSearchOnlineResult {
  if (!dependencies.onlineCatalog) {
    return {
      status: "disabled",
      message: "暂不启用线上补歌",
      requestSupplement: {
        visible: false,
        label: "请求补歌"
      },
      candidates: []
    };
  }

  return {
    status: "available",
    message: candidates.length > 0 ? `找到 ${candidates.length} 首在线曲库结果` : "未找到在线曲库结果",
    requestSupplement: {
      visible: false,
      label: "请求补歌"
    },
    candidates: [...candidates]
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
