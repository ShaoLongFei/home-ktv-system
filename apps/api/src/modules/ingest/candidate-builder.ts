import path from "node:path";
import type {
  AssetKind,
  CompatibilityReason,
  ImportFile,
  Language,
  MediaInfoProvenance,
  MediaInfoSummary,
  VocalMode
} from "@home-ktv/domain";
import {
  buildSingleFileAudioTrackPlaybackProfile,
  evaluateRealMvCompatibility,
  inferTrackRolesFromRealMv
} from "../media/real-mv-compatibility.js";
import {
  buildRealMvMetadataDraft,
  parseRealMvFilename,
  type RealMvSidecarMetadata
} from "./real-mv-metadata.js";
import type { ImportCandidateRepository } from "./repositories/import-candidate-repository.js";

export interface CandidateBuilderOptions {
  importCandidates: Pick<ImportCandidateRepository, "upsertCandidateWithFiles">;
}

interface CandidateGroup {
  artistName: string;
  title: string;
  groupKey: string;
  files: ImportFile[];
}

interface RealMvPayload {
  mediaKind?: string;
  sidecarMetadata?: RealMvSidecarMetadata;
  scannerReasons: CompatibilityReason[];
  sidecars?: unknown;
}

export class CandidateBuilder {
  constructor(private readonly options: CandidateBuilderOptions) {}

  async buildFromImportFiles(files: ImportFile[]): Promise<number> {
    const activeFiles = files.filter((file) => !file.deletedAt && file.probeStatus !== "deleted");
    const realMvFiles = activeFiles.filter(isSingleFileRealMvImportFile);
    const groups = groupImportFiles(activeFiles.filter((file) => !isSingleFileRealMvImportFile(file)));

    for (const file of realMvFiles) {
      await this.options.importCandidates.upsertCandidateWithFiles(buildRealMvCandidateInput(file));
    }

    for (const group of groups) {
      await this.options.importCandidates.upsertCandidateWithFiles({
        candidate: {
          title: group.title,
          artistName: group.artistName,
          language: inferLanguage(group),
          candidateMeta: {
            groupKey: group.groupKey,
            inferredFrom: "path"
          }
        },
        files: group.files.map((file) => {
          const proposedVocalMode = inferVocalMode(file.relativePath);
          const mediaInfoSummary = readMediaInfoSummary(file.probePayload.mediaInfoSummary);
          const mediaInfoProvenance = readMediaInfoProvenance(file.probePayload.mediaInfoProvenance);
          return {
            importFileId: file.id,
            selected: true,
            proposedVocalMode,
            proposedAssetKind: inferAssetKind(file.relativePath),
            roleConfidence: proposedVocalMode === "unknown" ? 0.4 : 0.9,
            probeDurationMs: file.durationMs,
            probeSummary: buildProbeSummary(file),
            mediaInfoSummary,
            mediaInfoProvenance
          };
        })
      });
    }

    return realMvFiles.length + groups.length;
  }
}

