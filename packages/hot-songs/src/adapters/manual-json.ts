import {
  ManualSnapshotSchema,
  type SourceDefinition,
  type SourceRow
} from "../contracts.js";
import { readJsonFile, resolveRunPath } from "../manifest.js";

export type ManualJsonSourceContext = {
  runRoot?: string;
};

export async function collectManualJsonSource(
  source: SourceDefinition,
  context: ManualJsonSourceContext
): Promise<SourceRow[]> {
  if (source.adapter !== "manual_json") {
    throw new Error(`Source ${source.id} does not use the manual_json adapter`);
  }

  if (source.file === undefined) {
    throw new Error(`Source ${source.id} is missing a manual snapshot file`);
  }

  const snapshotPath = resolveRunPath(source.file, context.runRoot);
  const snapshot = ManualSnapshotSchema.parse(await readJsonFile(snapshotPath));

  return snapshot.rows.map((row) => ({
    sourceId: source.id,
    sourceType: source.sourceType,
    provider: source.provider,
    rank: row.rank,
    rawTitle: row.title,
    rawArtists: row.artists,
    sourceUrl: snapshot.sourceUrl ?? null,
    sourcePublishedAt: snapshot.publishedAt,
    collectedAt: snapshot.capturedAt,
    warnings: row.notes === undefined ? [] : [row.notes]
  }));
}
