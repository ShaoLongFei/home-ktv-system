import type { Asset, AssetId, Language, Song, SongId, SongStatus } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { AssetRow, SongRow } from "../../../db/schema.js";
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

export interface AdminCatalogSongRepository {
  listFormalSongs(filters: ListFormalSongsFilters): Promise<AdminCatalogSongRecord[]>;
  getFormalSongWithAssets(songId: SongId): Promise<AdminCatalogSongRecord | null>;
  updateSongMetadata(songId: SongId, input: UpdateSongMetadataInput): Promise<AdminCatalogSongRecord | null>;
  updateDefaultAsset(songId: SongId, assetId: AssetId): Promise<AdminCatalogSongRecord | null>;
  updateSongStatus(songId: SongId, status: SongStatus): Promise<AdminCatalogSongRecord | null>;
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
              language, status, genre, tags, aliases, search_hints, release_year, canonical_duration_ms,
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
              language, status, genre, tags, aliases, search_hints, release_year, canonical_duration_ms,
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
      values.push(input.artistName);
      assignments.push(`artist_name = $${values.length}`);
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
}
