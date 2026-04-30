import path from "node:path";
import type { AssetKind, ImportFile, Language, VocalMode } from "@home-ktv/domain";
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

export class CandidateBuilder {
  constructor(private readonly options: CandidateBuilderOptions) {}

  async buildFromImportFiles(files: ImportFile[]): Promise<number> {
    const groups = groupImportFiles(files);

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
          return {
            importFileId: file.id,
            selected: true,
            proposedVocalMode,
            proposedAssetKind: inferAssetKind(file.relativePath),
            roleConfidence: proposedVocalMode === "unknown" ? 0.4 : 0.9,
            probeDurationMs: file.durationMs,
            probeSummary: buildProbeSummary(file)
          };
        })
      });
    }

    return groups.length;
  }
}

function groupImportFiles(files: ImportFile[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();

  for (const file of files) {
    if (file.deletedAt || file.probeStatus === "deleted") {
      continue;
    }

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
  return /[\u4e00-\u9fff]/u.test(`${group.artistName}${group.title}`) ? "mandarin" : "other";
}

function buildProbeSummary(file: ImportFile): Record<string, unknown> {
  return {
    durationMs: file.durationMs,
    probeStatus: file.probeStatus,
    ...file.probePayload
  };
}
