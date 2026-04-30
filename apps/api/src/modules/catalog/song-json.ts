import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Language, VocalMode } from "@home-ktv/domain";

export interface SongJsonAsset {
  filePath: string;
  vocalMode: VocalMode;
  durationMs: number;
  switchFamily: string;
}

export interface SongJsonDocument {
  title: string;
  artistName: string;
  language: Language;
  defaultVocalMode: VocalMode;
  sameVersionConfirmed: boolean;
  assets: SongJsonAsset[];
}

export async function writeSongJson(targetDirectory: string, document: SongJsonDocument): Promise<void> {
  await mkdir(targetDirectory, { recursive: true });
  const targetPath = path.join(targetDirectory, "song.json");
  const tempPath = path.join(targetDirectory, `.song.json.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(tempPath, targetPath);
}
