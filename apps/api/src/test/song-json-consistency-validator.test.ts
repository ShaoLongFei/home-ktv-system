import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Asset, Song } from "@home-ktv/domain";
import { describe, expect, it } from "vitest";
import { validateSongJsonConsistency } from "../modules/catalog/song-json-consistency-validator.js";

describe("validateSongJsonConsistency", () => {
  it("reports missing song.json, missing media files, malformed metadata, and DB status mismatches", async () => {
    const songsRoot = await createSongsRoot();
    const song = createSong();
    const assets = [
      createAsset({ id: "asset-original", vocalMode: "original", filePath: "songs/mandarin/周杰伦/七里香/original.mp4" })
    ];

    const missingJson = await validateSongJsonConsistency({ songsRoot, song, assets });

    expect(missingJson.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MISSING_SONG_JSON", severity: "error" })])
    );

    await writeSongJson(songsRoot, "mandarin/周杰伦/七里香/song.json", {
      title: "",
      artistName: "周杰伦",
      language: "mandarin",
      status: "unavailable",
      defaultAssetId: "asset-missing",
      defaultAssetPath: "instrumental.mp4",
      assets: [
        {
          id: "asset-original",
          filePath: "original.mp4",
          vocalMode: "original",
          lyricMode: "hard_sub",
          status: "ready",
          switchFamily: "main",
          switchQualityStatus: "verified",
          durationMs: 180000
        }
      ]
    });

    const result = await validateSongJsonConsistency({ songsRoot, song, assets });

    expect(result.status).toBe("failed");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MALFORMED_SONG_JSON", severity: "error" }),
        expect.objectContaining({ code: "MISSING_MEDIA_FILE", severity: "error", assetId: "asset-original" }),
        expect.objectContaining({ code: "SONG_STATUS_MISMATCH", severity: "warning" }),
        expect.objectContaining({ code: "DEFAULT_ASSET_MISMATCH", severity: "error" })
      ])
    );
  });

  it("reports duration-delta-over-300ms pairs as non-verified without a manual override path", async () => {
    const songsRoot = await createSongsRoot();
    const song = createSong();
    const assets = [
      createAsset({ id: "asset-original", vocalMode: "original", filePath: "songs/mandarin/周杰伦/七里香/original.mp4" }),
      createAsset({
        id: "asset-instrumental",
        vocalMode: "instrumental",
        filePath: "songs/mandarin/周杰伦/七里香/instrumental.mp4",
        durationMs: 180500
      })
    ];
    await mkdir(path.join(songsRoot, "mandarin/周杰伦/七里香"), { recursive: true });
    await writeFile(path.join(songsRoot, "mandarin/周杰伦/七里香/original.mp4"), "original");
    await writeFile(path.join(songsRoot, "mandarin/周杰伦/七里香/instrumental.mp4"), "instrumental");
    await writeSongJson(songsRoot, "mandarin/周杰伦/七里香/song.json", {
      title: "七里香",
      artistName: "周杰伦",
      language: "mandarin",
      status: "ready",
      defaultAssetId: "asset-instrumental",
      defaultAssetPath: "instrumental.mp4",
      assets: [
        {
          id: "asset-original",
          filePath: "original.mp4",
          vocalMode: "original",
          lyricMode: "hard_sub",
          status: "ready",
          switchFamily: "main",
          switchQualityStatus: "verified",
          durationMs: 180000
        },
        {
          id: "asset-instrumental",
          filePath: "instrumental.mp4",
          vocalMode: "instrumental",
          lyricMode: "hard_sub",
          status: "ready",
          switchFamily: "main",
          switchQualityStatus: "verified",
          durationMs: 180500
        }
      ]
    });

    const result = await validateSongJsonConsistency({ songsRoot, song, assets });

    expect(result.status).toBe("review_required");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SWITCH_PAIR_NOT_VERIFIED",
          reason: "duration-delta-over-300ms",
          severity: "error"
        })
      ])
    );
    expect(JSON.stringify(result)).not.toContain("manualOverride");
  });
});

async function createSongsRoot(): Promise<string> {
  return import("node:fs/promises").then((fs) => fs.mkdtemp(path.join(tmpdir(), "home-ktv-songs-")));
}

async function writeSongJson(songsRoot: string, relativePath: string, document: Record<string, unknown>): Promise<void> {
  const targetPath = path.join(songsRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function createSong(overrides: Partial<Song> = {}): Song {
  return {
    id: "song-1",
    title: "七里香",
    normalizedTitle: "七里香",
    titlePinyin: "",
    titleInitials: "",
    artistId: "artist-1",
    artistName: "周杰伦",
    language: "mandarin",
    status: "ready",
    genre: [],
    tags: [],
    aliases: [],
    searchHints: [],
    releaseYear: 2004,
    canonicalDurationMs: 180000,
    searchWeight: 0,
    defaultAssetId: "asset-instrumental",
    capabilities: { canSwitchVocalMode: true },
    createdAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    ...overrides
  };
}

function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-original",
    songId: "song-1",
    sourceType: "local",
    assetKind: "video",
    displayName: "七里香",
    filePath: "songs/mandarin/周杰伦/七里香/original.mp4",
    durationMs: 180000,
    lyricMode: "hard_sub",
    vocalMode: "original",
    status: "ready",
    switchFamily: "main",
    switchQualityStatus: "verified",
    createdAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
    ...overrides
  };
}