function buildRealMvCandidateInput(file: ImportFile): Parameters<ImportCandidateRepository["upsertCandidateWithFiles"]>[0] {
  const realMvPayload = readRealMvPayload(file.probePayload);
  const mediaInfoSummary = readMediaInfoSummary(file.probePayload.mediaInfoSummary);
  const mediaInfoProvenance = readMediaInfoProvenance(file.probePayload.mediaInfoProvenance);
  const metadataDraft = buildRealMvMetadataDraft({
    mediaInfoSummary,
    filenameMetadata: parseRealMvFilename(file.relativePath),
    scannerReasons: realMvPayload.scannerReasons,
    ...(realMvPayload.sidecarMetadata ? { sidecarMetadata: realMvPayload.sidecarMetadata } : {})
  });
  const groupKey = `single_file_real_mv:${file.relativePath}`;
  const compatibilitySummary = mediaInfoSummary ?? defaultMediaInfoSummary(file);
  const trackRoles = inferTrackRolesFromRealMv({
    mediaInfoSummary: compatibilitySummary,
    ...(metadataDraft.trackRoles ? { sidecarTrackRoles: metadataDraft.trackRoles } : {})
  });
  const playbackProfile = buildSingleFileAudioTrackPlaybackProfile(compatibilitySummary);
  const requiresAudioTrackSelection = playbackProfile.requiresAudioTrackSelection;
  const compatibility = metadataDraft.scannerReasons.length > 0
    ? {
        compatibilityStatus: "review_required" as const,
        compatibilityReasons: metadataDraft.scannerReasons
      }
    : evaluateRealMvCompatibility({
        summary: compatibilitySummary,
        trackRoles,
        currentWebCanPlayType: "unknown"
      });
  const candidateStatus = compatibility.compatibilityStatus === "playable" ? "pending" : "review_required";
  const roleConfidence = trackRoles.original && trackRoles.instrumental
    ? (trackRoles.instrumental.label === "Instrumental" ? 0.95 : 0.9)
    : 0.5;

  return {
    candidate: {
      title: metadataDraft.title ?? stripExtension(path.basename(file.relativePath)),
      artistName: metadataDraft.artistName ?? "Unknown Artist",
      language: metadataDraft.language ?? inferLanguageFromText(`${metadataDraft.artistName ?? ""}${metadataDraft.title ?? file.relativePath}`),
      genre: metadataDraft.genre ?? [],
      tags: metadataDraft.tags ?? [],
      aliases: metadataDraft.aliases ?? [],
      searchHints: metadataDraft.searchHints ?? [],
      releaseYear: metadataDraft.releaseYear ?? null,
      status: candidateStatus,
      candidateMeta: {
        groupKey,
        inferredFrom: "real_mv_scanner",
        realMv: {
          groupKey,
          mediaKind: "single_file_real_mv",
          sidecarMetadata: metadataDraft.sidecarMetadata,
          scannerReasons: metadataDraft.scannerReasons,
          sidecars: realMvPayload.sidecars,
          metadataSources: metadataDraft.metadataSources,
          metadataConflicts: metadataDraft.metadataConflicts
        }
      }
    },
    files: [{
      importFileId: file.id,
      selected: true,
      proposedVocalMode: "dual",
      proposedAssetKind: "dual-track-video",
      roleConfidence,
      probeDurationMs: file.durationMs,
      probeSummary: buildProbeSummary(file),
      mediaInfoSummary,
      mediaInfoProvenance,
      compatibilityStatus: compatibility.compatibilityStatus,
      compatibilityReasons: compatibility.compatibilityReasons,
      trackRoles,
      playbackProfile: {
        ...playbackProfile,
        kind: "single_file_audio_tracks",
        requiresAudioTrackSelection
      }
    }]
  };
}

