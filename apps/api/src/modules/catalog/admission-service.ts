import { access, copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type {
  Asset,
  AssetId,
  AssetKind,
  AssetStatus,
  CompatibilityReason,
  CompatibilityStatus,
  ImportCandidateFileDetail,
  ImportCandidateId,
  ImportCandidateStatus,
  ImportFileRootKind,
  Language,
  LyricMode,
  MediaInfoProvenance,
  MediaInfoSummary,
  PlaybackProfile,
  SongStatus,
  SongId,
  SwitchFamily,
  SwitchQualityStatus,
  TrackRoles,
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
import { buildPinyinSearchKeys } from "./search-normalization.js";
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
  songStatus?: SongStatus;
  assets: Array<{
    assetId: string;
    importFileId: string;
    filePath: string;
    vocalMode: VocalMode;
    durationMs: number;
    assetKind?: AssetKind;
    status?: AssetStatus;
    switchFamily?: string | null;
    switchQualityStatus?: SwitchQualityStatus;
    compatibilityStatus?: CompatibilityStatus;
    compatibilityReasons?: readonly CompatibilityReason[];
    mediaInfoSummary?: MediaInfoSummary | null;
    mediaInfoProvenance?: MediaInfoProvenance | null;
    trackRoles?: TrackRoles;
    playbackProfile?: PlaybackProfile;
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
    const realMvFile = record.files.find(isSelectedRealMvFile);
    if (realMvFile) {
      return this.approveRealMvCandidate(record, realMvFile, resolution);
    }

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

  private async approveRealMvCandidate(
    record: ImportCandidateWithFiles,
    file: ImportCandidateFileDetail,
    resolution?: ConflictResolution
  ): Promise<CatalogAdmissionResult> {
    const candidateId = record.candidate.id;
    const title = record.candidate.title.trim();
    const artistName = record.candidate.artistName.trim();
    if (!title) {
      const updated = await this.updateCandidateStatus(candidateId, {
        status: "review_required",
        reviewNotes: "missing-title"
      });
      return { ...updated, status: "review_required", reason: "missing-title" };
    }
    if (!artistName) {
      const updated = await this.updateCandidateStatus(candidateId, {
        status: "review_required",
        reviewNotes: "missing-artist"
      });
      return { ...updated, status: "review_required", reason: "missing-artist" };
    }

    const readiness = deriveRealMvReadiness(file);
    if (!readiness.promotable) {
      const reason = readiness.reason ?? "real-mv-unsupported";
      const updated = await this.updateCandidateStatus(candidateId, {
        status: "review_required",
        reviewNotes: reason,
        candidateMeta: { ...asRecord(record.candidate.candidateMeta), repairReason: reason }
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
      const sourcePath = this.absolutePathFor(file.rootKind, file.relativePath);
      const targetPath = path.join(targetDirectory, path.basename(file.relativePath));
      await moveFileIfNeeded(sourcePath, targetPath);
      const relativePath = `${targetRelativeDirectory}/${path.basename(file.relativePath)}`;
      await this.options.importFiles.updateFileLocation({
        importFileId: file.importFileId,
        rootKind: "songs",
        relativePath
      });

      const coverPath = await this.copyRealMvCoverSidecar(record, file, targetDirectory);
      const assetId = `asset-${record.candidate.id}-real-mv`;
      const songId =
        resolution?.resolution === "merge_existing" && resolution.targetSongId
          ? resolution.targetSongId
          : `song-${record.candidate.id}`;
      const mediaInfoSummary = file.mediaInfoSummary ?? defaultMediaInfoSummary();
      const playbackProfile = defaultSingleFilePlaybackProfile(file);
      const asset: SongJsonAsset & PromoteApprovedCandidateInput["assets"][number] = {
        id: assetId,
        assetId,
        importFileId: file.importFileId,
        filePath: `songs/${relativePath}`,
        vocalMode: "dual",
        assetKind: "dual-track-video",
        lyricMode: "none",
        status: readiness.assetStatus,
        durationMs: file.durationMs ?? file.probeDurationMs ?? mediaInfoSummary.durationMs ?? 0,
        switchFamily: null,
        switchQualityStatus: readiness.switchQualityStatus,
        compatibilityStatus: file.compatibilityStatus ?? "unknown",
        compatibilityReasons: file.compatibilityReasons ?? [],
        mediaInfoSummary,
        mediaInfoProvenance: file.mediaInfoProvenance ?? defaultMediaInfoProvenance(),
        trackRoles: file.trackRoles ?? defaultTrackRoles(),
        playbackProfile,
        container: playbackProfile.container ?? mediaInfoSummary.container,
        videoCodec: playbackProfile.videoCodec ?? mediaInfoSummary.videoCodec,
        audioCodecs: playbackProfile.audioCodecs
      };

      await writeSongJson(targetDirectory, {
        title: record.candidate.title,
        artistName: record.candidate.artistName,
        language: record.candidate.language,
        status: readiness.songStatus,
        defaultAssetId: assetId,
        defaultAssetPath: asset.filePath,
        coverPath,
        defaultVocalMode: "instrumental",
        sameVersionConfirmed: record.candidate.sameVersionConfirmed,
        genre: [...record.candidate.genre],
        tags: [...record.candidate.tags],
        aliases: [...record.candidate.aliases],
        searchHints: [...record.candidate.searchHints],
        releaseYear: record.candidate.releaseYear,
        source: { importCandidateId: record.candidate.id },
        assets: [asset]
      });

      await this.catalogWriter.promoteApprovedCandidate({
        candidateId: record.candidate.id,
        songId,
        title: record.candidate.title,
        artistName: record.candidate.artistName,
        language: record.candidate.language,
        releaseYear: record.candidate.releaseYear,
        switchFamily: `candidate-${record.candidate.id}`,
        defaultAssetId: assetId,
        songStatus: readiness.songStatus,
        assets: [asset]
      });

      const updated = await this.updateCandidateStatus(candidateId, {
        status: "approved",
        candidateMeta: {
          ...asRecord(record.candidate.candidateMeta),
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
        candidateMeta: { ...asRecord(record.candidate.candidateMeta), targetDirectory: targetRelativeDirectory, repairReason: reason }
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

  private readRealMvCoverSidecar(
    record: ImportCandidateWithFiles,
    file: ImportCandidateFileDetail
  ): { relativePath: string } | null {
    const fileCoverPath = readNestedString(file.probeSummary, ["realMv", "sidecars", "cover", "relativePath"]);
    const candidateCoverPath = readNestedString(record.candidate.candidateMeta, ["realMv", "sidecars", "cover", "relativePath"]);
    const relativePath = fileCoverPath ?? candidateCoverPath;
    return relativePath ? { relativePath } : null;
  }

  private async copyRealMvCoverSidecar(
    record: ImportCandidateWithFiles,
    file: ImportCandidateFileDetail,
    targetDirectory: string
  ): Promise<string | null> {
    const sidecar = this.readRealMvCoverSidecar(record, file);
    if (!sidecar || !isSafeRelativePath(sidecar.relativePath)) {
      return null;
    }

    const mediaDirectory = path.dirname(file.relativePath);
    const coverDirectory = path.dirname(sidecar.relativePath);
    const coverRelativePath =
      coverDirectory === "." || coverDirectory === ""
        ? path.join(mediaDirectory, sidecar.relativePath)
        : coverDirectory === mediaDirectory
          ? sidecar.relativePath
          : null;
    if (!coverRelativePath) {
      return null;
    }

    const sourcePath = this.absolutePathFor(file.rootKind, coverRelativePath);
    const mediaDirectoryPath = this.absolutePathFor(file.rootKind, mediaDirectory);
    const relativeToMediaDirectory = path.relative(mediaDirectoryPath, sourcePath);
    if (relativeToMediaDirectory.startsWith("..") || path.isAbsolute(relativeToMediaDirectory)) {
      return null;
    }

    const basename = path.basename(coverRelativePath);
    await copyFile(sourcePath, path.join(targetDirectory, basename));
    return basename;
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

export function isSelectedRealMvFile(file: ImportCandidateFileDetail): boolean {
  return (
    file.selected &&
    (file.proposedAssetKind === "dual-track-video" || file.playbackProfile?.kind === "single_file_audio_tracks")
  );
}

export function deriveRealMvReadiness(file: ImportCandidateFileDetail): {
  promotable: boolean;
  reason?: string;
  songStatus: SongStatus;
  assetStatus: AssetStatus;
  switchQualityStatus: SwitchQualityStatus;
} {
  if (file.compatibilityStatus === "unsupported") {
    return {
      promotable: false,
      reason: "real-mv-unsupported",
      songStatus: "review_required",
      assetStatus: "promoted",
      switchQualityStatus: "review_required"
    };
  }

  if (file.compatibilityStatus === "playable") {
    return {
      promotable: true,
      songStatus: "ready",
      assetStatus: "ready",
      switchQualityStatus: "review_required"
    };
  }

  return {
    promotable: true,
    songStatus: "review_required",
    assetStatus: "promoted",
    switchQualityStatus: "review_required"
  };
}

export function defaultSingleFilePlaybackProfile(file: ImportCandidateFileDetail): PlaybackProfile {
  const audioCodecs =
    file.playbackProfile?.audioCodecs && file.playbackProfile.audioCodecs.length > 0
      ? [...file.playbackProfile.audioCodecs]
      : (file.mediaInfoSummary?.audioTracks ?? [])
          .map((track) => track.codec)
          .filter((codec): codec is string => Boolean(codec));
  return {
    kind: "single_file_audio_tracks",
    container: file.playbackProfile?.container ?? file.mediaInfoSummary?.container ?? null,
    videoCodec: file.playbackProfile?.videoCodec ?? file.mediaInfoSummary?.videoCodec ?? null,
    audioCodecs,
    requiresAudioTrackSelection: true
  };
}

export function defaultTrackRoles(): TrackRoles {
  return { original: null, instrumental: null };
}

function defaultPlaybackProfile(): PlaybackProfile {
  return {
    kind: "separate_asset_pair",
    container: null,
    videoCodec: null,
    audioCodecs: [],
    requiresAudioTrackSelection: false
  };
}

function defaultMediaInfoSummary(): MediaInfoSummary {
  return { container: null, durationMs: null, videoCodec: null, resolution: null, fileSizeBytes: 0, audioTracks: [] };
}

function defaultMediaInfoProvenance(): MediaInfoProvenance {
  return { source: "unknown", sourceVersion: null, probedAt: null, importedFrom: null };
}

export class PgCatalogAdmissionWriter implements CatalogAdmissionWriter {
  constructor(private readonly db: QueryExecutor) {}

  async promoteApprovedCandidate(input: PromoteApprovedCandidateInput): Promise<void> {
    const titleKeys = buildPinyinSearchKeys(input.title);
    const artistKeys = buildPinyinSearchKeys(input.artistName);
    const songStatus = input.songStatus ?? "ready";

    await this.db.query(
      `INSERT INTO songs (
         id, title, normalized_title, title_pinyin, title_initials, artist_id, artist_name,
         artist_pinyin, artist_initials,
         language, status, genre, tags, aliases, search_hints, release_year,
         canonical_duration_ms, default_asset_id
       )
       VALUES ($1, $2, lower($2), $3, $4, $5, $6, $7, $8, $9, $10, '{}', '{}', '{}', '{}', $11, $12, NULL)
       ON CONFLICT(id)
       DO UPDATE SET title = EXCLUDED.title,
                     normalized_title = EXCLUDED.normalized_title,
                     title_pinyin = EXCLUDED.title_pinyin,
                     title_initials = EXCLUDED.title_initials,
                     artist_name = EXCLUDED.artist_name,
                     artist_pinyin = EXCLUDED.artist_pinyin,
                     artist_initials = EXCLUDED.artist_initials,
                     language = EXCLUDED.language,
                     status = EXCLUDED.status,
                     release_year = EXCLUDED.release_year,
                     canonical_duration_ms = EXCLUDED.canonical_duration_ms,
                     default_asset_id = NULL,
                     updated_at = now()`,
      [
        input.songId,
        input.title,
        titleKeys.pinyin,
        titleKeys.initials,
        `artist-${input.artistName}`,
        input.artistName,
        artistKeys.pinyin,
        artistKeys.initials,
        input.language,
        songStatus,
        input.releaseYear,
        input.assets[0]?.durationMs ?? null
      ]
    );

    for (const asset of input.assets) {
      const assetKind = asset.assetKind ?? "video";
      const assetStatus = asset.status ?? "ready";
      const switchFamily = asset.switchFamily === undefined ? input.switchFamily : asset.switchFamily;
      const switchQualityStatus = asset.switchQualityStatus ?? "verified";
      const compatibilityStatus = asset.compatibilityStatus ?? "playable";
      const compatibilityReasons = asset.compatibilityReasons ?? [];
      const mediaInfoSummary = asset.mediaInfoSummary ?? defaultMediaInfoSummary();
      const mediaInfoProvenance = asset.mediaInfoProvenance ?? defaultMediaInfoProvenance();
      const trackRoles = asset.trackRoles ?? defaultTrackRoles();
      const playbackProfile = asset.playbackProfile ?? defaultPlaybackProfile();

      await this.db.query(
        `INSERT INTO assets (
           id, song_id, source_type, asset_kind, display_name, file_path, duration_ms,
           lyric_mode, vocal_mode, status, switch_family, switch_quality_status,
           compatibility_status, compatibility_reasons, media_info_summary,
           media_info_provenance, track_roles, playback_profile
         )
         VALUES ($1, $2, 'local', $3, $4, $5, $6, 'none', $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb)
         ON CONFLICT(id)
         DO UPDATE SET asset_kind = EXCLUDED.asset_kind,
                       display_name = EXCLUDED.display_name,
                       file_path = EXCLUDED.file_path,
                       duration_ms = EXCLUDED.duration_ms,
                       vocal_mode = EXCLUDED.vocal_mode,
                       status = EXCLUDED.status,
                       switch_family = EXCLUDED.switch_family,
                       switch_quality_status = EXCLUDED.switch_quality_status,
                       compatibility_status = EXCLUDED.compatibility_status,
                       compatibility_reasons = EXCLUDED.compatibility_reasons,
                       media_info_summary = EXCLUDED.media_info_summary,
                       media_info_provenance = EXCLUDED.media_info_provenance,
                       track_roles = EXCLUDED.track_roles,
                       playback_profile = EXCLUDED.playback_profile,
                       updated_at = now()`,
        [
          asset.assetId,
          input.songId,
          assetKind,
          `${input.title} ${asset.vocalMode}`,
          asset.filePath,
          asset.durationMs,
          asset.vocalMode,
          assetStatus,
          switchFamily,
          switchQualityStatus,
          compatibilityStatus,
          compatibilityReasons,
          mediaInfoSummary,
          mediaInfoProvenance,
          trackRoles,
          playbackProfile
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

    await this.db.query(
      `UPDATE songs
       SET default_asset_id = $2,
           updated_at = now()
       WHERE id = $1`,
      [input.songId, input.defaultAssetId]
    );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readNestedString(value: unknown, keys: readonly string[]): string | null {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function isSafeRelativePath(relativePath: string): boolean {
  if (path.isAbsolute(relativePath)) {
    return false;
  }
  return !relativePath.split(/[\\/]+/).some((segment) => segment === "..");
}
