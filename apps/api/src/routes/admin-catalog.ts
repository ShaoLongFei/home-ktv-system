import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  Asset,
  AssetStatus,
  Language,
  LyricMode,
  SongStatus,
  SwitchQualityStatus,
  VocalMode
} from "@home-ktv/domain";
import type {
  CatalogAdmissionService,
  FormalPairEvaluation,
  UpdateFormalAssetWithRevalidationInput
} from "../modules/catalog/admission-service.js";
import type {
  AdminCatalogSongRecord,
  AdminCatalogSongRepository,
  UpdateSongMetadataInput
} from "../modules/catalog/repositories/song-repository.js";

export interface AdminCatalogRouteDependencies {
  songs: Pick<
    AdminCatalogSongRepository,
    | "listFormalSongs"
    | "getFormalSongWithAssets"
    | "updateSongMetadata"
    | "updateDefaultAsset"
  >;
  admissionService: Pick<CatalogAdmissionService, "revalidateFormalSong" | "updateFormalAssetWithRevalidation">;
}

const songStatuses: SongStatus[] = ["ready", "review_required", "unavailable"];
const languages: Language[] = ["mandarin", "cantonese", "other"];
const assetStatuses: AssetStatus[] = ["ready", "caching", "failed", "unavailable", "stale", "promoted"];
const vocalModes: VocalMode[] = ["original", "instrumental", "dual", "unknown"];
const lyricModes: LyricMode[] = ["hard_sub", "soft_sub", "external_lrc", "none"];
const switchQualityStatuses: SwitchQualityStatus[] = ["verified", "review_required", "rejected", "unknown"];

export async function registerAdminCatalogRoutes(
  server: FastifyInstance,
  dependencies: AdminCatalogRouteDependencies
): Promise<void> {
  server.get("/admin/catalog/songs", async (request, reply) => {
    const filters = parseListFilters(request.query);
    if (!filters) {
      return reply.code(400).send({ error: "INVALID_CATALOG_FILTER" });
    }

    const songs = await dependencies.songs.listFormalSongs(filters);
    return { songs: songs.map(serializeCatalogSongRecord) };
  });

  server.get("/admin/catalog/songs/:songId", async (request, reply) => {
    const { songId } = request.params as { songId: string };
    const record = await dependencies.songs.getFormalSongWithAssets(songId);
    if (!record) {
      return reply.code(404).send({ error: "FORMAL_SONG_NOT_FOUND" });
    }

    return { song: serializeCatalogSongRecord(record) };
  });

  server.patch("/admin/catalog/songs/:songId", async (request, reply) => {
    const { songId } = request.params as { songId: string };
    const metadata = parseSongMetadataPatch(request.body);
    if (!metadata) {
      return reply.code(400).send({ error: "INVALID_SONG_METADATA" });
    }

    const record = await dependencies.songs.updateSongMetadata(songId, metadata);
    if (!record) {
      return reply.code(404).send({ error: "FORMAL_SONG_NOT_FOUND" });
    }

    return { song: serializeCatalogSongRecord(record) };
  });

  server.patch("/admin/catalog/songs/:songId/default-asset", async (request, reply) => {
    const { songId } = request.params as { songId: string };
    const assetId = parseDefaultAssetPatch(request.body);
    if (!assetId) {
      return reply.code(400).send({ error: "INVALID_DEFAULT_ASSET" });
    }

    const record = await dependencies.songs.updateDefaultAsset(songId, assetId);
    if (!record) {
      return reply.code(404).send({ error: "FORMAL_SONG_OR_ASSET_NOT_FOUND" });
    }

    const revalidated = await dependencies.admissionService.revalidateFormalSong(songId);
    return {
      song: serializeCatalogSongRecord(revalidated.record),
      evaluation: serializeEvaluation(revalidated.evaluation)
    };
  });

  server.patch("/admin/catalog/assets/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const patch = parseAssetPatch(request.body);
    if (!patch) {
      return reply.code(400).send({ error: "INVALID_ASSET_PATCH" });
    }

    try {
      const result = await dependencies.admissionService.updateFormalAssetWithRevalidation({ assetId, patch });
      return {
        song: serializeCatalogSongRecord(result.record),
        asset: serializeAsset(result.asset),
        evaluation: serializeEvaluation(result.evaluation)
      };
    } catch (error) {
      return handleCatalogError(reply, error);
    }
  });

  server.post("/admin/catalog/songs/:songId/revalidate", async (request, reply) => {
    const { songId } = request.params as { songId: string };
    try {
      const result = await dependencies.admissionService.revalidateFormalSong(songId);
      return {
        song: serializeCatalogSongRecord(result.record),
        evaluation: serializeEvaluation(result.evaluation)
      };
    } catch (error) {
      return handleCatalogError(reply, error);
    }
  });
}

