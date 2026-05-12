import { describe, expect, it } from "vitest";

import {
  SourceDefinitionSchema,
  SourceManifestSchema,
  SourceStatusValueSchema
} from "../contracts.js";

describe("SourceDefinitionSchema", () => {
  it("accepts QQ K歌 public chart source defaults", () => {
    const source = SourceDefinitionSchema.parse({
      id: "qq-kge-toplist",
      name: "QQ Music K歌金曲榜",
      provider: "qq_music",
      sourceType: "ktv_first",
      sourceKind: "public_chart",
      adapter: "qq_toplist",
      weight: 100,
      url: "https://y.qq.com/n/ryqq/toplist/36"
    });

    expect(source.enabled).toBe(true);
    expect(source.required).toBe(false);
    expect(source.expectedMinRows).toBe(1);
    expect(source.targetRows).toBe(500);
    expect(source.minRows).toBeUndefined();
    expect(source.staleAfterDays).toBe(14);
    expect(source.usableWhenStale).toBe(false);
  });

  it("accepts optional cookie env names without storing cookie values", () => {
    const source = SourceDefinitionSchema.parse({
      id: "qq-hot-toplist",
      name: "QQ Music 热歌榜",
      provider: "qq_music",
      sourceType: "support",
      sourceKind: "public_chart",
      adapter: "qq_toplist",
      weight: 45,
      url: "https://y.qq.com/n/ryqq/toplist/26",
      authCookieEnv: "QQ_MUSIC_COOKIE"
    });

    expect(source.authCookieEnv).toBe("QQ_MUSIC_COOKIE");
  });

  it("accepts CAVCA manual snapshot source", () => {
    const source = SourceDefinitionSchema.parse({
      id: "cavca-golden-mic-manual",
      name: "CAVCA 金麦榜 manual snapshot",
      provider: "cavca",
      sourceType: "ktv_first",
      sourceKind: "manual_snapshot",
      adapter: "manual_json",
      weight: 110,
      file: ".planning/source-snapshots/hot-songs/cavca-golden-mic.json"
    });

    expect(source.id).toBe("cavca-golden-mic-manual");
    expect(source.file).toBe(
      ".planning/source-snapshots/hot-songs/cavca-golden-mic.json"
    );
  });

  it("rejects auth and private-token headers", () => {
    expect(() =>
      SourceDefinitionSchema.parse({
        id: "bad-cookie",
        name: "Bad Cookie",
        provider: "qq_music",
        sourceType: "support",
        sourceKind: "public_chart",
        adapter: "qq_toplist",
        weight: 20,
        url: "https://y.qq.com/n/ryqq/toplist/26",
        headers: { cookie: "uin=1" }
      })
    ).toThrow(/public metadata sources/);

    expect(() =>
      SourceDefinitionSchema.parse({
        id: "bad-authorization",
        name: "Bad Authorization",
        provider: "netease",
        sourceType: "support",
        sourceKind: "public_chart",
        adapter: "netease_toplist_html",
        weight: 20,
        url: "https://music.163.com/discover/toplist",
        headers: { Authorization: "Bearer private" }
      })
    ).toThrow(/public metadata sources/);
  });

  it("requires URL for public charts and file for manual snapshots", () => {
    expect(() =>
      SourceDefinitionSchema.parse({
        id: "public-without-url",
        name: "Public Without URL",
        provider: "kugou",
        sourceType: "support",
        sourceKind: "public_chart",
        adapter: "kugou_rank_html",
        weight: 40
      })
    ).toThrow(/url or urls is required/);

    expect(() =>
      SourceDefinitionSchema.parse({
        id: "manual-without-file",
        name: "Manual Without File",
        provider: "manual",
        sourceType: "ktv_first",
        sourceKind: "manual_snapshot",
        adapter: "manual_json",
        weight: 80
      })
    ).toThrow(/file is required/);
  });

  it("rejects duplicate source ids in a manifest", () => {
    const source = {
      id: "duplicate-source",
      name: "Duplicate Source",
      provider: "qq_music",
      sourceType: "support",
      sourceKind: "public_chart",
      adapter: "qq_toplist",
      weight: 20,
      url: "https://y.qq.com/n/ryqq/toplist/26"
    };

    expect(() =>
      SourceManifestSchema.parse({
        schemaVersion: "hot-songs.source-manifest.v1",
        sources: [source, { ...source, name: "Duplicate Source 2" }]
      })
    ).toThrow(/duplicate source id/);
  });
});

describe("SourceStatusValueSchema", () => {
  it("uses the exact full-chart coverage status vocabulary", () => {
    expect(SourceStatusValueSchema.options).toEqual([
      "succeeded",
      "platform_cap",
      "failed_below_min_rows",
      "failed",
      "stale",
      "skipped"
    ]);
  });
});
