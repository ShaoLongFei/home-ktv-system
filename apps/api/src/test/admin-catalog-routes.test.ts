import Fastify from "fastify";
import type {
  Asset,
  AssetStatus,
  Language,
  LyricMode,
  Song,
  SongStatus,
  SwitchQualityStatus,
  VocalMode
} from "@home-ktv/domain";
import { describe, expect, it, vi } from "vitest";
import type { CatalogAdmissionService } from "../modules/catalog/admission-service.js";
import { registerAdminCatalogRoutes } from "../routes/admin-catalog.js";

describe("admin catalog routes", () => {
  it("GET /admin/catalog/songs returns formal songs with status, default asset, and asset summaries", async () => {
    const { server, songs } = await createAdminCatalogHarness();

    const response = await server.inject({
      method: "GET",
      url: "/admin/catalog/songs?status=ready&language=mandarin&q=七"
    });

    expect(response.statusCode).toBe(200);
    expect(songs.listFormalSongs).toHaveBeenCalledWith({
      status: "ready",
      language: "mandarin",
      query: "七"
    });
    expect(response.json()).toMatchObject({
      songs: [
        {
          id: "song-1",
          title: "七里香",
          status: "ready",
          defaultAssetId: "asset-instrumental",
          defaultAsset: {
            id: "asset-instrumental",
            vocalMode: "instrumental",
            switchQualityStatus: "verified"
          },
          assets: expect.arrayContaining([
            expect.objectContaining({
              id: "asset-original",
              status: "ready",
              vocalMode: "original",
              lyricMode: "hard_sub",
              switchFamily: "main"
            })
          ])
        }
      ]
    });
  });

  it("PATCH /admin/catalog/songs/:songId updates metadata without changing strict switch state", async () => {
    const { server, songs, admissionService } = await createAdminCatalogHarness();

    const response = await server.inject({
      method: "PATCH",
      url: "/admin/catalog/songs/song-1",
      payload: {
        title: "七里香 Live",
        artistName: "周杰伦",
        language: "mandarin",
        genre: ["pop"],
        tags: ["ktv"],
        aliases: ["Qi Li Xiang"],
        searchHints: ["qlx"],
        releaseYear: 2004
      }
    });

    expect(response.statusCode).toBe(200);
    expect(songs.updateSongMetadata).toHaveBeenCalledWith(
      "song-1",
      expect.objectContaining({
        title: "七里香 Live",
        artistName: "周杰伦",
        language: "mandarin",
        releaseYear: 2004
      })
    );
    expect(admissionService.revalidateFormalSong).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({
      song: {
        id: "song-1",
        title: "七里香 Live",
        status: "ready",
        defaultAssetId: "asset-instrumental",
        assets: expect.arrayContaining([
          expect.objectContaining({
            id: "asset-original",
            status: "ready",
            switchQualityStatus: "verified"
          })
        ])
      }
    });
  });

  it("PATCH /admin/catalog/songs/:songId/default-asset revalidates the formal song", async () => {
    const { server, songs, admissionService } = await createAdminCatalogHarness();

    const response = await server.inject({
      method: "PATCH",
      url: "/admin/catalog/songs/song-1/default-asset",
      payload: { assetId: "asset-instrumental" }
    });

    expect(response.statusCode).toBe(200);
    expect(songs.updateDefaultAsset).toHaveBeenCalledWith("song-1", "asset-instrumental");
    expect(admissionService.revalidateFormalSong).toHaveBeenCalledWith("song-1");
    expect(response.json()).toMatchObject({
      song: {
        id: "song-1",
        defaultAssetId: "asset-instrumental",
        status: "ready"
      },
      evaluation: { status: "verified" }
    });
  });

  it("PATCH /admin/catalog/assets/:assetId applies dangerous edits through strict revalidation", async () => {
    const { server, admissionService } = await createAdminCatalogHarness({
      serviceRecord: createSongRecord({
        song: createSong({ status: "review_required" }),
        assets: [
          createAsset({ id: "asset-original", vocalMode: "original", switchQualityStatus: "review_required" }),
          createAsset({ id: "asset-instrumental", vocalMode: "instrumental", switchQualityStatus: "review_required" })
        ]
      }),
      serviceEvaluation: {
        status: "review_required",
        reason: "duration-delta-over-300ms",
        pairAssetIds: ["asset-original", "asset-instrumental"]
      }
    });

    const response = await server.inject({
      method: "PATCH",
      url: "/admin/catalog/assets/asset-original",
      payload: {
        status: "ready",
        vocalMode: "original",
        lyricMode: "hard_sub",
        switchFamily: "main",
        switchQualityStatus: "verified"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(admissionService.updateFormalAssetWithRevalidation).toHaveBeenCalledWith({
      assetId: "asset-original",
      patch: expect.objectContaining({
        status: "ready",
        vocalMode: "original",
        lyricMode: "hard_sub",
        switchFamily: "main",
        switchQualityStatus: "verified"
      })
    });
    expect(response.json()).toMatchObject({
      song: { status: "review_required" },
      evaluation: { status: "review_required", reason: "duration-delta-over-300ms" },
      asset: { id: "asset-original", switchQualityStatus: "review_required" }
    });
  });

  it("PATCH /admin/catalog/assets/:assetId rejects verified overrides when duration delta is over 300ms", async () => {
    const { server, admissionService } = await createAdminCatalogHarness();
    admissionService.updateFormalAssetWithRevalidation.mockRejectedValueOnce({
      code: "DURATION_DELTA_OVER_300MS",
      reason: "duration-delta-over-300ms"
    });

    const response = await server.inject({
      method: "PATCH",
      url: "/admin/catalog/assets/asset-original",
      payload: { switchQualityStatus: "verified" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "DURATION_DELTA_OVER_300MS",
      reason: "duration-delta-over-300ms"
    });
  });

  it("POST /admin/catalog/songs/:songId/revalidate exposes strict pair evaluation", async () => {
    const { server, admissionService } = await createAdminCatalogHarness();

    const response = await server.inject({
      method: "POST",
      url: "/admin/catalog/songs/song-1/revalidate",
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(admissionService.revalidateFormalSong).toHaveBeenCalledWith("song-1");
    expect(response.json()).toMatchObject({
      song: { id: "song-1", status: "ready" },
      evaluation: { status: "verified" }
    });
  });
});

async function createAdminCatalogHarness(input: {
  serviceRecord?: AdminCatalogSongRecord;
  serviceEvaluation?: { status: "verified" | "review_required" | "rejected"; reason?: string; pairAssetIds: string[] };
} = {}) {
  const server = Fastify({ logger: false });
  const record = createSongRecord();
  const serviceRecord = input.serviceRecord ?? record;
  const serviceEvaluation = input.serviceEvaluation ?? {
    status: "verified" as const,
    pairAssetIds: ["asset-original", "asset-instrumental"]
  };
  const songs = {
    listFormalSongs: vi.fn(async (_filters: Record<string, unknown>) => [record]),
    getFormalSongWithAssets: vi.fn(async (_songId: string) => record),
    updateSongMetadata: vi.fn(async (_songId: string, metadata: Record<string, unknown>) =>
      createSongRecord({ song: createSong({ ...metadata }) })
    ),
    updateDefaultAsset: vi.fn(async (_songId: string, assetId: string) =>
      createSongRecord({ song: createSong({ defaultAssetId: assetId }) })
    )
  };
  const admissionService = {
    revalidateFormalSong: vi.fn(async (_songId: string) => ({ record: serviceRecord, evaluation: serviceEvaluation })),
    updateFormalAssetWithRevalidation: vi.fn(
      async (_input: Parameters<CatalogAdmissionService["updateFormalAssetWithRevalidation"]>[0]) => ({
      record: serviceRecord,
      asset: serviceRecord.assets[0] ?? createAsset(),
      evaluation: serviceEvaluation
    }))
  };

  await registerAdminCatalogRoutes(server, { songs, admissionService });
  return { server, songs, admissionService };
}

interface AdminCatalogSongRecord {
  song: Song;
  assets: Asset[];
  defaultAsset: Asset | null;
}

function createSongRecord(input: { song?: Song; assets?: Asset[] } = {}): AdminCatalogSongRecord {
  const assets =
    input.assets ?? [
      createAsset({ id: "asset-original", vocalMode: "original" }),
      createAsset({ id: "asset-instrumental", vocalMode: "instrumental" })
    ];
  const song = input.song ?? createSong();
  return {
    song,
    assets,
    defaultAsset: assets.find((asset) => asset.id === song.defaultAssetId) ?? null
  };
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

function createAsset(
  overrides: Partial<Asset> & {
    status?: AssetStatus;
    lyricMode?: LyricMode;
    language?: Language;
    songStatus?: SongStatus;
    switchQualityStatus?: SwitchQualityStatus;
    vocalMode?: VocalMode;
  } = {}
): Asset {
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