function groupImportFiles(files: ImportFile[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();

  for (const file of files) {
    const identity = inferCandidateIdentity(file.relativePath);
    const group = groups.get(identity.groupKey) ?? {
      artistName: identity.artistName,
      title: identity.title,
      groupKey: identity.groupKey,
      files: []
    };
    group.files.push(file);
    groups.set(identity.groupKey, group);
  }

  return Array.from(groups.values());
}

function isSingleFileRealMvImportFile(file: ImportFile): boolean {
  return readRealMvPayload(file.probePayload).mediaKind === "single_file_real_mv";
}

function readRealMvPayload(value: Record<string, unknown>): RealMvPayload {
  const realMv = isRecord(value.realMv) ? value.realMv : {};
  const payload: RealMvPayload = {
    scannerReasons: Array.isArray(realMv.scannerReasons)
      ? realMv.scannerReasons as CompatibilityReason[]
      : []
  };
  if (typeof realMv.mediaKind === "string") {
    payload.mediaKind = realMv.mediaKind;
  }
  if (isRecord(realMv.sidecarMetadata)) {
    payload.sidecarMetadata = realMv.sidecarMetadata as RealMvSidecarMetadata;
  }
  if (realMv.sidecars !== undefined) {
    payload.sidecars = realMv.sidecars;
  }
  return payload;
}

function inferCandidateIdentity(relativePath: string): { artistName: string; title: string; groupKey: string } {
  const segments = relativePath.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? relativePath;
  const stem = stripKnownRoleSuffix(stripExtension(fileName));

  if (segments.length >= 3) {
    const artistName = segments.at(-3) ?? "Unknown Artist";
    const title = segments.at(-2) ?? stem;
    return {
      artistName,
      title,
      groupKey: `${artistName}/${title}`
    };
  }

  if (segments.length === 2) {
    const artistName = segments[0] ?? "Unknown Artist";
    const title = stem;
    return {
      artistName,
      title,
      groupKey: `${artistName}/${title}`
    };
  }

  return {
    artistName: "Unknown Artist",
    title: stem,
    groupKey: `Unknown Artist/${stem}`
  };
}

function stripExtension(fileName: string): string {
  return fileName.slice(0, fileName.length - path.extname(fileName).length);
}

function stripKnownRoleSuffix(stem: string): string {
  return stem
    .replace(/[._ -]+(?:instrumental|karaoke|accompaniment|伴奏|伴唱)$/iu, "")
    .replace(/[._ -]+(?:original|vocal|vocals|原唱)$/iu, "")
    .trim();
}

function inferVocalMode(relativePath: string): VocalMode {
  const value = relativePath.toLocaleLowerCase();
  if (/(instrumental|karaoke|accompaniment|伴奏|伴唱)/iu.test(value)) {
    return "instrumental";
  }
  if (/(original|vocal|vocals|原唱)/iu.test(value)) {
    return "original";
  }
  return "unknown";
}

function inferAssetKind(relativePath: string): AssetKind {
  return path.extname(relativePath).toLocaleLowerCase() === ".json" ? "audio+lyrics" : "video";
}

function inferLanguage(group: CandidateGroup): Language {
  return inferLanguageFromText(`${group.artistName}${group.title}`);
}

function inferLanguageFromText(value: string): Language {
  return /[\u4e00-\u9fff]/u.test(value) ? "mandarin" : "other";
}

function buildProbeSummary(file: ImportFile): Record<string, unknown> {
  return {
    durationMs: file.durationMs,
    probeStatus: file.probeStatus,
    mediaInfoSummary: readMediaInfoSummary(file.probePayload.mediaInfoSummary),
    mediaInfoProvenance: readMediaInfoProvenance(file.probePayload.mediaInfoProvenance)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMediaInfoSummary(value: unknown): MediaInfoSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    container: typeof value.container === "string" ? value.container : null,
    durationMs: typeof value.durationMs === "number" ? value.durationMs : null,
    videoCodec: typeof value.videoCodec === "string" ? value.videoCodec : null,
    resolution: isRecord(value.resolution) &&
      typeof value.resolution.width === "number" &&
      typeof value.resolution.height === "number"
      ? { width: value.resolution.width, height: value.resolution.height }
      : null,
    fileSizeBytes: typeof value.fileSizeBytes === "number" ? value.fileSizeBytes : 0,
    audioTracks: Array.isArray(value.audioTracks) ? value.audioTracks as MediaInfoSummary["audioTracks"] : []
  };
}

function defaultMediaInfoSummary(file: ImportFile): MediaInfoSummary {
  return {
    container: null,
    durationMs: file.durationMs,
    videoCodec: null,
    resolution: null,
    fileSizeBytes: file.sizeBytes,
    audioTracks: []
  };
}

function readMediaInfoProvenance(value: unknown): MediaInfoProvenance | null {
  if (!isRecord(value)) {
    return null;
  }
  const source = value.source === "ffprobe" || value.source === "mediainfo" || value.source === "manual" || value.source === "unknown"
    ? value.source
    : "unknown";
  return {
    source,
    sourceVersion: typeof value.sourceVersion === "string" ? value.sourceVersion : null,
    probedAt: typeof value.probedAt === "string" ? value.probedAt : null,
    importedFrom: typeof value.importedFrom === "string" ? value.importedFrom : null
  };
}
