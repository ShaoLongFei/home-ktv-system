import type { AssetId, SongId } from "@home-ktv/domain";
import type { QueryExecutor } from "../db/query-executor.js";
import type { AssetRow, SongRow } from "../db/schema.js";
import { PgSongRepository } from "../modules/catalog/repositories/song-repository.js";
import { describe, expect, it } from "vitest";

const now = new Date("2026-05-07T00:00:00.000Z");

describe("catalog search repository", () => {
  it("uses the formal queueable search SQL surface", async () => {
    const db = new FakeCatalogSearchDb([createSongSearchRows()]);

    await new PgSongRepository(db).searchFormalSongs({ query: "七里香", limit: 20 });

    const searchSql = db.searchSql();
    expect(searchSql).toContain("switch_quality_status = 'verified'");
    expect(searchSql).toContain("source_type <> 'online_ephemeral'");
    expect(searchSql).toContain("artist_pinyin");
    expect(searchSql).toContain("artist_initials");
    expect(searchSql).toContain("title_initials");
    expect(searchSql).toContain("search_hints");
    expect(searchSql).toContain("ORDER BY score DESC");
  });

  it("backfills artist pinyin keys before artist pinyin search", async () => {
    const song = createSongRow({
      artist_pinyin: "",
      artist_initials: "",
      artist_name: "周杰伦"
    });
    const db = new FakeCatalogSearchDb([createSongSearchRows({ song })], [song]);

    const results = await new PgSongRepository(db).searchFormalSongs({ query: "zhoujielun" });

    expect(db.songs[0]?.artist_pinyin).toBe("zhoujielun");
    expect(db.songs[0]?.artist_initials).toBe("zjl");
    expect(results[0]?.song.artistName).toBe("周杰伦");
    expect(results[0]?.matchReason).toBe("pinyin");
  });

  it("finds backfilled artist initials", async () => {
    const song = createSongRow({
      artist_pinyin: "",
      artist_initials: "",
      artist_name: "周杰伦"
    });
    const db = new FakeCatalogSearchDb([createSongSearchRows({ song })], [song]);

    const results = await new PgSongRepository(db).searchFormalSongs({ query: "zjl" });

    expect(results[0]?.song.artistName).toBe("周杰伦");
    expect(results[0]?.matchReason).toBe("initials");
  });

  it("maintains artist search keys when artist metadata changes", async () => {
    const db = new FakeCatalogSearchDb([createSongSearchRows()]);

    await new PgSongRepository(db).updateSongMetadata("song-qilixiang", { artistName: "周杰伦" });

    const update = db.queries.find((query) => query.text.startsWith("UPDATE songs"));
    expect(update?.values).toContain("zhoujielun");
    expect(update?.values).toContain("zjl");
  });

  it("maps two vocal assets in one switch family to one version option", async () => {
    const db = new FakeCatalogSearchDb([
      createSongSearchRows({
        assets: [
          createAssetRow({ id: "asset-main-original", vocal_mode: "original", switch_family: "family-main" }),
          createAssetRow({ id: "asset-main-instrumental", vocal_mode: "instrumental", switch_family: "family-main" })
        ]
      })
    ]);

    const results = await new PgSongRepository(db).searchFormalSongs({ query: "七里香" });

    expect(results[0]?.versions).toHaveLength(1);
    expect(results[0]?.versions[0]).toMatchObject({
      assetId: "asset-main-instrumental",
      sourceLabel: "本地",
      qualityLabel: "video / 180s",
      isRecommended: true
    });
  });

  it("sorts D-12 recommendations by quality and newest resource instead of defaultAssetId", async () => {
    const olderDefault = createAssetRow({
      id: "asset-default-audio",
      asset_kind: "audio+lyrics",
      display_name: "默认音频版",
      switch_family: "family-default",
      updated_at: new Date("2026-01-01T00:00:00.000Z")
    });
    const olderDefaultCounterpart = createAssetRow({
      id: "asset-default-audio-original",
      asset_kind: "audio+lyrics",
      vocal_mode: "original",
      display_name: "默认音频版原唱",
      switch_family: "family-default",
      updated_at: new Date("2026-01-01T00:00:00.000Z")
    });
    const newerVideo = createAssetRow({
      id: "asset-new-video",
      display_name: "高清视频版",
      switch_family: "family-video",
      updated_at: new Date("2026-05-01T00:00:00.000Z")
    });
    const newerVideoCounterpart = createAssetRow({
      id: "asset-new-video-original",
      vocal_mode: "original",
      display_name: "高清视频版原唱",
      switch_family: "family-video",
      updated_at: new Date("2026-05-01T00:00:00.000Z")
    });
    const db = new FakeCatalogSearchDb([
      createSongSearchRows({
        song: createSongRow({ default_asset_id: "asset-default-audio" }),
        assets: [olderDefault, olderDefaultCounterpart, newerVideo, newerVideoCounterpart]
      })
    ]);

    const results = await new PgSongRepository(db).searchFormalSongs({ query: "", queuedSongIds: ["song-qilixiang"] });

    expect(results[0]?.queueState).toBe("queued");
    expect(results[0]?.song.defaultAssetId).toBe("asset-default-audio");
    expect(results[0]?.versions.map((version) => version.assetId)).toEqual(["asset-new-video", "asset-default-audio"]);
    expect(results[0]?.versions.map((version) => version.isRecommended)).toEqual([true, false]);
  });
});

