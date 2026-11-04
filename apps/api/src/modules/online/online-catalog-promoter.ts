import type { QueryExecutor } from "../../db/query-executor.js";
import { buildPinyinSearchKeys, normalizeSearchText } from "../catalog/search-normalization.js";

export interface PromoteOnlineSongInput {
  provider: string;
  providerSongId: string;
  title: string;
  artistName: string;
  cachePath: string;
  fileName: string;
  extension: string;
  sizeBytes: number;
  styleTags?: readonly string[];
  audioTrackCount?: number | null;
  technicalStatus?: "probed" | "pending" | "failed";
  technicalMetadata?: Record<string, unknown>;
}

export interface OnlineCatalogPromoter {
  promote(input: PromoteOnlineSongInput): Promise<{ songId: string }>;
  /** 淘汰缓存时移除对应的本地曲库条目。 */
  demote(catalogSongId: string): Promise<void>;
}

export const ONLINE_SOURCE_ROOT_PREFIX = "online:";

export function onlineCatalogSongId(provider: string, providerSongId: string): string {
  return `ktv-online-${provider}-${providerSongId.replace(/[^A-Za-z0-9_-]/gu, "")}`;
}

/**
 * 把已缓存的在线歌曲提升为本地曲库条目（ktv_songs 在 0021 之后是「歌曲 + 文件」扁平表）。
 * 提升之后：搜索、点歌队列、播放链路全部复用现有 NAS 流程，不需要改状态机。
 */
export class PgOnlineCatalogPromoter implements OnlineCatalogPromoter {
  constructor(private readonly db: QueryExecutor) {}

  async promote(input: PromoteOnlineSongInput): Promise<{ songId: string }> {
    const songId = onlineCatalogSongId(input.provider, input.providerSongId);
    const { pinyin, initials } = buildPinyinSearchKeys(input.title);
    const artistNames = input.artistName
      .split(/[/、,，&]/u)
      .map((name) => name.trim())
      .filter(Boolean);

    const technicalMetadata = withAudioTracks(
      input.technicalMetadata ?? {},
      input.audioTrackCount ?? null,
      input.sizeBytes,
      input.extension,
      input.cachePath
    );

    await this.db.query(
      `INSERT INTO ktv_songs (
         id, title, normalized_title, title_pinyin, title_initials,
         primary_artist_name, normalized_primary_artist_name, artist_names, style_tags,
         file_path, relative_path, file_name, extension, size_bytes, mtime_ms,
         parse_strategy, parse_confidence, technical_status, technical_metadata,
         source_root, request_count
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[],
               $10, $11, $12, $13, $14, $15, 'fallback', 1.0, $16, $17::jsonb, $18, 0)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           normalized_title = EXCLUDED.normalized_title,
           title_pinyin = EXCLUDED.title_pinyin,
           title_initials = EXCLUDED.title_initials,
           primary_artist_name = EXCLUDED.primary_artist_name,
           normalized_primary_artist_name = EXCLUDED.normalized_primary_artist_name,
           artist_names = EXCLUDED.artist_names,
           style_tags = EXCLUDED.style_tags,
           file_path = EXCLUDED.file_path,
           relative_path = EXCLUDED.relative_path,
           file_name = EXCLUDED.file_name,
           extension = EXCLUDED.extension,
           size_bytes = EXCLUDED.size_bytes,
           mtime_ms = EXCLUDED.mtime_ms,
           technical_status = EXCLUDED.technical_status,
           technical_metadata = EXCLUDED.technical_metadata,
           missing_at = NULL,
           updated_at = now()`,
      [
        songId,
        input.title,
        normalizeSearchText(input.title),
        pinyin,
        initials,
        input.artistName,
        normalizeSearchText(input.artistName),
        artistNames,
        input.styleTags ?? [],
        input.cachePath,
        `online-cache/${input.provider}/${input.fileName}`,
        input.fileName,
        input.extension,
        input.sizeBytes,
        Date.now(),
        input.technicalStatus ?? "pending",
        JSON.stringify({
          ...technicalMetadata,
          onlineSource: {
            provider: input.provider,
            providerSongId: input.providerSongId
          }
        }),
        `${ONLINE_SOURCE_ROOT_PREFIX}${input.provider}`
      ]
    );

    return { songId };
  }

  async demote(catalogSongId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM ktv_songs
       WHERE id = $1
         AND source_root LIKE '${ONLINE_SOURCE_ROOT_PREFIX}%'`,
      [catalogSongId]
    );
  }
}

function withAudioTracks(
  metadata: Record<string, unknown>,
  audioTrackCount: number | null,
  sizeBytes: number,
  extension: string,
  cachePath: string
): Record<string, unknown> {
  const existing = metadata.mediaInfoSummary;
  if (existing && typeof existing === "object") {
    return metadata;
  }

  const count = audioTrackCount ?? 0;
  return {
    ...metadata,
    mediaInfoSummary: {
      container: extension.replace(/^\./u, "") || null,
      durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : null,
      videoCodec: null,
      resolution: null,
      fileSizeBytes: sizeBytes,
      audioTracks: Array.from({ length: count }, (_, index) => ({
        index,
        id: `audio-${index}`,
        label: index === 0 ? "原唱/伴唱" : `Audio ${index + 1}`,
        language: null,
        codec: null,
        channels: null
      }))
    },
    mediaInfoProvenance: {
      source: "online-cache",
      sourceVersion: null,
      probedAt: new Date().toISOString(),
      importedFrom: cachePath
    }
  };
}

export class InMemoryOnlineCatalogPromoter implements OnlineCatalogPromoter {
  readonly promoted: PromoteOnlineSongInput[] = [];
  readonly demoted: string[] = [];

  async promote(input: PromoteOnlineSongInput): Promise<{ songId: string }> {
    this.promoted.push(input);
    return { songId: onlineCatalogSongId(input.provider, input.providerSongId) };
  }

  async demote(catalogSongId: string): Promise<void> {
    this.demoted.push(catalogSongId);
  }
}
