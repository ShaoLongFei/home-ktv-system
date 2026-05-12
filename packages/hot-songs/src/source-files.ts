import { readFile } from "node:fs/promises";

import { z } from "zod";

import {
  SourceRowSchema,
  SourceStatusSchema,
  type SourceRow,
  type SourceStatus
} from "./contracts.js";

export type SourceRowsFile = {
  rows: SourceRow[];
  generatedAt: string | undefined;
};

export type SourceReportFile = {
  sources: SourceStatus[];
  generatedAt: string | undefined;
};

const SourceRowsFileSchema = z
  .union([
    SourceRowSchema.array(),
    z.object({
      generatedAt: z.string().datetime().optional(),
      rows: SourceRowSchema.array()
    })
  ])
  .transform((parsed) =>
    Array.isArray(parsed)
      ? { rows: parsed, generatedAt: undefined as string | undefined }
      : { rows: parsed.rows, generatedAt: parsed.generatedAt }
  );

const SourceReportFileSchema = z
  .union([
    SourceStatusSchema.array(),
    z.object({
      generatedAt: z.string().datetime().optional(),
      sources: SourceStatusSchema.array()
    })
  ])
  .transform((parsed) =>
    Array.isArray(parsed)
      ? { sources: parsed, generatedAt: undefined as string | undefined }
      : { sources: parsed.sources, generatedAt: parsed.generatedAt }
  );

export async function readSourceRowsFile(
  filePath: string
): Promise<SourceRowsFile> {
  return SourceRowsFileSchema.parse(await readJsonFile(filePath));
}

export async function readSourceReportFile(
  filePath: string
): Promise<SourceReportFile> {
  return SourceReportFileSchema.parse(await readJsonFile(filePath));
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const fileContent = await readFile(filePath, "utf8");
  return JSON.parse(fileContent) as unknown;
}
