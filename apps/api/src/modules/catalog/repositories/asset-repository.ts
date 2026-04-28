import type {
  Asset,
  AssetId,
  AssetKind,
  AssetSourceType,
  AssetStatus,
  LyricMode,
  SongId,
  SwitchFamily,
  SwitchQualityStatus,
  VocalMode
} from "@home-ktv/domain";
import type { QueryExecutor } from "../../../db/query-executor.js";
import type { AssetRow } from "../../../db/schema.js";

export interface AssetRepository {
  findById(assetId: AssetId): Promise<Asset | null>;
  findVerifiedSwitchCounterparts(asset: Asset): Promise<Asset[]>;
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

export function mapAssetRow(row: AssetRow): Asset {
  return {
    id: row.id,
    songId: row.song_id as SongId,
    sourceType: row.source_type as AssetSourceType,
    assetKind: row.asset_kind as AssetKind,
    displayName: row.display_name,
    filePath: row.file_path,
    durationMs: row.duration_ms,
    lyricMode: row.lyric_mode as LyricMode,
    vocalMode: row.vocal_mode as VocalMode,
    status: row.status as AssetStatus,
    switchFamily: row.switch_family as SwitchFamily | null,
    switchQualityStatus: row.switch_quality_status as SwitchQualityStatus,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  };
}

export class PgAssetRepository implements AssetRepository {
  constructor(private readonly db: QueryExecutor) {}

  async findById(assetId: AssetId): Promise<Asset | null> {
    const result = await this.db.query<AssetRow>(
      `SELECT id, song_id, source_type, asset_kind, display_name, file_path, duration_ms,
              lyric_mode, vocal_mode, status, switch_family, switch_quality_status,
              created_at, updated_at
       FROM assets
       WHERE id = $1
       LIMIT 1`,
      [assetId]
    );

    const row = result.rows[0];
    return row ? mapAssetRow(row) : null;
  }

  async findVerifiedSwitchCounterparts(asset: Asset): Promise<Asset[]> {
    if (!asset.switchFamily) {
      return [];
    }

    const result = await this.db.query<AssetRow>(
      `SELECT id, song_id, source_type, asset_kind, display_name, file_path, duration_ms,
              lyric_mode, vocal_mode, status, switch_family, switch_quality_status,
              created_at, updated_at
       FROM assets
       WHERE song_id = $1
         AND switch_family = $2
         AND vocal_mode <> $3
         AND status = 'ready'
         AND switch_quality_status = 'verified'
       ORDER BY created_at ASC`,
      [asset.songId, asset.switchFamily, asset.vocalMode]
    );

    return result.rows.map(mapAssetRow);
  }
}