interface SearchFixtureRow extends SongRow {
  score: number;
  match_reason: string;
  asset_id: string;
  asset_source_type: string;
  asset_kind: string;
  asset_display_name: string;
  asset_duration_ms: number;
  asset_vocal_mode: string;
  asset_switch_family: string | null;
  asset_updated_at: Date;
  family_quality_rank: number;
  family_newest_at: Date;
}

class FakeCatalogSearchDb implements QueryExecutor {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];

  constructor(
    private readonly rowsBySearch: SearchFixtureRow[][],
    readonly songs: SongRow[] = []
  ) {}

  async query<TRow>(text: string, values: readonly unknown[] = []): Promise<{ rows: TRow[] }> {
    this.queries.push({ text, values });

    if (text.includes("WHERE (artist_pinyin = '' OR artist_initials = '')")) {
      return { rows: this.songs.filter((song) => song.artist_pinyin === "" || song.artist_initials === "") as TRow[] };
    }
    if (text.startsWith("UPDATE songs") && text.includes("artist_name") && text.includes("artist_pinyin")) {
      const id = values.at(-1);
      const song = this.songs.find((candidate) => candidate.id === id);
      if (song) {
        song.artist_name = String(values[0]);
        song.artist_pinyin = String(values[1]);
        song.artist_initials = String(values[2]);
      }
      return { rows: [] };
    }
    if (text.startsWith("UPDATE songs") && text.includes("artist_pinyin")) {
      const [id, artistPinyin, artistInitials] = values;
      const song = this.songs.find((candidate) => candidate.id === id);
      if (song) {
        song.artist_pinyin = String(artistPinyin);
        song.artist_initials = String(artistInitials);
      }
      for (const row of this.rowsBySearch.flat()) {
        if (row.id === id) {
          row.artist_pinyin = String(artistPinyin);
          row.artist_initials = String(artistInitials);
        }
      }
      return { rows: [] };
    }
    if (text.includes("FROM songs s")) {
      const query = String(values[0] ?? "");
      const rows = this.rowsBySearch
        .flat()
        .map((row) => ({ ...row, match_reason: matchReasonFor(row, query), score: scoreFor(row, query) }))
        .filter((row) => query === "" || scoreFor(row, query) > 0);
      return { rows: rows as TRow[] };
    }
    if (text.includes("FROM songs") && text.includes("WHERE id =")) {
      return { rows: [createSongRow()] as TRow[] };
    }
    if (text.includes("FROM assets")) {
      return { rows: [createAssetRow()] as TRow[] };
    }

    return { rows: [] };
  }

  searchSql(): string {
    return this.queries.find((query) => query.text.includes("FROM songs s"))?.text ?? "";
  }
}

function matchReasonFor(row: SearchFixtureRow, query: string): string {
  if (!query) {
    return "default";
  }
  if (row.artist_pinyin.includes(query)) {
    return "pinyin";
  }
  if (row.artist_initials.includes(query)) {
    return "initials";
  }
  if (row.normalized_title.includes(query)) {
    return "normalized_title";
  }
  return "default";
}

function scoreFor(row: SearchFixtureRow, query: string): number {
  if (!query) {
    return 100;
  }
  if (row.artist_pinyin.includes(query)) {
    return 600;
  }
  if (row.artist_initials.includes(query)) {
    return 500;
  }
  if (row.normalized_title.includes(query)) {
    return 800;
  }
  return 0;
}

function createSongSearchRows(input: { song?: SongRow; assets?: AssetRow[] } = {}): SearchFixtureRow[] {
  const song = input.song ?? createSongRow();
  const assets = input.assets ?? [
    createAssetRow({ id: "asset-main-instrumental", vocal_mode: "instrumental" }),
    createAssetRow({ id: "asset-main-original", vocal_mode: "original" })
  ];

  return assets.map((asset) => ({
    ...song,
    score: 800,
    match_reason: "normalized_title",
    asset_id: asset.id,
    asset_source_type: asset.source_type,
    asset_kind: asset.asset_kind,
    asset_display_name: asset.display_name,
    asset_duration_ms: asset.duration_ms,
    asset_vocal_mode: asset.vocal_mode,
    asset_switch_family: asset.switch_family,
    asset_updated_at: asset.updated_at,
    family_quality_rank: asset.asset_kind === "video" || asset.asset_kind === "dual-track-video" ? 2 : 1,
    family_newest_at: asset.updated_at
  }));
}

function createSongRow(input: Partial<SongRow> = {}): SongRow {
  return {
    id: "song-qilixiang" as SongId,
    title: "七里香",
    normalized_title: "七里香",
    title_pinyin: "qilixiang",
    title_initials: "qlx",
    artist_id: "artist-jay",
    artist_name: "周杰伦",
    artist_pinyin: "zhoujielun",
    artist_initials: "zjl",
    language: "mandarin",
    status: "ready",
    genre: [],
    tags: [],
    aliases: ["七里香"],
    search_hints: ["jay"],
    release_year: 2004,
    canonical_duration_ms: 180000,
    search_weight: 10,
    default_asset_id: "asset-main-instrumental" as AssetId,
    created_at: now,
    updated_at: now,
    ...input
  };
}

function createAssetRow(input: Partial<AssetRow> = {}): AssetRow {
  return {
    id: "asset-main-instrumental",
    song_id: "song-qilixiang",
    source_type: "local",
    asset_kind: "video",
    display_name: "本地版本",
    file_path: "/media/qilixiang.mp4",
    duration_ms: 180000,
    lyric_mode: "hard_sub",
    vocal_mode: "instrumental",
    status: "ready",
    switch_family: "family-main",
    switch_quality_status: "verified",
    created_at: now,
    updated_at: now,
    ...input
  };
}
