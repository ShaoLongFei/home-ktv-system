import type { QueryExecutor } from "../../db/query-executor.js";
import { buildPinyinSearchKeys, normalizeSearchText } from "../catalog/search-normalization.js";

export type OnlineAssetStatus = "ready" | "caching" | "failed" | "unavailable";

export interface OnlineSongRecord {
  id: string;
  provider: string;
  providerSongId: string;
  title: string;
  artistName: string;
  durationMs: number | null;
  metadata: Record<string, unknown>;
}

export interface OnlineAssetRecord {
  id: string;
  songId: string;
  provider: string;
  providerAssetId: string;
  mediaUrl: string;
  cachePath: string | null;
  catalogSongId: string | null;
  status: OnlineAssetStatus;
  durationMs: number | null;
  cacheBytes: number | null;
  audioTrackCount: number | null;
  errorReason: string | null;
  metadata: Record<string, unknown>;
}

export interface UpsertOnlineSongInput {
  provider: string;
  providerSongId: string;
  title: string;
  artistName: string;
  durationMs?: number | null;
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface UpsertOnlineAssetInput {
  provider: string;
  providerAssetId: string;
  songId: string;
  mediaUrl: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateOnlineAssetPatch {
  status?: OnlineAssetStatus;
  cachePath?: string | null;
  catalogSongId?: string | null;
  mediaUrl?: string;
  durationMs?: number | null;
  cacheBytes?: number | null;
  audioTrackCount?: number | null;
  errorReason?: string | null;
  lastResolvedAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface OnlineAssetStats {
  total: number;
  ready: number;
  caching: number;
  failed: number;
  unavailable: number;
  bytes: number;
}

export interface OnlineCatalogRepository {
  upsertSong(input: UpsertOnlineSongInput): Promise<OnlineSongRecord>;
  upsertAsset(input: UpsertOnlineAssetInput): Promise<OnlineAssetRecord>;
  findAssetById(assetId: string): Promise<OnlineAssetRecord | null>;
  findAssetByProviderId(provider: string, providerAssetId: string): Promise<OnlineAssetRecord | null>;
  findAssetByCatalogSongId(catalogSongId: string): Promise<OnlineAssetRecord | null>;
  updateAsset(assetId: string, patch: UpdateOnlineAssetPatch): Promise<OnlineAssetRecord | null>;
  listAssets(limit: number): Promise<OnlineAssetRecord[]>;
  stats(): Promise<OnlineAssetStats>;
}

interface OnlineSongRow {
  id: string;
  provider: string;
  provider_song_id: string;
  title: string;
  primary_artist_name: string;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
}

interface OnlineAssetRow {
  id: string;
  song_id: string;
  provider: string;
  provider_asset_id: string;
  media_url: string;
  cache_path: string | null;
  catalog_song_id: string | null;
  status: OnlineAssetStatus;
  duration_ms: number | null;
  cache_bytes: string | number | null;
  audio_track_count: number | null;
  error_reason: string | null;
  metadata: Record<string, unknown>;
}

const assetSelect = `a.id, a.song_id, a.provider, a.provider_asset_id, a.media_url, a.cache_path, a.catalog_song_id,
            a.status, a.duration_ms, a.cache_bytes, a.audio_track_count, a.error_reason, a.metadata`;

export class PgOnlineCatalogRepository implements OnlineCatalogRepository {
  constructor(private readonly db: QueryExecutor) {}

  async upsertSong(input: UpsertOnlineSongInput): Promise<OnlineSongRecord> {
    const { pinyin, initials } = buildPinyinSearchKeys(input.title);
    const result = await this.db.query<OnlineSongRow>(
      `INSERT INTO online_songs (
         provider, provider_song_id, title, normalized_title, title_pinyin, title_initials,
         primary_artist_name, normalized_primary_artist_name, tags, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::jsonb)
       ON CONFLICT (provider, provider_song_id) DO UPDATE
       SET title = EXCLUDED.title,
           normalized_title = EXCLUDED.normalized_title,
           title_pinyin = EXCLUDED.title_pinyin,
           title_initials = EXCLUDED.title_initials,
           primary_artist_name = EXCLUDED.primary_artist_name,
           normalized_primary_artist_name = EXCLUDED.normalized_primary_artist_name,
           tags = EXCLUDED.tags,
           metadata = online_songs.metadata || EXCLUDED.metadata,
           updated_at = now()
       RETURNING id, provider, provider_song_id, title, primary_artist_name, duration_ms, metadata`,
      [
        input.provider,
        input.providerSongId,
        input.title,
        normalizeSearchText(input.title),
        pinyin,
        initials,
        input.artistName,
        normalizeSearchText(input.artistName),
        input.tags ?? [],
        JSON.stringify({ ...(input.metadata ?? {}), ...(input.durationMs ? { durationMs: input.durationMs } : {}) })
      ]
    );

    return mapSongRow(requireRow(result.rows[0], "online_songs"));
  }

  async upsertAsset(input: UpsertOnlineAssetInput): Promise<OnlineAssetRecord> {
    const result = await this.db.query<OnlineAssetRow>(
      `INSERT INTO online_song_assets (song_id, provider, provider_asset_id, media_url, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (provider, provider_asset_id) DO UPDATE
       SET media_url = EXCLUDED.media_url,
           metadata = online_song_assets.metadata || EXCLUDED.metadata,
           updated_at = now()
       RETURNING ${assetSelect.replaceAll("a.", "")}`,
      [input.songId, input.provider, input.providerAssetId, input.mediaUrl, JSON.stringify(input.metadata ?? {})]
    );

    return mapAssetRow(requireRow(result.rows[0], "online_song_assets"));
  }

  async findAssetById(assetId: string): Promise<OnlineAssetRecord | null> {
    const result = await this.db.query<OnlineAssetRow>(
      `SELECT ${assetSelect} FROM online_song_assets a WHERE a.id = $1 LIMIT 1`,
      [assetId]
    );
    const row = result.rows[0];
    return row ? mapAssetRow(row) : null;
  }

  async findAssetByProviderId(provider: string, providerAssetId: string): Promise<OnlineAssetRecord | null> {
    const result = await this.db.query<OnlineAssetRow>(
      `SELECT ${assetSelect}
       FROM online_song_assets a
       WHERE a.provider = $1 AND a.provider_asset_id = $2
       LIMIT 1`,
      [provider, providerAssetId]
    );
    const row = result.rows[0];
    return row ? mapAssetRow(row) : null;
  }

  async findAssetByCatalogSongId(catalogSongId: string): Promise<OnlineAssetRecord | null> {
    const result = await this.db.query<OnlineAssetRow>(
      `SELECT ${assetSelect}
       FROM online_song_assets a
       WHERE a.catalog_song_id = $1
       LIMIT 1`,
      [catalogSongId]
    );
    const row = result.rows[0];
    return row ? mapAssetRow(row) : null;
  }

  async updateAsset(assetId: string, patch: UpdateOnlineAssetPatch): Promise<OnlineAssetRecord | null> {
    const sets: string[] = ["updated_at = now()"];
    const values: unknown[] = [assetId];
    const push = (column: string, value: unknown, cast = ""): void => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };

    if (patch.status !== undefined) push("status", patch.status);
    if (patch.cachePath !== undefined) push("cache_path", patch.cachePath);
    if (patch.catalogSongId !== undefined) push("catalog_song_id", patch.catalogSongId);
    if (patch.mediaUrl !== undefined) push("media_url", patch.mediaUrl);
    if (patch.durationMs !== undefined) push("duration_ms", patch.durationMs);
    if (patch.cacheBytes !== undefined) push("cache_bytes", patch.cacheBytes);
    if (patch.audioTrackCount !== undefined) push("audio_track_count", patch.audioTrackCount);
    if (patch.errorReason !== undefined) push("error_reason", patch.errorReason);
    if (patch.lastResolvedAt !== undefined) push("last_resolved_at", patch.lastResolvedAt);
    if (patch.metadata !== undefined) push("metadata", JSON.stringify(patch.metadata), "::jsonb");

    const result = await this.db.query<OnlineAssetRow>(
      `UPDATE online_song_assets SET ${sets.join(", ")}
       WHERE id = $1
       RETURNING id, song_id, provider, provider_asset_id, media_url, cache_path, catalog_song_id,
                 status, duration_ms, cache_bytes, audio_track_count, error_reason, metadata`,
      values
    );
    const row = result.rows[0];
    return row ? mapAssetRow(row) : null;
  }

  async listAssets(limit: number): Promise<OnlineAssetRecord[]> {
    const result = await this.db.query<OnlineAssetRow>(
      `SELECT ${assetSelect}
       FROM online_song_assets a
       LEFT JOIN online_songs s ON s.id = a.song_id
       ORDER BY a.updated_at DESC
       LIMIT $1`,
      [Math.min(200, Math.max(1, Math.trunc(limit)))]
    );
    return result.rows.map(mapAssetRow);
  }

  async stats(): Promise<OnlineAssetStats> {
    const result = await this.db.query<{
      total: string | number;
      ready: string | number;
      caching: string | number;
      failed: string | number;
      unavailable: string | number;
      bytes: string | number | null;
    }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE status = 'ready') AS ready,
              count(*) FILTER (WHERE status = 'caching') AS caching,
              count(*) FILTER (WHERE status = 'failed') AS failed,
              count(*) FILTER (WHERE status = 'unavailable') AS unavailable,
              coalesce(sum(cache_bytes), 0) AS bytes
       FROM online_song_assets`
    );
    const row = result.rows[0];
    return {
      total: toNumber(row?.total),
      ready: toNumber(row?.ready),
      caching: toNumber(row?.caching),
      failed: toNumber(row?.failed),
      unavailable: toNumber(row?.unavailable),
      bytes: toNumber(row?.bytes)
    };
  }
}

export class InMemoryOnlineCatalogRepository implements OnlineCatalogRepository {
  private readonly songs = new Map<string, OnlineSongRecord>();
  private readonly assets = new Map<string, OnlineAssetRecord>();
  private sequence = 0;

  async upsertSong(input: UpsertOnlineSongInput): Promise<OnlineSongRecord> {
    const key = `${input.provider}:${input.providerSongId}`;
    const existing = this.songs.get(key);
    const record: OnlineSongRecord = {
      id: existing?.id ?? `online-song-${(this.sequence += 1)}`,
      provider: input.provider,
      providerSongId: input.providerSongId,
      title: input.title,
      artistName: input.artistName,
      durationMs: input.durationMs ?? null,
      metadata: { ...(existing?.metadata ?? {}), ...(input.metadata ?? {}) }
    };
    this.songs.set(key, record);
    return record;
  }

  async upsertAsset(input: UpsertOnlineAssetInput): Promise<OnlineAssetRecord> {
    const key = `${input.provider}:${input.providerAssetId}`;
    const existing = this.assets.get(key);
    const record: OnlineAssetRecord = {
      id: existing?.id ?? `online-asset-${(this.sequence += 1)}`,
      songId: input.songId,
      provider: input.provider,
      providerAssetId: input.providerAssetId,
      mediaUrl: input.mediaUrl,
      cachePath: existing?.cachePath ?? null,
      catalogSongId: existing?.catalogSongId ?? null,
      status: existing?.status ?? "caching",
      durationMs: existing?.durationMs ?? null,
      cacheBytes: existing?.cacheBytes ?? null,
      audioTrackCount: existing?.audioTrackCount ?? null,
      errorReason: existing?.errorReason ?? null,
      metadata: { ...(existing?.metadata ?? {}), ...(input.metadata ?? {}) }
    };
    this.assets.set(key, record);
    return record;
  }

  async findAssetById(assetId: string): Promise<OnlineAssetRecord | null> {
    return [...this.assets.values()].find((asset) => asset.id === assetId) ?? null;
  }

  async findAssetByProviderId(provider: string, providerAssetId: string): Promise<OnlineAssetRecord | null> {
    return this.assets.get(`${provider}:${providerAssetId}`) ?? null;
  }

  async findAssetByCatalogSongId(catalogSongId: string): Promise<OnlineAssetRecord | null> {
    return [...this.assets.values()].find((asset) => asset.catalogSongId === catalogSongId) ?? null;
  }

  async updateAsset(assetId: string, patch: UpdateOnlineAssetPatch): Promise<OnlineAssetRecord | null> {
    const entry = [...this.assets.entries()].find(([, asset]) => asset.id === assetId);
    if (!entry) {
      return null;
    }
    const [key, asset] = entry;
    const updated: OnlineAssetRecord = {
      ...asset,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.cachePath !== undefined ? { cachePath: patch.cachePath } : {}),
      ...(patch.catalogSongId !== undefined ? { catalogSongId: patch.catalogSongId } : {}),
      ...(patch.mediaUrl !== undefined ? { mediaUrl: patch.mediaUrl } : {}),
      ...(patch.durationMs !== undefined ? { durationMs: patch.durationMs } : {}),
      ...(patch.cacheBytes !== undefined ? { cacheBytes: patch.cacheBytes } : {}),
      ...(patch.audioTrackCount !== undefined ? { audioTrackCount: patch.audioTrackCount } : {}),
      ...(patch.errorReason !== undefined ? { errorReason: patch.errorReason } : {}),
      ...(patch.metadata !== undefined ? { metadata: { ...asset.metadata, ...patch.metadata } } : {})
    };
    this.assets.set(key, updated);
    return updated;
  }

  async listAssets(limit: number): Promise<OnlineAssetRecord[]> {
    return [...this.assets.values()].slice(0, Math.max(1, limit));
  }

  async stats(): Promise<OnlineAssetStats> {
    const assets = [...this.assets.values()];
    return {
      total: assets.length,
      ready: assets.filter((asset) => asset.status === "ready").length,
      caching: assets.filter((asset) => asset.status === "caching").length,
      failed: assets.filter((asset) => asset.status === "failed").length,
      unavailable: assets.filter((asset) => asset.status === "unavailable").length,
      bytes: assets.reduce((sum, asset) => sum + (asset.cacheBytes ?? 0), 0)
    };
  }
}

function mapSongRow(row: OnlineSongRow): OnlineSongRecord {
  return {
    id: row.id,
    provider: row.provider,
    providerSongId: row.provider_song_id,
    title: row.title,
    artistName: row.primary_artist_name,
    durationMs: row.duration_ms,
    metadata: row.metadata ?? {}
  };
}

function mapAssetRow(row: OnlineAssetRow): OnlineAssetRecord {
  return {
    id: row.id,
    songId: row.song_id,
    provider: row.provider,
    providerAssetId: row.provider_asset_id,
    mediaUrl: row.media_url,
    cachePath: row.cache_path,
    catalogSongId: row.catalog_song_id,
    status: row.status,
    durationMs: row.duration_ms,
    cacheBytes: row.cache_bytes === null ? null : toNumber(row.cache_bytes),
    audioTrackCount: row.audio_track_count,
    errorReason: row.error_reason,
    metadata: row.metadata ?? {}
  };
}

function requireRow<TRow>(row: TRow | undefined, table: string): TRow {
  if (!row) {
    throw new Error(`${table} upsert did not return a row`);
  }
  return row;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
