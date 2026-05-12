import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  ImportCandidateFileDetail,
  ImportFileRootKind,
  ImportCandidateStatus,
  ImportScanScope,
  Language,
  VocalMode,
  AssetKind
} from "@home-ktv/domain";
import type {
  ImportCandidateRepository,
  ImportCandidateWithFiles,
  UpdateImportCandidateMetadataInput
} from "../modules/ingest/repositories/import-candidate-repository.js";
import type { ScanScheduler } from "../modules/ingest/scan-scheduler.js";
import type { CatalogAdmissionService, ConflictResolution } from "../modules/catalog/admission-service.js";
import type { LibraryPaths } from "../modules/ingest/library-paths.js";

export interface AdminImportRouteDependencies {
  importCandidates: Pick<
    ImportCandidateRepository,
    "listCandidates" | "getCandidateWithFiles" | "updateCandidateMetadata"
  >;
  scanScheduler: Pick<ScanScheduler, "enqueueManualScan">;
  admissionService?: Pick<
    CatalogAdmissionService,
    "holdCandidate" | "rejectDeleteCandidate" | "approveCandidate" | "resolveCandidateConflict"
  >;
  paths?: LibraryPaths;
}

const importCandidateStatuses: ImportCandidateStatus[] = ["pending", "held", "review_required", "conflict"];
const scanScopes: ImportScanScope[] = ["imports", "songs", "all"];
const languages: Language[] = ["mandarin", "cantonese", "other"];
const vocalModes: VocalMode[] = ["original", "instrumental", "dual", "unknown"];
const assetKinds: AssetKind[] = ["video", "audio+lyrics", "dual-track-video"];

