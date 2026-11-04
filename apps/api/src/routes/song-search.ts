import type { FastifyInstance } from "fastify";
import type {
  OnlineCandidateCard,
  SongSearchIndexedResult,
  SongSearchNasResult,
  SongSearchOnlineResult,
  SongSearchResponse
} from "@home-ktv/domain";
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
      const onlineCandidates = await loadOnlineCandidates(dependencies, query, limit);
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
  candidates: readonly OnlineCatalogCandidate[]
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
    candidates: candidates.map(toOnlineCandidateCard)
  };
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
