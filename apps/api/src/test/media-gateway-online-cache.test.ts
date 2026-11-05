import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaPathResolver } from "../modules/assets/media-path-resolver.js";
import { MediaGateway, type OnlineCachedAssetRepository } from "../modules/media/media-gateway.js";
import type { PlayableMediaRepository } from "../modules/media/playable-media-repository.js";

describe("MediaGateway promoted online assets", () => {
  let mediaRoot = "";
  let cachePath = "";

  beforeEach(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), "gateway-online-"));
    cachePath = join(mediaRoot, "online-cache", "igeba", "20039643.mkv");
    await writeFile(cachePath, "0123456789").catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(mediaRoot, "online-cache", "igeba"), { recursive: true });
      await writeFile(cachePath, "0123456789");
    });
  });

  afterEach(async () => {
    await rm(mediaRoot, { recursive: true, force: true });
  });

  class FakeOnlineAssets implements OnlineCachedAssetRepository {
    constructor(private readonly assets: Record<string, { status: string; cachePath: string | null }>) {}

    async findAssetById(assetId: string) {
      return this.assets[assetId] ?? null;
    }

    async findAssetByCatalogSongId(songId: string) {
      return this.assets[songId] ?? null;
    }
  }

  function createGateway(onlineAssets: OnlineCachedAssetRepository): MediaGateway {
    return new MediaGateway({
      playableMedia: { findPlayableBySource: async () => null } as PlayableMediaRepository,
      mediaPathResolver: new MediaPathResolver({ mediaRoot }),
      publicBaseUrl: "",
      onlineAssets
    });
  }

  it("serves a promoted online song from the online cache even when NAS lookup misses", async () => {
    const gateway = createGateway(
      new FakeOnlineAssets({
        "ktv-online-igeba-20039643": { status: "ready", cachePath }
      })
    );

    const resolution = await gateway.resolveForStreaming({
      sourceType: "nas",
      assetId: "ktv-online-igeba-20039643"
    });

    expect(resolution).toMatchObject({
      ok: true,
      sourceType: "nas",
      assetId: "ktv-online-igeba-20039643",
      contentLength: 10,
      contentType: "video/x-matroska"
    });
  });

  it("serves the instrumental variant file when requested", async () => {
    const variantPath = join(mediaRoot, "online-cache", "igeba", "20039643.instrumental.mkv");
    await writeFile(variantPath, "abcdefghij");

    const gateway = new MediaGateway({
      playableMedia: {
        findPlayableBySource: async () => ({
          sourceType: "nas",
          songId: "ktv-online-igeba-20039643",
          assetId: "ktv-online-igeba-20039643",
          title: "孤勇者",
          artistName: "陈奕迅",
          displayName: "20039643.mkv",
          filePath: cachePath,
          status: "ready",
          durationMs: 1000,
          compatibilityStatus: "playable",
          compatibilityReasons: [],
          mediaInfoSummary: {
            container: "matroska",
            durationMs: 1000,
            videoCodec: "h264",
            resolution: null,
            fileSizeBytes: 10,
            audioTracks: []
          },
          mediaInfoProvenance: { source: "ffprobe", sourceVersion: null, probedAt: null, importedFrom: cachePath },
          trackRoles: { original: null, instrumental: null },
          playbackProfile: { kind: "single_file_audio_tracks", container: "matroska", videoCodec: "h264", audioCodecs: ["vorbis"], requiresAudioTrackSelection: true },
          variantFilePaths: { instrumental: variantPath }
        })
      },
      mediaPathResolver: new MediaPathResolver({ mediaRoot }),
      publicBaseUrl: ""
    });

    const resolution = await gateway.resolveForStreaming({
      sourceType: "nas",
      assetId: "ktv-online-igeba-20039643",
      variant: "instrumental"
    });

    expect(resolution).toMatchObject({ ok: true, filePath: variantPath, contentLength: 10 });
  });

  it("returns 409 while the promoted asset is still caching", async () => {
    const gateway = createGateway(
      new FakeOnlineAssets({
        "ktv-online-igeba-20039643": { status: "caching", cachePath: null }
      })
    );

    const resolution = await gateway.resolveForStreaming({
      sourceType: "nas",
      assetId: "ktv-online-igeba-20039643"
    });

    expect(resolution).toEqual({ ok: false, statusCode: 409, code: "ONLINE_ASSET_NOT_READY" });
  });
});
