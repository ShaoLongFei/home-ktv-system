import type { FastifyInstance } from "fastify";
import type {
  ImportCandidateFileDetail,
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

export interface AdminImportRouteDependencies {
  importCandidates: Pick<
    ImportCandidateRepository,
    "listCandidates" | "getCandidateWithFiles" | "updateCandidateMetadata"
  >;
  scanScheduler: Pick<ScanScheduler, "enqueueManualScan">;
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

function serializeCandidateWithFiles(record: ImportCandidateWithFiles) {
  return {
    ...record.candidate,
    files: record.files.map(serializeCandidateFileDetail)
  };
}

function serializeCandidateFileDetail(detail: ImportCandidateFileDetail) {
  return {
    candidateFileId: detail.id,
    importFileId: detail.importFileId,
    selected: detail.selected,
    proposedVocalMode: detail.proposedVocalMode,
    proposedAssetKind: detail.proposedAssetKind,
    roleConfidence: detail.roleConfidence,
    probeDurationMs: detail.probeDurationMs,
    probeSummary: detail.probeSummary,
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
