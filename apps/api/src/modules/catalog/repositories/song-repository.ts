import type { Language, Song, SongId, SongStatus } from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { SongRow } from "../../../db/schema.js";

export interface SongRepository {
  findById(songId: SongId): Promise<Song | null>;
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

export class PgSongRepository implements SongRepository {
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
}
