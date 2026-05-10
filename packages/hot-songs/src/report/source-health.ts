import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SourceRow, SourceStatus, SourceStatusValue } from "../contracts.js";

export type SourceHealthReport = {
  schemaVersion: "hot-songs.source-report.v1";
  generatedAt: string;
  totalRows: number;
  usableSourceCount: number;
  statusCounts: Record<SourceStatusValue, number>;
  sources: SourceStatus[];
};

export type BuildSourceHealthReportInput = {
  generatedAt: string;
  rows: SourceRow[];
  statuses: SourceStatus[];
};

export function buildSourceHealthReport(
  input: BuildSourceHealthReportInput
): SourceHealthReport {
  return {
    schemaVersion: "hot-songs.source-report.v1",
    generatedAt: input.generatedAt,
    totalRows: input.rows.length,
    usableSourceCount: input.statuses.filter((status) => status.usable).length,
    statusCounts: {
      succeeded: countStatus(input.statuses, "succeeded"),
      failed: countStatus(input.statuses, "failed"),
      stale: countStatus(input.statuses, "stale"),
      skipped: countStatus(input.statuses, "skipped")
    },
    sources: input.statuses
  };
}

export async function writeSourceReport(
  outDir: string,
  report: SourceHealthReport
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const reportPath = join(outDir, "source-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

function countStatus(
  statuses: SourceStatus[],
  statusValue: SourceStatusValue
): number {
  return statuses.filter((status) => status.status === statusValue).length;
}