export async function registerAdminImportRoutes(
  server: FastifyInstance,
  dependencies: AdminImportRouteDependencies
): Promise<void> {
  server.get("/admin/import-candidates", async (request, reply) => {
    const statuses = parseStatusFilter(request.query);
    if (!statuses) {
      return reply.code(400).send({ error: "INVALID_STATUS_FILTER" });
    }

    const candidates = await dependencies.importCandidates.listCandidates({ statuses });
    const records = await Promise.all(
      candidates.map(async (candidate) => {
        const record = await dependencies.importCandidates.getCandidateWithFiles(candidate.id);
        return record ?? { candidate, files: [] };
      })
    );

    return { candidates: records.map(serializeCandidateWithFiles) };
  });

  server.get("/admin/import-candidates/:candidateId", async (request, reply) => {
    const { candidateId } = request.params as { candidateId: string };
    const record = await dependencies.importCandidates.getCandidateWithFiles(candidateId);
    if (!record) {
      return reply.code(404).send({ error: "IMPORT_CANDIDATE_NOT_FOUND" });
    }

    return { candidate: serializeCandidateWithFiles(record) };
  });

  server.get("/admin/import-candidates/:candidateId/files/:candidateFileId/cover", async (request, reply) => {
    const paths = dependencies.paths;
    if (!paths) {
      return reply.code(404).send({ error: "IMPORT_COVER_NOT_FOUND" });
    }

    const { candidateId, candidateFileId } = request.params as { candidateId: string; candidateFileId: string };
    const record = await dependencies.importCandidates.getCandidateWithFiles(candidateId);
    const file = record?.files.find((item) => item.id === candidateFileId);
    if (!record || !file) {
      return reply.code(404).send({ error: "IMPORT_COVER_NOT_FOUND" });
    }

    const realMv = readRealMvPreview(file.probeSummary, record.candidate.candidateMeta.realMv);
    const cover = realMv ? readCoverSidecar(realMv) : null;
    const contentType = cover ? readCoverContentType(cover) : null;
    if (!cover || !contentType) {
      return reply.code(404).send({ error: "IMPORT_COVER_NOT_FOUND" });
    }

    const rootPath = rootPathFor(file.rootKind, paths);
    const coverPath = resolveSidecarPath(rootPath, String(cover.relativePath));
    if (!coverPath.ok) {
      return reply.code(404).send({ error: "IMPORT_COVER_OUTSIDE_ROOT" });
    }

    try {
      const fileStat = await stat(coverPath.path);
      if (!fileStat.isFile()) {
        return reply.code(404).send({ error: "IMPORT_COVER_NOT_FOUND" });
      }
      reply.type(contentType);
      reply.header("content-length", fileStat.size);
      return reply.send(createReadStream(coverPath.path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.code(404).send({ error: "IMPORT_COVER_NOT_FOUND" });
      }
      throw error;
    }
  });

  // PATCH /admin/import-candidates/:candidateId is the canonical D-07 metadata update route.
  server.patch("/admin/import-candidates/:candidateId", async (request, reply) => {
    const { candidateId } = request.params as { candidateId: string };
    const metadata = parseMetadataPatch(request.body);
    if (!metadata) {
      return reply.code(400).send({ error: "INVALID_IMPORT_CANDIDATE_METADATA" });
    }

    const record = await dependencies.importCandidates.updateCandidateMetadata(candidateId, metadata);
    if (!record) {
      return reply.code(404).send({ error: "IMPORT_CANDIDATE_NOT_FOUND" });
    }

    return { candidate: serializeCandidateWithFiles(record) };
  });

  server.post("/admin/imports/scan", async (request, reply) => {
    const scope = parseScanScope(request.body);
    if (!scope) {
      return reply.code(400).send({ error: "INVALID_SCAN_SCOPE" });
    }

    const scan = dependencies.scanScheduler.enqueueManualScan(scope);
    scan.catch((error: unknown) => request.log.error({ error }, "Manual import scan failed"));
    return reply.code(202).send({ accepted: true, scope });
  });

  server.post("/admin/import-candidates/:candidateId/hold", async (request, reply) => {
    const admissionService = dependencies.admissionService;
    if (!admissionService) {
      return reply.code(503).send({ error: "IMPORT_ADMISSION_UNAVAILABLE" });
    }

    const { candidateId } = request.params as { candidateId: string };
    const result = await admissionService.holdCandidate(candidateId);
    return { candidate: serializeCandidateWithFiles(result) };
  });

  server.post("/admin/import-candidates/:candidateId/reject-delete", async (request, reply) => {
    const admissionService = dependencies.admissionService;
    if (!admissionService) {
      return reply.code(503).send({ error: "IMPORT_ADMISSION_UNAVAILABLE" });
    }

    const { candidateId } = request.params as { candidateId: string };
    if (!isRecord(request.body) || request.body.confirmDelete !== true) {
      return reply.code(400).send({ error: "DELETE_CONFIRMATION_REQUIRED" });
    }

    const result = await admissionService.rejectDeleteCandidate(candidateId, { confirmDelete: true });
    return { candidate: serializeCandidateWithFiles(result) };
  });

  server.post("/admin/import-candidates/:candidateId/approve", async (request, reply) => {
    const admissionService = dependencies.admissionService;
    if (!admissionService) {
      return reply.code(503).send({ error: "IMPORT_ADMISSION_UNAVAILABLE" });
    }

    const { candidateId } = request.params as { candidateId: string };
    try {
      const result = await admissionService.approveCandidate(candidateId);
      return { candidate: serializeCandidateWithFiles(result), status: result.status, reason: result.reason };
    } catch (error) {
      return handleAdmissionError(reply, error);
    }
  });

  server.post("/admin/import-candidates/:candidateId/resolve-conflict", async (request, reply) => {
    const admissionService = dependencies.admissionService;
    if (!admissionService) {
      return reply.code(503).send({ error: "IMPORT_ADMISSION_UNAVAILABLE" });
    }

    const { candidateId } = request.params as { candidateId: string };
    const resolution = parseConflictResolution(request.body);
    if (!resolution) {
      return reply.code(400).send({ error: "INVALID_CONFLICT_RESOLUTION" });
    }

    try {
      const result = await admissionService.resolveCandidateConflict(candidateId, resolution);
      return { candidate: serializeCandidateWithFiles(result), status: result.status, reason: result.reason };
    } catch (error) {
      return handleAdmissionError(reply, error);
    }
  });
}

function parseStatusFilter(query: unknown): ImportCandidateStatus[] | null {
  const queryObject = isRecord(query) ? query : {};
  const rawStatus = queryObject.status;
  if (rawStatus === undefined) {
    return importCandidateStatuses;
  }

  const values = Array.isArray(rawStatus) ? rawStatus : String(rawStatus).split(",");
  const statuses = values.map((value) => String(value).trim()).filter(Boolean);
  if (statuses.some((status): status is ImportCandidateStatus => !isImportCandidateStatus(status))) {
    return null;
  }

  return statuses as ImportCandidateStatus[];
}

function parseScanScope(body: unknown): ImportScanScope | null {
  const scope = isRecord(body) && typeof body.scope === "string" ? body.scope : "imports";
  return isScanScope(scope) ? scope : null;
}

function parseMetadataPatch(body: unknown): UpdateImportCandidateMetadataInput | null {
  if (!isRecord(body)) {
    return {};
  }

  const input: UpdateImportCandidateMetadataInput = {};
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
  if (typeof body.sameVersionConfirmed === "boolean") {
    input.sameVersionConfirmed = body.sameVersionConfirmed;
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
  if (typeof body.defaultVocalMode === "string" && isVocalMode(body.defaultVocalMode)) {
    input.defaultVocalMode = body.defaultVocalMode;
  } else if (body.defaultVocalMode !== undefined) {
    return null;
  }
  if (body.files !== undefined) {
    if (!Array.isArray(body.files)) {
      return null;
    }
    input.files = [];
    for (const file of body.files) {
      if (!isRecord(file) || typeof file.candidateFileId !== "string") {
        return null;
      }
      const patch: NonNullable<UpdateImportCandidateMetadataInput["files"]>[number] = {
        candidateFileId: file.candidateFileId
      };
      if (typeof file.selected === "boolean") {
        patch.selected = file.selected;
      }
      if (typeof file.proposedVocalMode === "string" && isVocalMode(file.proposedVocalMode)) {
        patch.proposedVocalMode = file.proposedVocalMode;
      }
      if (typeof file.proposedAssetKind === "string" && isAssetKind(file.proposedAssetKind)) {
        patch.proposedAssetKind = file.proposedAssetKind;
      }
      input.files.push(patch);
    }
  }

  return input;
}

function parseConflictResolution(body: unknown): ConflictResolution | null {
  if (!isRecord(body) || typeof body.resolution !== "string") {
    return null;
  }

  if (body.resolution === "merge_existing") {
    const targetSongId = typeof body.targetSongId === "string" ? body.targetSongId : null;
    return targetSongId ? { resolution: "merge_existing", targetSongId } : { resolution: "merge_existing" };
  }
  if (body.resolution === "create_version") {
    const versionSuffix = typeof body.versionSuffix === "string" ? body.versionSuffix : null;
    return versionSuffix ? { resolution: "create_version", versionSuffix } : { resolution: "create_version" };
  }
  return null;
}

function serializeCandidateWithFiles(record: ImportCandidateWithFiles) {
  return {
    ...record.candidate,
    files: record.files.map((file) => serializeCandidateFileDetail(file, record.candidate.id, record.candidate.candidateMeta.realMv))
  };
}

function serializeCandidateFileDetail(
  detail: ImportCandidateFileDetail,
  candidateId: string,
  candidateRealMv: unknown = null
) {
  const realMv = readRealMvPreview(detail.probeSummary, candidateRealMv);
  const coverPreviewUrl = realMv && readCoverSidecar(realMv)
    ? `/admin/import-candidates/${encodeURIComponent(candidateId)}/files/${encodeURIComponent(detail.id)}/cover`
    : undefined;

  return {
    candidateFileId: detail.id,
    importFileId: detail.importFileId,
    selected: detail.selected,
    proposedVocalMode: detail.proposedVocalMode,
    proposedAssetKind: detail.proposedAssetKind,
    roleConfidence: detail.roleConfidence,
    probeDurationMs: detail.probeDurationMs,
    probeSummary: detail.probeSummary,
    compatibilityStatus: detail.compatibilityStatus,
    compatibilityReasons: detail.compatibilityReasons,
    mediaInfoSummary: detail.mediaInfoSummary,
    mediaInfoProvenance: detail.mediaInfoProvenance,
    trackRoles: detail.trackRoles,
    playbackProfile: detail.playbackProfile,
    ...(realMv ? { realMv } : {}),
    ...(coverPreviewUrl ? { coverPreviewUrl } : {}),
    rootKind: detail.rootKind,
    relativePath: detail.relativePath,
    sizeBytes: detail.sizeBytes,
    mtimeMs: detail.mtimeMs,
    quickHash: detail.quickHash,
    probeStatus: detail.probeStatus,
    probePayload: detail.probePayload,
    durationMs: detail.durationMs,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt
  };
}

function readRealMvPreview(probeSummary: Record<string, unknown>, candidateRealMv: unknown): Record<string, unknown> | null {
  const probeRealMv = isRecord(probeSummary.realMv) ? probeSummary.realMv : null;
  const source = probeRealMv ?? (isRecord(candidateRealMv) ? candidateRealMv : null);
  if (!source) {
    return null;
  }

  const preview: Record<string, unknown> = {};
  copyString(source, preview, "groupKey");
  copyString(source, preview, "mediaKind");
  copyArray(source, preview, "metadataSources");
  copyArray(source, preview, "metadataConflicts");
  copyArray(source, preview, "scannerReasons");
  if (isRecord(source.sidecarMetadata)) {
    preview.sidecarMetadata = source.sidecarMetadata;
  }
  if (isRecord(source.sidecars)) {
    preview.sidecars = {
      cover: readSidecarArtifact(source.sidecars.cover),
      songJson: readSidecarArtifact(source.sidecars.songJson)
    };
  }

  return Object.keys(preview).length > 0 ? preview : null;
}

function copyString(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (typeof source[key] === "string") {
    target[key] = source[key];
  }
}

function copyArray(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  if (Array.isArray(source[key])) {
    target[key] = source[key];
  }
}

function readSidecarArtifact(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || typeof value.relativePath !== "string") {
    return null;
  }

  return {
    relativePath: value.relativePath,
    ...(typeof value.sizeBytes === "number" ? { sizeBytes: value.sizeBytes } : {}),
    ...(typeof value.mtimeMs === "number" ? { mtimeMs: value.mtimeMs } : {}),
    ...(typeof value.contentType === "string" ? { contentType: value.contentType } : {})
  };
}

function readCoverSidecar(realMv: Record<string, unknown>): Record<string, unknown> | null {
  if (!isRecord(realMv.sidecars)) {
    return null;
  }
  return isRecord(realMv.sidecars.cover) && typeof realMv.sidecars.cover.relativePath === "string"
    ? realMv.sidecars.cover
    : null;
}

function readCoverContentType(cover: Record<string, unknown>): string | null {
  const contentType = cover.contentType;
  return contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp" ? contentType : null;
}

function rootPathFor(rootKind: ImportFileRootKind, paths: LibraryPaths): string {
  if (rootKind === "imports_pending") {
    return paths.importsPendingRoot;
  }
  if (rootKind === "imports_needs_review") {
    return paths.importsNeedsReviewRoot;
  }
  return paths.songsRoot;
}

function resolveSidecarPath(rootPath: string, relativePath: string): { ok: true; path: string } | { ok: false } {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    // Path is outside the file scan root.
    return { ok: false };
  }

  return { ok: true, path: candidate };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImportCandidateStatus(value: string): value is ImportCandidateStatus {
  return importCandidateStatuses.includes(value as ImportCandidateStatus);
}

function isScanScope(value: string): value is ImportScanScope {
  return scanScopes.includes(value as ImportScanScope);
}

function isLanguage(value: string): value is Language {
  return languages.includes(value as Language);
}

function isVocalMode(value: string): value is VocalMode {
  return vocalModes.includes(value as VocalMode);
}

function isAssetKind(value: string): value is AssetKind {
  return assetKinds.includes(value as AssetKind);
}

function handleAdmissionError(reply: FastifyReply, error: unknown) {
  if (isRecord(error) && typeof error.code === "string") {
    const statusCode = error.code === "FORMAL_DIRECTORY_CONFLICT" ? 409 : 400;
    return reply.code(statusCode).send({
      error: error.code,
      candidateId: error.candidateId,
      status: error.status,
      conflictMeta: error.conflictMeta
    });
  }

  throw error;
}
