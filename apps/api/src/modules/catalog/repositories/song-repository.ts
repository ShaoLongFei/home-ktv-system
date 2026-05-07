import type {
  Asset,
  AssetId,
  AssetKind,
  AssetSourceType,
  Language,
  Song,
  SongId,
  SongSearchMatchReason,
  SongSearchQueueState,
  SongSearchVersionOption,
  SongStatus
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { AssetRow, SongRow } from "../../../db/schema.js";
import { buildPinyinSearchKeys, normalizeSearchText } from "../search-normalization.js";
import { searchMatchScores } from "../search-ranking.js";
import { mapAssetRow } from "./asset-repository.js";

export interface SongRepository {
  findById(songId: SongId): Promise<Song | null>;
}

export interface AdminCatalogSongRecord {
  song: Song;
  assets: Asset[];
  defaultAsset: Asset | null;
}

export interface ListFormalSongsFilters {
  status?: SongStatus;
  language?: Language;
  query?: string;
}

export interface UpdateSongMetadataInput {
  title?: string;
  artistName?: string;
  language?: Language;
  genre?: string[];
  tags?: string[];
  aliases?: string[];
  searchHints?: string[];
  releaseYear?: number | null;
}

export interface SearchFormalSongsInput {
  query: string;
  limit?: number;
  queuedSongIds?: readonly SongId[];
}

export interface SearchFormalSongRecord {
  song: Song;
  matchReason: SongSearchMatchReason;
  score: number;
  queueState: SongSearchQueueState;
  versions: SongSearchVersionOption[];
}

export interface AdminCatalogSongRepository {
  listFormalSongs(filters: ListFormalSongsFilters): Promise<AdminCatalogSongRecord[]>;
  getFormalSongWithAssets(songId: SongId): Promise<AdminCatalogSongRecord | null>;
  searchFormalSongs(input: SearchFormalSongsInput): Promise<SearchFormalSongRecord[]>;
  updateSongMetadata(songId: SongId, input: UpdateSongMetadataInput): Promise<AdminCatalogSongRecord | null>;
  updateDefaultAsset(songId: SongId, assetId: AssetId): Promise<AdminCatalogSongRecord | null>;
  updateSongStatus(songId: SongId, status: SongStatus): Promise<AdminCatalogSongRecord | null>;
}

interface SearchFormalSongRow extends SongRow {
  score: number;
  match_reason: SongSearchMatchReason;
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

function toIsoString(value: Date): string {
  return value.toISOString();
}

export function mapSongRow(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    normalizedTitle: row.normalized_title,
    titlePinyin: row.title_pinyin,
    titleInitials: row.title_initials,
    artistId: row.artist_id,
    artistName: row.artist_name,
    language: row.language as Language,
    status: row.status as SongStatus,
    genre: row.genre,
    tags: row.tags,
    aliases: row.aliases,
    searchHints: row.search_hints,
    releaseYear: row.release_year,
    canonicalDurationMs: row.canonical_duration_ms,
    searchWeight: row.search_weight,
    defaultAssetId: row.default_asset_id,
    capabilities: {
      canSwitchVocalMode: false
    },
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export class PgSongRepository implements SongRepository, AdminCatalogSongRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findById(songId: SongId): Promise<Song | null> {
    const result = await this.db.query<SongRow>(
      `SELECT id, title, normalized_title, title_pinyin, title_initials, artist_id, artist_name,
              artist_pinyin, artist_initials, language, status, genre, tags, aliases, search_hints, release_year, canonical_duration_ms,
              search_weight, default_asset_id, created_at, updated_at
       FROM songs
       WHERE id = $1
       LIMIT 1`,
      [songId]
    );

    const row = result.rows[0];
    return row ? mapSongRow(row) : null;
  }

  async listFormalSongs(filters: ListFormalSongsFilters): Promise<AdminCatalogSongRecord[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];

    if (filters.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filters.language) {
      values.push(filters.language);
      clauses.push(`language = $${values.length}`);
    }
    if (filters.query?.trim()) {
      values.push(`%${filters.query.trim().toLowerCase()}%`);
      clauses.push(`(lower(title) LIKE $${values.length} OR lower(artist_name) LIKE $${values.length})`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.db.query<SongRow>(
      `SELECT id, title, normalized_title, title_pinyin, title_initials, artist_id, artist_name,
              artist_pinyin, artist_initials, language, status, genre, tags, aliases, search_hints, release_year, canonical_duration_ms,
              search_weight, default_asset_id, created_at, updated_at
       FROM songs
       ${where}
       ORDER BY updated_at DESC, title ASC
       LIMIT 100`,
      values
    );

    return this.attachAssets(result.rows.map(mapSongRow));
  }

  async getFormalSongWithAssets(songId: SongId): Promise<AdminCatalogSongRecord | null> {
    const song = await this.findById(songId);
    if (!song) {
      return null;
    }

    const records = await this.attachAssets([song]);
    return records[0] ?? null;
  }

  async updateSongMetadata(songId: SongId, input: UpdateSongMetadataInput): Promise<AdminCatalogSongRecord | null> {
    const assignments: string[] = [];
    const values: unknown[] = [];

    if (input.title !== undefined) {
      values.push(input.title);
      assignments.push(`title = $${values.length}`, `normalized_title = lower($${values.length})`);
    }
    if (input.artistName !== undefined) {
      const artistKeys = buildPinyinSearchKeys(input.artistName);
      values.push(input.artistName);
      assignments.push(`artist_name = $${values.length}`);
      values.push(artistKeys.pinyin);
      assignments.push(`artist_pinyin = $${values.length}`);
      values.push(artistKeys.initials);
      assignments.push(`artist_initials = $${values.length}`);
      values.push(`artist-${input.artistName}`);
      assignments.push(`artist_id = $${values.length}`);
    }
    if (input.language !== undefined) {
      values.push(input.language);
      assignments.push(`language = $${values.length}`);
    }
    if (input.genre !== undefined) {
      values.push(input.genre);
      assignments.push(`genre = $${values.length}`);
    }
    if (input.tags !== undefined) {
      values.push(input.tags);
      assignments.push(`tags = $${values.length}`);
    }
    if (input.aliases !== undefined) {
      values.push(input.aliases);
      assignments.push(`aliases = $${values.length}`);
    }
    if (input.searchHints !== undefined) {
      values.push(input.searchHints);
      assignments.push(`search_hints = $${values.length}`);
    }
    if (input.releaseYear !== undefined) {
      values.push(input.releaseYear);
      assignments.push(`release_year = $${values.length}`);
    }

    if (assignments.length > 0) {
      values.push(songId);
      await this.db.query(
        `UPDATE songs
         SET ${assignments.join(", ")}, updated_at = now()
         WHERE id = $${values.length}`,
        values
      );
    }

    return this.getFormalSongWithAssets(songId);
  }

  async backfillArtistSearchKeys(limit = 1000): Promise<number> {
    const result = await this.db.query<Pick<SongRow, "id" | "artist_name">>(
      `SELECT id, artist_name
       FROM songs
       WHERE (artist_pinyin = '' OR artist_initials = '')
       ORDER BY updated_at ASC
       LIMIT $1`,
      [limit]
    );

    let updated = 0;
    for (const row of result.rows) {
      const artistKeys = buildPinyinSearchKeys(row.artist_name);
      await this.db.query(
        `UPDATE songs
         SET artist_pinyin = $2, artist_initials = $3, updated_at = now()
         WHERE id = $1`,
        [row.id, artistKeys.pinyin, artistKeys.initials]
      );
      updated += 1;
    }

    return updated;
  }

  async searchFormalSongs(input: SearchFormalSongsInput): Promise<SearchFormalSongRecord[]> {
    await this.backfillArtistSearchKeys();

    const normalizedQuery = normalizeSearchText(input.query);
    const likeQuery = `%${normalizedQuery}%`;
    const limit = Math.min(50, Math.max(1, input.limit ?? 30));
    const queuedSongIds = new Set(input.queuedSongIds ?? []);

    const result = await this.db.query<SearchFormalSongRow>(
      `WITH eligible_assets AS (
         SELECT a.*
         FROM assets a
         WHERE a.status = 'ready'
           AND a.source_type <> 'online_ephemeral'
           AND a.switch_quality_status = 'verified'
           AND a.switch_family IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM assets counterpart
             WHERE counterpart.song_id = a.song_id
               AND counterpart.switch_family = a.switch_family
               AND counterpart.vocal_mode <> a.vocal_mode
               AND counterpart.status = 'ready'
               AND counterpart.source_type <> 'online_ephemeral'
               AND counterpart.switch_quality_status = 'verified'
           )
       ),
       scored_songs AS (
         SELECT s.id,
                s.title,
                s.normalized_title,
                s.title_pinyin,
                s.title_initials,
                s.artist_id,
                s.artist_name,
                s.artist_pinyin,
                s.artist_initials,
                s.language,
                s.status,
                s.genre,
                s.tags,
                s.aliases,
                s.search_hints,
                s.release_year,
                s.canonical_duration_ms,
                s.search_weight,
                s.default_asset_id,
                s.created_at,
                s.updated_at,
                CASE
                  WHEN $1 = '' THEN ${searchMatchScores.default}
                  WHEN s.normalized_title = $1 THEN ${searchMatchScores.title_exact}
                  WHEN lower(s.artist_name) = $1 THEN ${searchMatchScores.artist_exact}
                  WHEN s.normalized_title LIKE $2 OR similarity(s.normalized_title, $1) > 0.25 THEN ${searchMatchScores.normalized_title}
                  WHEN EXISTS (SELECT 1 FROM unnest(s.aliases) AS alias WHERE lower(alias) LIKE $2) THEN ${searchMatchScores.alias}
                  WHEN s.title_pinyin LIKE $2 OR s.artist_pinyin LIKE $2 THEN ${searchMatchScores.pinyin}
                  WHEN s.title_initials LIKE $2 OR s.artist_initials LIKE $2 THEN ${searchMatchScores.initials}
                  WHEN EXISTS (SELECT 1 FROM unnest(s.search_hints) AS search_hint WHERE lower(search_hint) LIKE $2) THEN ${searchMatchScores.search_hint}
                  ELSE 0
                END AS score,
                CASE
                  WHEN $1 = '' THEN 'default'
                  WHEN s.normalized_title = $1 THEN 'title'
                  WHEN lower(s.artist_name) = $1 THEN 'artist'
                  WHEN s.normalized_title LIKE $2 OR similarity(s.normalized_title, $1) > 0.25 THEN 'normalized_title'
                  WHEN EXISTS (SELECT 1 FROM unnest(s.aliases) AS alias WHERE lower(alias) LIKE $2) THEN 'alias'
                  WHEN s.title_pinyin LIKE $2 OR s.artist_pinyin LIKE $2 THEN 'pinyin'
                  WHEN s.title_initials LIKE $2 OR s.artist_initials LIKE $2 THEN 'initials'
                  WHEN EXISTS (SELECT 1 FROM unnest(s.search_hints) AS search_hint WHERE lower(search_hint) LIKE $2) THEN 'search_hint'
                  ELSE 'default'
                END AS match_reason
         FROM songs s
         WHERE s.status = 'ready'
           AND EXISTS (SELECT 1 FROM eligible_assets ea WHERE ea.song_id = s.id)
           AND (
             $1 = ''
             OR s.normalized_title = $1
             OR lower(s.artist_name) = $1
             OR s.normalized_title LIKE $2
             OR similarity(s.normalized_title, $1) > 0.25
             OR EXISTS (SELECT 1 FROM unnest(s.aliases) AS alias WHERE lower(alias) LIKE $2)
             OR s.title_pinyin LIKE $2
             OR s.artist_pinyin LIKE $2
             OR s.title_initials LIKE $2
             OR s.artist_initials LIKE $2
             OR EXISTS (SELECT 1 FROM unnest(s.search_hints) AS search_hint WHERE lower(search_hint) LIKE $2)
           )
       ),
       limited_songs AS (
         SELECT *
         FROM scored_songs
         WHERE score > 0
         ORDER BY score DESC, search_weight DESC, updated_at DESC, title ASC
         LIMIT $3
       ),
       family_stats AS (
         SELECT ea.song_id,
                ea.switch_family,
                max(CASE WHEN ea.asset_kind = 'video' THEN 2 ELSE 1 END) AS family_quality_rank,
                max(ea.updated_at) AS family_newest_at
         FROM eligible_assets ea
         GROUP BY ea.song_id, ea.switch_family
       )
       SELECT ls.*,
              ea.id AS asset_id,
              ea.source_type AS asset_source_type,
              ea.asset_kind AS asset_kind,
              ea.display_name AS asset_display_name,
              ea.duration_ms AS asset_duration_ms,
              ea.vocal_mode AS asset_vocal_mode,
              ea.switch_family AS asset_switch_family,
              ea.updated_at AS asset_updated_at,
              fs.family_quality_rank,
              fs.family_newest_at
       FROM limited_songs ls
       JOIN eligible_assets ea ON ea.song_id = ls.id
       JOIN family_stats fs ON fs.song_id = ea.song_id AND fs.switch_family = ea.switch_family
       ORDER BY score DESC, ls.search_weight DESC, ls.updated_at DESC, ls.title ASC,
                fs.family_quality_rank DESC, fs.family_newest_at DESC, ea.display_name ASC`,
      [normalizedQuery, likeQuery, limit]
    );

    return this.mapSearchRows(result.rows, queuedSongIds);
  }

  async updateDefaultAsset(songId: SongId, assetId: AssetId): Promise<AdminCatalogSongRecord | null> {
    await this.db.query(
      `UPDATE songs
       SET default_asset_id = $2, updated_at = now()
       WHERE id = $1
         AND EXISTS (SELECT 1 FROM assets WHERE assets.id = $2 AND assets.song_id = songs.id)`,
      [songId, assetId]
    );

    return this.getFormalSongWithAssets(songId);
  }

  async updateSongStatus(songId: SongId, status: SongStatus): Promise<AdminCatalogSongRecord | null> {
    await this.db.query(
      `UPDATE songs
       SET status = $2, updated_at = now()
       WHERE id = $1`,
      [songId, status]
    );

    return this.getFormalSongWithAssets(songId);
  }

  private async attachAssets(songs: Song[]): Promise<AdminCatalogSongRecord[]> {
    if (songs.length === 0) {
      return [];
    }

    const songIds = songs.map((song) => song.id);
    const assetResult = await this.db.query<AssetRow>(
      `SELECT id, song_id, source_type, asset_kind, display_name, file_path, duration_ms,
              lyric_mode, vocal_mode, status, switch_family, switch_quality_status,
              created_at, updated_at
       FROM assets
       WHERE song_id = ANY($1::text[])
       ORDER BY created_at ASC`,
      [songIds]
    );
    const assetsBySongId = new Map<string, Asset[]>();
    for (const asset of assetResult.rows.map(mapAssetRow)) {
      const assets = assetsBySongId.get(asset.songId) ?? [];
      assets.push(asset);
      assetsBySongId.set(asset.songId, assets);
    }

    return songs.map((song) => {
      const assets = assetsBySongId.get(song.id) ?? [];
      return {
        song,
        assets,
        defaultAsset: assets.find((asset) => asset.id === song.defaultAssetId) ?? null
      };
    });
  }

  private mapSearchRows(
    rows: readonly SearchFormalSongRow[],
    queuedSongIds: ReadonlySet<SongId>
  ): SearchFormalSongRecord[] {
    const bySongId = new Map<SongId, SearchFormalSongRow[]>();
    for (const row of rows) {
      const songRows = bySongId.get(row.id) ?? [];
      songRows.push(row);
      bySongId.set(row.id, songRows);
    }

    return Array.from(bySongId.values()).map((songRows) => {
      const first = songRows[0]!;
      return {
        song: mapSongRow(first),
        matchReason: first.match_reason,
        score: first.score,
        queueState: queuedSongIds.has(first.id) ? "queued" : "not_queued",
        versions: buildVersionOptions(songRows)
      };
    });
  }
}

function buildVersionOptions(rows: readonly SearchFormalSongRow[]): SongSearchVersionOption[] {
  const byFamily = new Map<string, SearchFormalSongRow[]>();
  for (const row of rows) {
    if (!row.asset_switch_family) {
      continue;
    }
    const familyRows = byFamily.get(row.asset_switch_family) ?? [];
    familyRows.push(row);
    byFamily.set(row.asset_switch_family, familyRows);
  }

  const options = Array.from(byFamily.values()).map((familyRows) => {
    const sortedRepresentatives = [...familyRows].sort(compareRepresentativeAssets);
    const representative = sortedRepresentatives[0]!;
    const familyQualityRank = Math.max(...familyRows.map((row) => qualityRank(row.asset_kind)));
    const familyNewestAt = familyRows.reduce(
      (newest, row) => (row.asset_updated_at > newest ? row.asset_updated_at : newest),
      familyRows[0]!.asset_updated_at
    );

    return {
      option: {
        assetId: representative.asset_id,
        displayName: representative.asset_display_name.trim() || "本地版本",
        sourceType: representative.asset_source_type as AssetSourceType,
        sourceLabel: sourceLabelFor(representative.asset_source_type as AssetSourceType),
        durationMs: representative.asset_duration_ms,
        qualityLabel: `${representative.asset_kind} / ${Math.round(representative.asset_duration_ms / 1000)}s`,
        isRecommended: false
      },
      familyQualityRank,
      familyNewestAt
    };
  });

  options.sort((left, right) => {
    if (left.familyQualityRank !== right.familyQualityRank) {
      return right.familyQualityRank - left.familyQualityRank;
    }
    const newestDelta = right.familyNewestAt.getTime() - left.familyNewestAt.getTime();
    if (newestDelta !== 0) {
      return newestDelta;
    }
    return left.option.displayName.localeCompare(right.option.displayName);
  });

  return options.map((entry, index) => ({
    ...entry.option,
    isRecommended: index === 0
  }));
}

function compareRepresentativeAssets(left: SearchFormalSongRow, right: SearchFormalSongRow): number {
  const qualityDelta = qualityRank(right.asset_kind) - qualityRank(left.asset_kind);
  if (qualityDelta !== 0) {
    return qualityDelta;
  }
  const updatedDelta = right.asset_updated_at.getTime() - left.asset_updated_at.getTime();
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  if (right.asset_duration_ms !== left.asset_duration_ms) {
    return right.asset_duration_ms - left.asset_duration_ms;
  }
  return left.asset_id.localeCompare(right.asset_id);
}

function qualityRank(assetKind: string): number {
  return assetKind === ("video" satisfies AssetKind) ? 2 : 1;
}

function sourceLabelFor(sourceType: AssetSourceType): string {
  if (sourceType === "local") {
    return "本地";
  }
  if (sourceType === "online_cached") {
    return "已缓存在线";
  }
  throw new Error("Online ephemeral assets are not queueable search versions");
}