function parseListFilters(query: unknown): { status?: SongStatus; language?: Language; query?: string } | null {
  const input = isRecord(query) ? query : {};
  const filters: { status?: SongStatus; language?: Language; query?: string } = {};

  if (typeof input.status === "string") {
    if (!isSongStatus(input.status)) {
      return null;
    }
    filters.status = input.status;
  }
  if (typeof input.language === "string") {
    if (!isLanguage(input.language)) {
      return null;
    }
    filters.language = input.language;
  }
  if (typeof input.q === "string") {
    filters.query = input.q;
  }

  return filters;
}

function parseSongMetadataPatch(body: unknown): UpdateSongMetadataInput | null {
  if (!isRecord(body)) {
    return {};
  }

  const input: UpdateSongMetadataInput = {};
  if (typeof body.title === "string") {
    input.title = body.title;
  }
  if (typeof body.artistName === "string") {
    input.artistName = body.artistName;
  }
  if (typeof body.language === "string" && isLanguage(body.language)) {
    input.language = body.language;
  } else if (body.language !== undefined) {
    return null;
  }
  if (Array.isArray(body.genre) && body.genre.every((item) => typeof item === "string")) {
    input.genre = body.genre;
  }
  if (Array.isArray(body.tags) && body.tags.every((item) => typeof item === "string")) {
    input.tags = body.tags;
  }
  if (Array.isArray(body.aliases) && body.aliases.every((item) => typeof item === "string")) {
    input.aliases = body.aliases;
  }
  if (Array.isArray(body.searchHints) && body.searchHints.every((item) => typeof item === "string")) {
    input.searchHints = body.searchHints;
  }
  if (typeof body.releaseYear === "number" || body.releaseYear === null) {
    input.releaseYear = body.releaseYear;
  }

  return input;
}

function parseDefaultAssetPatch(body: unknown): string | null {
  return isRecord(body) && typeof body.assetId === "string" && body.assetId.trim() ? body.assetId : null;
}

function parseAssetPatch(body: unknown): UpdateFormalAssetWithRevalidationInput["patch"] | null {
  if (!isRecord(body)) {
    return {};
  }

  const input: UpdateFormalAssetWithRevalidationInput["patch"] = {};
  if (typeof body.status === "string" && isAssetStatus(body.status)) {
    input.status = body.status;
  } else if (body.status !== undefined) {
    return null;
  }
  if (typeof body.vocalMode === "string" && isVocalMode(body.vocalMode)) {
    input.vocalMode = body.vocalMode;
  } else if (body.vocalMode !== undefined) {
    return null;
  }
  if (typeof body.lyricMode === "string" && isLyricMode(body.lyricMode)) {
    input.lyricMode = body.lyricMode;
  } else if (body.lyricMode !== undefined) {
    return null;
  }
  if (typeof body.switchFamily === "string" || body.switchFamily === null) {
    input.switchFamily = body.switchFamily;
  } else if (body.switchFamily !== undefined) {
    return null;
  }
  if (typeof body.switchQualityStatus === "string" && isSwitchQualityStatus(body.switchQualityStatus)) {
    input.switchQualityStatus = body.switchQualityStatus;
  } else if (body.switchQualityStatus !== undefined) {
    return null;
  }
  if (typeof body.durationMs === "number" && Number.isInteger(body.durationMs) && body.durationMs >= 0) {
    input.durationMs = body.durationMs;
  } else if (body.durationMs !== undefined) {
    return null;
  }

  return input;
}

function serializeCatalogSongRecord(record: AdminCatalogSongRecord) {
  return {
    ...record.song,
    defaultAsset: record.defaultAsset ? serializeAsset(record.defaultAsset) : null,
    assets: record.assets.map(serializeAsset)
  };
}

function serializeAsset(asset: Asset) {
  return asset;
}

function serializeEvaluation(evaluation: FormalPairEvaluation) {
  return {
    status: evaluation.status,
    reason: evaluation.reason
  };
}

function handleCatalogError(reply: FastifyReply, error: unknown) {
  if (isRecord(error) && typeof error.code === "string") {
    const statusCode = error.code === "FORMAL_SONG_NOT_FOUND" || error.code === "FORMAL_ASSET_NOT_FOUND" ? 404 : 400;
    return reply.code(statusCode).send({
      error: error.code,
      reason: typeof error.reason === "string" ? error.reason : undefined
    });
  }

  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSongStatus(value: string): value is SongStatus {
  return songStatuses.includes(value as SongStatus);
}

function isLanguage(value: string): value is Language {
  return languages.includes(value as Language);
}

function isAssetStatus(value: string): value is AssetStatus {
  return assetStatuses.includes(value as AssetStatus);
}

function isVocalMode(value: string): value is VocalMode {
  return vocalModes.includes(value as VocalMode);
}

function isLyricMode(value: string): value is LyricMode {
  return lyricModes.includes(value as LyricMode);
}

function isSwitchQualityStatus(value: string): value is SwitchQualityStatus {
  return switchQualityStatuses.includes(value as SwitchQualityStatus);
}
