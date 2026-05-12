import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SourceRow, SourceStatus } from "./contracts.js";
import {
  buildSourceHealthReport,
  writeSourceReport
} from "./report/source-health.js";

export type SourceCollectionArtifactInput = {
  generatedAt: string;
  rows: SourceRow[];
  statuses: SourceStatus[];
};

export type SourceCollectionArtifacts = {
  sourceRowsJson: string;
  sourceReportJson: string;
  sourcesDir: string;
};

export async function writeSourceCollectionArtifacts(
  outDir: string,
  input: SourceCollectionArtifactInput
): Promise<SourceCollectionArtifacts> {
  await mkdir(outDir, { recursive: true });

  const sourceRowsJson = await writeSourceRows(outDir, input.generatedAt, input.rows);
  const sourcesDir = await writePerSourceRows(
    outDir,
    input.generatedAt,
    input.rows,
    input.statuses
  );
  const sourceReportJson = await writeSourceReport(
    outDir,
    buildSourceHealthReport(input)
  );

  return {
    sourceRowsJson,
    sourceReportJson,
    sourcesDir
  };
}

async function writePerSourceRows(
  outDir: string,
  generatedAt: string,
  rows: SourceRow[],
  statuses: SourceStatus[]
): Promise<string> {
  const sourcesDir = join(outDir, "sources");
  await mkdir(sourcesDir, { recursive: true });

  await Promise.all(
    statuses.map((status) => {
      const sourceRows = rows.filter((row) => row.sourceId === status.sourceId);
      return writeFile(
        join(sourcesDir, `${status.sourceId}.json`),
        `${JSON.stringify(
          {
            schemaVersion: "hot-songs.source-file.v1",
            generatedAt,
            sourceId: status.sourceId,
            rowCount: sourceRows.length,
            rows: sourceRows
          },
          null,
          2
        )}\n`,
        "utf8"
      );
    })
  );

  return sourcesDir;
}

async function writeSourceRows(
  outDir: string,
  generatedAt: string,
  rows: SourceRow[]
): Promise<string> {
  const sourceRowsJson = join(outDir, "source-rows.json");
  await writeFile(
    sourceRowsJson,
    `${JSON.stringify(
      {
        schemaVersion: "hot-songs.source-rows.v1",
        generatedAt,
        rows
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return sourceRowsJson;
}
