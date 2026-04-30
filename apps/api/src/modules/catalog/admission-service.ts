import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type {
  Asset,
  AssetId,
  AssetStatus,
  ImportCandidateFileDetail,
  ImportCandidateId,
  ImportCandidateStatus,
  ImportFileRootKind,
  Language,
  LyricMode,
  SongId,
  SwitchFamily,
  SwitchQualityStatus,
  VocalMode
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../db/query-executor.js";
import type {
  ImportCandidateRepository,
  ImportCandidateWithFiles,
  UpdateImportCandidateStatusInput
} from "../ingest/repositories/import-candidate-repository.js";
import type { ImportFileRepository } from "../ingest/repositories/import-file-repository.js";
import type { LibraryPaths } from "../ingest/library-paths.js";
import { toLibraryRelativePath } from "../ingest/library-paths.js";
import type {
  AdminCatalogAssetRepository,
  UpdateFormalAssetInput
} from "./repositories/asset-repository.js";
import type {
  AdminCatalogSongRecord,
  AdminCatalogSongRepository
} from "./repositories/song-repository.js";
import { writeSongJson, type SongJsonAsset } from "./song-json.js";

export type AdmissionStatus = "approved" | "review_required" | "rejected" | "conflict" | "approval_failed";
export type FormalPairStatus = "verified" | "review_required" | "rejected";
export type ConflictResolution =
  | { resolution: "merge_existing"; targetSongId?: string }
  | { resolution: "create_version"; versionSuffix?: string };

export interface CatalogAdmissionResult extends ImportCandidateWithFiles {
  status: AdmissionStatus;
  reason?: string;
}

export interface FormalPairEvaluation {
  status: FormalPairStatus;
  reason?: string;
  pairAssetIds: AssetId[];
}

export interface FormalSongRevalidationResult {
  record: AdminCatalogSongRecord;
  evaluation: FormalPairEvaluation;
}

export interface UpdateFormalAssetWithRevalidationInput {
  assetId: AssetId;
  patch: {
    status?: AssetStatus;
    vocalMode?: VocalMode;
    lyricMode?: LyricMode;
    switchFamily?: SwitchFamily | null;
    switchQualityStatus?: SwitchQualityStatus;
    durationMs?: number;
  };
}

export interface UpdateFormalAssetWithRevalidationResult extends FormalSongRevalidationResult {
  asset: Asset;
}

export interface CatalogAdmissionWriter {
  promoteApprovedCandidate(input: PromoteApprovedCandidateInput): Promise<void>;
}

export interface PromoteApprovedCandidateInput {
  candidateId: string;
  songId: string;
  title: string;
  artistName: string;
  language: Language;
  releaseYear: number | null;
  switchFamily: string;
  defaultAssetId: string;
  assets: Array<{
    assetId: string;
    importFileId: string;
    filePath: string;
    vocalMode: VocalMode;
    durationMs: number;
  }>;
}

export interface CatalogAdmissionServiceOptions {
  paths: LibraryPaths;
  importCandidates: Pick<ImportCandidateRepository, "getCandidateWithFiles" | "updateCandidateStatus">;
  importFiles: Pick<ImportFileRepository, "updateFileLocation" | "markDeletedById">;
  catalogWriter?: CatalogAdmissionWriter;
  formalSongs?: AdminCatalogSongRepository;
  formalAssets?: AdminCatalogAssetRepository;
}

export class CatalogAdmissionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export class CatalogAdmissionService {
  private readonly catalogWriter: CatalogAdmissionWriter;

  constructor(private readonly options: CatalogAdmissionServiceOptions) {
    this.catalogWriter = options.catalogWriter ?? { promoteApprovedCandidate: async () => undefined };
  }

  evaluatePair(record: ImportCandidateWithFiles): { status: "verified" | "review_required" | "rejected"; reason?: string } {
    const selectedFiles = record.files.filter((file) => file.selected);
    const original = selectedFiles.filter((file) => file.proposedVocalMode === "original");
    const instrumental = selectedFiles.filter((file) => file.proposedVocalMode === "instrumental");

    if (original.length !== 1 || instrumental.length !== 1) {
      return { status: "rejected", reason: "missing-original-instrumental-pair" };
    }
    if (!record.candidate.sameVersionConfirmed) {
      return { status: "review_required", reason: "same-version-unconfirmed" };
    }

    const originalDuration = original[0]?.durationMs;
    const instrumentalDuration = instrumental[0]?.durationMs;
    if (originalDuration === null || originalDuration === undefined || instrumentalDuration === null || instrumentalDuration === undefined) {
      return { status: "review_required", reason: "duration-unprobeable" };
    }

    const delta = Math.abs(originalDuration - instrumentalDuration);
    if (delta > 300) {
      return { status: "review_required", reason: "duration-delta-over-300ms" };
    }

    return { status: "verified" };
  }

  evaluateFormalPair(assets: Asset[]): FormalPairEvaluation {
    const candidates = assets.filter(
      (asset) =>
        asset.status === "ready" &&
        Boolean(asset.switchFamily) &&
        (asset.vocalMode === "original" || asset.vocalMode === "instrumental")
    );
    const families = new Map<SwitchFamily, Asset[]>();
    for (const asset of candidates) {
      if (!asset.switchFamily) {
        continue;
      }
      const familyAssets = families.get(asset.switchFamily) ?? [];
      familyAssets.push(asset);
      families.set(asset.switchFamily, familyAssets);
    }

    for (const familyAssets of families.values()) {
      const originals = familyAssets.filter((asset) => asset.vocalMode === "original");
      const instrumentals = familyAssets.filter((asset) => asset.vocalMode === "instrumental");
      if (originals.length !== 1 || instrumentals.length !== 1) {
        continue;
      }

      const original = originals[0] as Asset;
      const instrumental = instrumentals[0] as Asset;
      const delta = Math.abs(original.durationMs - instrumental.durationMs);
      if (delta > 300) {
        return {
          status: "review_required",
          reason: "duration-delta-over-300ms",
          pairAssetIds: [original.id, instrumental.id]
        };
      }

      return {
        status: "verified",
        pairAssetIds: [original.id, instrumental.id]
      };
    }

    return { status: "review_required", reason: "missing-ready-switch-pair", pairAssetIds: [] };
  }

  async revalidateFormalSong(songId: SongId): Promise<FormalSongRevalidationResult> {
    const catalog = this.requireFormalCatalog();
    const current = await catalog.formalSongs.getFormalSongWithAssets(songId);
    if (!current) {
      throw new CatalogAdmissionError("FORMAL_SONG_NOT_FOUND", "Formal song not found", { songId });
    }

    const evaluation = this.evaluateFormalPair(current.assets);
    const nextSongStatus = evaluation.status === "verified" ? "ready" : "review_required";
    await catalog.formalSongs.updateSongStatus(songId, nextSongStatus);

    const nextSwitchQualityStatus = evaluation.status === "verified" ? "verified" : evaluation.status;
    const switchSensitiveAssets =
      evaluation.pairAssetIds.length > 0
        ? current.assets.filter((asset) => evaluation.pairAssetIds.includes(asset.id))
        : current.assets.filter(
            (asset) =>
              Boolean(asset.switchFamily) && (asset.vocalMode === "original" || asset.vocalMode === "instrumental")
          );

    for (const asset of switchSensitiveAssets) {
      if (asset.switchQualityStatus !== nextSwitchQualityStatus) {
        await catalog.formalAssets.updateFormalAsset(asset.id, { switchQualityStatus: nextSwitchQualityStatus });
      }
    }

    const record = await catalog.formalSongs.getFormalSongWithAssets(songId);
    if (!record) {
      throw new CatalogAdmissionError("FORMAL_SONG_NOT_FOUND", "Formal song not found after revalidation", { songId });
    }

    return { record, evaluation };
  }

  async updateFormalAssetWithRevalidation(
    input: UpdateFormalAssetWithRevalidationInput
  ): Promise<UpdateFormalAssetWithRevalidationResult> {
    const catalog = this.requireFormalCatalog();
    const asset = await catalog.formalAssets.updateFormalAsset(input.assetId, input.patch satisfies UpdateFormalAssetInput);
    if (!asset) {
      throw new CatalogAdmissionError("FORMAL_ASSET_NOT_FOUND", "Formal asset not found", { assetId: input.assetId });
    }

    const result = await this.revalidateFormalSong(asset.songId);
    const revalidatedAsset = result.record.assets.find((candidate) => candidate.id === input.assetId);
    if (!revalidatedAsset) {
      throw new CatalogAdmissionError("FORMAL_ASSET_NOT_FOUND", "Formal asset missing after revalidation", {
        assetId: input.assetId
      });
    }

    return { ...result, asset: revalidatedAsset };
  }

  async holdCandidate(candidateId: ImportCandidateId): Promise<CatalogAdmissionResult> {
    const record = await this.requireCandidate(candidateId);

    for (const file of record.files) {
      if (file.rootKind !== "imports_pending") {
        continue;
      }
      const sourcePath = this.absolutePathFor(file.rootKind, file.relativePath);
      const targetPath = path.join(this.options.paths.importsNeedsReviewRoot, file.relativePath);
      await moveFileIfNeeded(sourcePath, targetPath);
      await this.options.importFiles.updateFileLocation({
        importFileId: file.importFileId,
        rootKind: "imports_needs_review",
        relativePath: file.relativePath
      });
    }

    const updated = await this.updateCandidateStatus(candidateId, { status: "held" });
    return { ...updated, status: "review_required", reason: "held-for-review" };
  }

  async rejectDeleteCandidate(
    candidateId: ImportCandidateId,
    input: { confirmDelete?: boolean }
  ): Promise<CatalogAdmissionResult> {
    if (input.confirmDelete !== true) {
      throw new CatalogAdmissionError("DELETE_CONFIRMATION_REQUIRED", "reject-delete requires confirmDelete");
    }

    const record = await this.requireCandidate(candidateId);
    for (const file of record.files) {
      await rm(this.absolutePathFor(file.rootKind, file.relativePath), { force: true });
      await this.options.importFiles.markDeletedById(file.importFileId);
    }

    const updated = await this.updateCandidateStatus(candidateId, { status: "rejected_deleted" });
    return { ...updated, status: "rejected" };
  }

  async approveCandidate(candidateId: ImportCandidateId): Promise<CatalogAdmissionResult> {
    return this.approve(candidateId);
  }

  async resolveCandidateConflict(candidateId: ImportCandidateId, input: ConflictResolution): Promise<CatalogAdmissionResult> {
    if (input.resolution === "merge_existing" && !input.targetSongId) {
      throw new CatalogAdmissionError("TARGET_SONG_REQUIRED", "merge_existing requires targetSongId");
    }
    if (input.resolution === "create_version" && !input.versionSuffix?.trim()) {
      throw new CatalogAdmissionError("VERSION_SUFFIX_REQUIRED", "create_version requires versionSuffix");
    }

    return this.approve(candidateId, input);
  }

  private async approve(candidateId: ImportCandidateId, resolution?: ConflictResolution): Promise<CatalogAdmissionResult> {
    const record = await this.requireCandidate(candidateId);
    const evaluation = this.evaluatePair(record);
    if (evaluation.status !== "verified") {
      const reason = evaluation.reason ?? "admission-review-required";
      const updated = await this.updateCandidateStatus(candidateId, {
        status: "review_required",
        reviewNotes: reason
      });
      return { ...updated, status: "review_required", reason };
    }

    const targetDirectory = this.targetDirectory(record, resolution);
    const targetRelativeDirectory = toLibraryRelativePath(this.options.paths.songsRoot, targetDirectory);
    const targetExists = await pathExists(targetDirectory);
    const explicitConflictResolution = Boolean(resolution);
    const repairableApprovalFailure =
      record.candidate.status === "approval_failed" && record.candidate.candidateMeta.targetDirectory === targetRelativeDirectory;

    if (targetExists && !explicitConflictResolution && !repairableApprovalFailure) {
      const conflictMeta = {
        targetDirectory: targetRelativeDirectory,
        conflictType: "formal_directory_exists",
        existingSongId: null
      };
      await this.updateCandidateStatus(candidateId, {
        status: "conflict",
        candidateMeta: conflictMeta
      });
      throw new CatalogAdmissionError("FORMAL_DIRECTORY_CONFLICT", "Formal directory conflict", {
        candidateId,
        status: "conflict",
        conflictMeta
      });
    }

    try {
      const switchFamily = `candidate-${record.candidate.id}`;
      const promotedAssets = await this.moveApprovedFiles(record, targetDirectory, targetRelativeDirectory, switchFamily);
      await writeSongJson(targetDirectory, {
        title: record.candidate.title,
        artistName: record.candidate.artistName,
        language: record.candidate.language,
        defaultVocalMode: "instrumental",
        sameVersionConfirmed: true,
        assets: promotedAssets.map((asset) => ({
          filePath: asset.filePath,
          vocalMode: asset.vocalMode,
          durationMs: asset.durationMs,
          switchFamily
        }))
      });
      const defaultAsset = promotedAssets.find((asset) => asset.vocalMode === "instrumental") ?? promotedAssets[0];
      await this.catalogWriter.promoteApprovedCandidate({
        candidateId: record.candidate.id,
        songId: resolution?.resolution === "merge_existing" && resolution.targetSongId ? resolution.targetSongId : `song-${record.candidate.id}`,
        title: record.candidate.title,
        artistName: record.candidate.artistName,
        language: record.candidate.language,
        releaseYear: record.candidate.releaseYear,
        switchFamily,
        defaultAssetId: defaultAsset?.assetId ?? `asset-${record.candidate.id}-instrumental`,
        assets: promotedAssets
      });
      const updated = await this.updateCandidateStatus(candidateId, {
        status: "approved",
        candidateMeta: {
          targetDirectory: targetRelativeDirectory,
          conflictResolution: resolution?.resolution ?? null
        }
      });
      return { ...updated, status: "approved" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const updated = await this.updateCandidateStatus(candidateId, {
        status: "approval_failed",
        reviewNotes: reason,
        candidateMeta: { targetDirectory: targetRelativeDirectory, repairReason: reason }
      });
      return { ...updated, status: "approval_failed", reason };
    }
  }

  private async moveApprovedFiles(
    record: ImportCandidateWithFiles,
    targetDirectory: string,
    targetRelativeDirectory: string,
    switchFamily: string
  ): Promise<PromoteApprovedCandidateInput["assets"]> {
    const assets: PromoteApprovedCandidateInput["assets"] = [];

    for (const file of record.files) {
      const vocalMode = file.proposedVocalMode;
      if (!file.selected || (vocalMode !== "original" && vocalMode !== "instrumental")) {
        continue;
      }
      const sourcePath = this.absolutePathFor(file.rootKind, file.relativePath);
      const targetPath = path.join(targetDirectory, path.basename(file.relativePath));
      await moveFileIfNeeded(sourcePath, targetPath);
      const relativePath = `${targetRelativeDirectory}/${path.basename(file.relativePath)}`;
      await this.options.importFiles.updateFileLocation({
        importFileId: file.importFileId,
        rootKind: "songs",
        relativePath
      });
      assets.push({
        assetId: `asset-${record.candidate.id}-${file.proposedVocalMode}`,
        importFileId: file.importFileId,
        filePath: `songs/${relativePath}`,
        vocalMode,
        durationMs: file.durationMs ?? file.probeDurationMs ?? 0
      });
    }

    return assets;
  }

  private targetDirectory(record: ImportCandidateWithFiles, resolution?: ConflictResolution): string {
    const baseTitle =
      resolution?.resolution === "create_version" && resolution.versionSuffix
        ? `${record.candidate.title}-${sanitizeSegment(resolution.versionSuffix)}`
        : record.candidate.title;
    return path.join(
      this.options.paths.songsRoot,
      record.candidate.language,
      sanitizeSegment(record.candidate.artistName),
      sanitizeSegment(baseTitle)
    );
  }

  private absolutePathFor(rootKind: ImportFileRootKind, relativePath: string): string {
    if (rootKind === "imports_pending") {
      return path.join(this.options.paths.importsPendingRoot, relativePath);
    }
    if (rootKind === "imports_needs_review") {
      return path.join(this.options.paths.importsNeedsReviewRoot, relativePath);
    }
    return path.join(this.options.paths.songsRoot, relativePath);
  }

  private async requireCandidate(candidateId: ImportCandidateId): Promise<ImportCandidateWithFiles> {
    const record = await this.options.importCandidates.getCandidateWithFiles(candidateId);
    if (!record) {
      throw new CatalogAdmissionError("IMPORT_CANDIDATE_NOT_FOUND", "Import candidate not found", { candidateId });
    }
    return record;
  }

  private async updateCandidateStatus(
    candidateId: ImportCandidateId,
    input: UpdateImportCandidateStatusInput
  ): Promise<ImportCandidateWithFiles> {
    const updated = await this.options.importCandidates.updateCandidateStatus(candidateId, input);
    if (!updated) {
      throw new CatalogAdmissionError("IMPORT_CANDIDATE_NOT_FOUND", "Import candidate not found", { candidateId });
    }
    return updated;
  }

  private requireFormalCatalog(): {
    formalSongs: AdminCatalogSongRepository;
    formalAssets: AdminCatalogAssetRepository;
  } {
    if (!this.options.formalSongs || !this.options.formalAssets) {
      throw new CatalogAdmissionError("FORMAL_CATALOG_UNAVAILABLE", "Formal catalog repositories unavailable");
    }

    return {
      formalSongs: this.options.formalSongs,
      formalAssets: this.options.formalAssets
    };
  }
}

export class PgCatalogAdmissionWriter implements CatalogAdmissionWriter {
  constructor(private readonly db: QueryExecutor) {}

  async promoteApprovedCandidate(input: PromoteApprovedCandidateInput): Promise<void> {
    await this.db.query(
      `INSERT INTO songs (
         id, title, normalized_title, title_pinyin, title_initials, artist_id, artist_name,
         language, status, genre, tags, aliases, search_hints, release_year,
         canonical_duration_ms, default_asset_id
       )
       VALUES ($1, $2, lower($2), '', '', $3, $4, $5, 'ready', '{}', '{}', '{}', '{}', $6, $7, $8)
       ON CONFLICT(id)
       DO UPDATE SET title = EXCLUDED.title,
                     normalized_title = EXCLUDED.normalized_title,
                     artist_name = EXCLUDED.artist_name,
                     language = EXCLUDED.language,
                     status = 'ready',
                     release_year = EXCLUDED.release_year,
                     canonical_duration_ms = EXCLUDED.canonical_duration_ms,
                     default_asset_id = EXCLUDED.default_asset_id,
                     updated_at = now()`,
      [
        input.songId,
        input.title,
        `artist-${input.artistName}`,
        input.artistName,
        input.language,
        input.releaseYear,
        input.assets[0]?.durationMs ?? null,
        input.defaultAssetId
      ]
    );

    for (const asset of input.assets) {
      await this.db.query(
        `INSERT INTO assets (
           id, song_id, source_type, asset_kind, display_name, file_path, duration_ms,
           lyric_mode, vocal_mode, status, switch_family, switch_quality_status
         )
         VALUES ($1, $2, 'local', 'video', $3, $4, $5, 'none', $6, 'ready', $7, 'verified')
         ON CONFLICT(id)
         DO UPDATE SET file_path = EXCLUDED.file_path,
                       duration_ms = EXCLUDED.duration_ms,
                       vocal_mode = EXCLUDED.vocal_mode,
                       status = 'ready',
                       switch_family = EXCLUDED.switch_family,
                       switch_quality_status = 'verified',
                       updated_at = now()`,
        [
          asset.assetId,
          input.songId,
          `${input.title} ${asset.vocalMode}`,
          asset.filePath,
          asset.durationMs,
          asset.vocalMode,
          input.switchFamily
        ]
      );
      await this.db.query(
        `INSERT INTO source_records (id, asset_id, provider, import_file_id, raw_meta)
         VALUES ($1, $2, 'local-import', $3, $4::jsonb)
         ON CONFLICT(id)
         DO UPDATE SET import_file_id = EXCLUDED.import_file_id,
                       raw_meta = EXCLUDED.raw_meta`,
        [`source-${asset.assetId}`, asset.assetId, asset.importFileId, { candidateId: input.candidateId }]
      );
    }
  }
}

async function moveFileIfNeeded(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  if (await pathExists(sourcePath)) {
    await rename(sourcePath, targetPath);
    return;
  }
  if (await pathExists(targetPath)) {
    return;
  }
  throw new Error(`Cannot move missing import file: ${sourcePath}`);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeSegment(value: string): string {
  return value.replace(/[\\/]/g, "-").trim() || "untitled";
}
