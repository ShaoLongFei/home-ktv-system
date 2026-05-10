import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { SourceManifestSchema, type SourceManifest } from "./contracts.js";

export async function readJsonFile(filePath: string): Promise<unknown> {
  const fileContent = await readFile(filePath, "utf8");
  return JSON.parse(fileContent) as unknown;
}

export async function loadSourceManifest(
  filePath: string
): Promise<SourceManifest> {
  const manifest = await readJsonFile(resolveRunPath(filePath));
  return SourceManifestSchema.parse(manifest);
}

export function validateManifestPath(filePath: string | undefined): string {
  if (filePath === undefined || filePath.length === 0) {
    throw new Error("Missing required --manifest <path>");
  }

  return filePath;
}

export function resolveRunPath(filePath: string, runRoot?: string): string {
  if (isAbsolute(filePath)) {
    return filePath;
  }

  return resolve(runRoot ?? process.env.INIT_CWD ?? process.cwd(), filePath);
}
