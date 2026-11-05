import type { FastifyInstance } from "fastify";
import type {
  EntityId,
  QueueEntry,
  SongDiscoveryArtist,
  SongDiscoveryGenre,
  SongDiscoveryResponse,
  SongDiscoverySongsResponse,
  SongDiscoverySong,
  SongId,
  SongSearchIndexedResult
} from "@home-ktv/domain";
import { songCoverKey } from "../modules/covers/types.js";
import type { SongCoverRepository } from "../modules/covers/song-cover-repository.js";
import type { KtvIndexReadRepository } from "../modules/ktv-index/ktv-index-read-repository.js";
import type { OnlineCatalogCandidate } from "../modules/online/igeba/igeba-provider.js";
import type { OnlineImportService } from "../modules/online/online-import-service.js";
import type { QueueEntryRepository } from "../modules/playback/repositories/queue-entry-repository.js";
import type { RoomRepository } from "../modules/rooms/repositories/room-repository.js";

export interface SongDiscoveryRouteDependencies {
  rooms: RoomRepository;
  queueEntries: QueueEntryRepository;
  ktvIndex?: Pick<
    KtvIndexReadRepository,
    "searchIndexedSongs" | "listDiscoveryArtists" | "listDiscoveryGenres" | "listIndexedSongsByArtist" | "listIndexedSongsByGenre"
  >;
  songCovers?: Pick<SongCoverRepository, "findBySongKeys">;
  onlineDiscovery?: Pick<
    OnlineImportService,
    | "discoverySingers"
    | "discoverySingerPage"
    | "discoveryStyles"
    | "songsBySinger"
    | "songsByStyle"
    | "recommendedSongs"
  >;
}

interface SongDiscoveryQuery {
  seed?: string;
  limit?: string | number;
}

interface SongDiscoverySongsQuery {
  limit?: string | number;
  offset?: string | number;
}

export async function registerSongDiscoveryRoutes(
  server: FastifyInstance,
  dependencies: SongDiscoveryRouteDependencies
): Promise<void> {
  server.get<{ Params: { roomSlug: string }; Querystring: SongDiscoveryQuery }>(
    "/rooms/:roomSlug/songs/discovery",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const seed = String(request.query.seed ?? Date.now());
      const limit = parseLimit(request.query.limit);
      const queue = await dependencies.queueEntries.listEffectiveQueue(room.id);
      const queuedAssetIds = queuedNasAssetIds(queue);
      const [songs, fullArtists, fullGenres] = await Promise.all([
        listNasDiscoverySongs({
          dependencies,
          queuedAssetIds
        }),
        listFullArtistModules(dependencies),
        listFullGenreModules(dependencies)
      ]);
      const songsWithCovers = await attachCoverImageUrls(songs, dependencies.songCovers);
      const weightedRecommendations = selectWeightedSongs(songsWithCovers, limit, seed);
      const onlineRecommended = await loadOnlineRecommendations(dependencies, limit);
      const onlineArtists = await loadOnlineArtists(dependencies);
      const onlineGenres = await loadOnlineGenres(dependencies);
      const artists = onlineArtists ?? fullArtists ?? buildArtistModules(songsWithCovers);
      // igeba 只有 10 个曲风，本地曲库里还标了不少细分标签，两者合并去重，
      // 顺序保留 igeba 的原始分类，本地独有的接在后面。
      const genres = mergeGenreModules(onlineGenres, fullGenres, buildGenreModules(songsWithCovers));

      const response: SongDiscoveryResponse = {
        seed,
        recommended:
          onlineRecommended ??
          surfaceCoveredSongs(weightedRecommendations, songsWithCovers, limit, seed),
        artists,
        genres
      };

      await reply.send(response);
    }
  );

  /** 歌手点歌列表分页：首屏之外下滑继续取热门歌手。 */
  server.get<{ Params: { roomSlug: string }; Querystring: SongDiscoverySongsQuery }>(
    "/rooms/:roomSlug/songs/discovery/artists",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const pageSize = Math.min(50, Math.max(1, parseSongsLimit(request.query.limit)));
      const offset = parseOffset(request.query.offset);
      if (!dependencies.onlineDiscovery?.discoverySingerPage) {
        await reply.send({ artists: [], nextOffset: null });
        return;
      }

      try {
        const page = Math.floor(offset / pageSize) + 1;
        const result = await dependencies.onlineDiscovery.discoverySingerPage({ page, pageSize });
        const artists: SongDiscoveryArtist[] = result.singers.map((singer) => ({
          artistId: singer.singerId as EntityId,
          artistName: singer.singerName,
          songCount: 0,
          songs: []
        }));
        const loaded = page * pageSize;
        const nextOffset = loaded < result.pageCount * pageSize ? loaded : null;
        await reply.send({ artists, nextOffset });
      } catch {
        await reply.code(502).send({ code: "DISCOVERY_ARTISTS_FAILED" });
      }
    }
  );

  server.get<{ Params: { roomSlug: string; artistId: string }; Querystring: SongDiscoverySongsQuery }>(
    "/rooms/:roomSlug/songs/discovery/artists/:artistId/songs",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const page = parseSongsPage(request.query);
      const online = await loadOnlineSongsBySinger(dependencies, request.params.artistId, page);
      if (online) {
        await reply.send(online);
        return;
      }

      if (!dependencies.ktvIndex?.listIndexedSongsByArtist) {
        await reply.send(emptySongsPage());
        return;
      }

      const queue = await dependencies.queueEntries.listEffectiveQueue(room.id);
      const records = await dependencies.ktvIndex.listIndexedSongsByArtist({
        artistId: request.params.artistId,
        limit: page.limit,
        offset: page.offset,
        queuedIndexedAssetIds: queuedNasAssetIds(queue),
        unreadableIndexedAssetIds: []
      });
      const songs = await songsFromIndexedRecords(records, dependencies);
      const response: SongDiscoverySongsResponse = {
        songs: await attachCoverImageUrls(songs, dependencies.songCovers),
        nextOffset: records.length >= page.limit ? page.offset + songs.length : null
      };
      await reply.send(response);
    }
  );

  server.get<{ Params: { roomSlug: string }; Querystring: SongDiscoverySongsQuery & { genre?: string } }>(
    "/rooms/:roomSlug/songs/discovery/genres/songs",
    async (request, reply) => {
      const room = await dependencies.rooms.findBySlug(request.params.roomSlug);
      if (!room) {
        await reply.code(404).send({ code: "ROOM_NOT_FOUND" });
        return;
      }

      const genre = String(request.query.genre ?? "").trim();
      if (!genre) {
        await reply.send(emptySongsPage());
        return;
      }

      const page = parseSongsPage(request.query);
      const online = await loadOnlineSongsByStyle(dependencies, genre, page);
      if (online) {
        await reply.send(online);
        return;
      }

      if (!dependencies.ktvIndex?.listIndexedSongsByGenre) {
        await reply.send(emptySongsPage());
        return;
      }

      const queue = await dependencies.queueEntries.listEffectiveQueue(room.id);
      const records = await dependencies.ktvIndex.listIndexedSongsByGenre({
        genre,
        limit: page.limit,
        offset: page.offset,
        queuedIndexedAssetIds: queuedNasAssetIds(queue),
        unreadableIndexedAssetIds: []
      });
      const songs = await songsFromIndexedRecords(records, dependencies);
      const response: SongDiscoverySongsResponse = {
        songs: await attachCoverImageUrls(songs, dependencies.songCovers),
        nextOffset: records.length >= page.limit ? page.offset + songs.length : null
      };
      await reply.send(response);
    }
  );
}

async function loadOnlineRecommendations(
  dependencies: SongDiscoveryRouteDependencies,
  limit: number
): Promise<SongDiscoverySong[] | null> {
  if (!dependencies.onlineDiscovery) {
    return null;
  }
  try {
    const candidates = await dependencies.onlineDiscovery.recommendedSongs(Math.min(30, limit));
    if (candidates.length === 0) {
      return null;
    }
    return candidates.map((candidate) =>
      onlineDiscoverySong(candidate, { artistId: candidate.artistName, genre: [] })
    );
  } catch {
    return null;
  }
}

async function loadOnlineArtists(
  dependencies: SongDiscoveryRouteDependencies
): Promise<SongDiscoveryArtist[] | null> {
  if (!dependencies.onlineDiscovery) {
    return null;
  }
  try {
    const singers = await dependencies.onlineDiscovery.discoverySingers(16);
    if (singers.length === 0) {
      return null;
    }
    return singers.map((singer) => ({
      artistId: singer.singerId as EntityId,
      artistName: singer.singerName,
      songCount: 0,
      songs: []
    }));
  } catch {
    return null;
  }
}

async function loadOnlineGenres(
  dependencies: SongDiscoveryRouteDependencies
): Promise<SongDiscoveryGenre[] | null> {
  if (!dependencies.onlineDiscovery) {
    return null;
  }
  try {
    const styles = await dependencies.onlineDiscovery.discoveryStyles();
    if (styles.length === 0) {
      return null;
    }
    return styles.map((style) => ({ genre: style, songCount: 0, songs: [] }));
  } catch {
    return null;
  }
}

async function loadOnlineSongsBySinger(
  dependencies: SongDiscoveryRouteDependencies,
  singerId: string,
  page: { limit: number; offset: number }
): Promise<SongDiscoverySongsResponse | null> {
  if (!dependencies.onlineDiscovery) {
    return null;
  }
  try {
    const pageSize = Math.min(50, page.limit);
    const result = await dependencies.onlineDiscovery.songsBySinger({
      singerId,
      page: Math.floor(page.offset / pageSize) + 1,
      pageSize
    });
    if (!result) {
      return null;
    }
    return onlineSongsPage(result, { artistId: singerId, genre: [] }, page);
  } catch {
    return null;
  }
}

async function loadOnlineSongsByStyle(
  dependencies: SongDiscoveryRouteDependencies,
  style: string,
  page: { limit: number; offset: number }
): Promise<SongDiscoverySongsResponse | null> {
  if (!dependencies.onlineDiscovery) {
    return null;
  }
  try {
    const pageSize = Math.min(50, page.limit);
    const result = await dependencies.onlineDiscovery.songsByStyle({
      style,
      page: Math.floor(page.offset / pageSize) + 1,
      pageSize
    });
    if (!result) {
      return null;
    }
    return onlineSongsPage(result, { artistId: "", genre: [style] }, page);
  } catch {
    return null;
  }
}

function onlineSongsPage(
  result: { candidates: readonly OnlineCatalogCandidate[]; pageCount: number },
  context: { artistId: string; genre: readonly string[] },
  page: { limit: number; offset: number }
): SongDiscoverySongsResponse {
  const songs = result.candidates.map((candidate) => onlineDiscoverySong(candidate, context));
  const pageNo = Math.floor(page.offset / Math.min(50, page.limit)) + 1;
  return {
    songs,
    nextOffset: songs.length > 0 && pageNo < Math.max(1, result.pageCount) ? page.offset + songs.length : null
  };
}

function onlineDiscoverySong(
  candidate: OnlineCatalogCandidate,
  context: { artistId: string; genre: readonly string[] }
): SongDiscoverySong {
  return {
    source: "online",
    songId: `online:${candidate.provider}:${candidate.providerSongId}` as SongId,
    providerSongNumber: candidate.providerSongId,
    title: candidate.title,
    artistName: candidate.artistName,
    language: "other",
    matchReason: "default",
    queueState: "not_queued",
    artistId: (context.artistId || candidate.artistName) as EntityId,
    genre: context.genre,
    playCount: 0,
    recommendationWeight: 0,
    versions: []
  };
}

async function attachCoverImageUrls(
  songs: readonly SongDiscoverySong[],
  songCovers: Pick<SongCoverRepository, "findBySongKeys"> | undefined
): Promise<SongDiscoverySong[]> {
  if (!songCovers || songs.length === 0) {
    return [...songs];
  }

  const keys = songs.map((song) => ({
    source: song.source,
    sourceSongId: discoverySourceSongId(song)
  }));
  const covers = await songCovers.findBySongKeys(keys);

  return songs.map((song) => {
    const cover = covers.get(
      songCoverKey({
        source: song.source,
        sourceSongId: discoverySourceSongId(song)
      })
    );
    return cover?.imageUrl
      ? {
          ...song,
          coverImageUrl: cover.imageUrl,
          ...(cover.thumbnailImageUrl ? { coverThumbnailUrl: cover.thumbnailImageUrl } : {})
        }
      : song;
  });
}

function parseLimit(rawLimit: string | number | undefined): number {
  const parsedLimit =
    typeof rawLimit === "number" ? Math.trunc(rawLimit) : Number.parseInt(String(rawLimit ?? ""), 10);
  return Math.min(30, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 30));
}

function parseSongsPage(query: SongDiscoverySongsQuery): { limit: number; offset: number } {
  return {
    limit: parseSongsLimit(query.limit),
    offset: parseOffset(query.offset)
  };
}

function parseSongsLimit(rawLimit: string | number | undefined): number {
  const parsedLimit =
    typeof rawLimit === "number" ? Math.trunc(rawLimit) : Number.parseInt(String(rawLimit ?? ""), 10);
  return Math.min(100, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 60));
}

function parseOffset(rawOffset: string | number | undefined): number {
  const parsedOffset =
    typeof rawOffset === "number" ? Math.trunc(rawOffset) : Number.parseInt(String(rawOffset ?? ""), 10);
  return Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);
}

function queuedNasAssetIds(queue: readonly QueueEntry[]): string[] {
  return queue
    .filter((entry) => (entry.source?.sourceType ?? "nas") === "nas")
    .map((entry) => entry.source?.assetId ?? entry.assetId);
}

function emptySongsPage(): SongDiscoverySongsResponse {
  return { songs: [], nextOffset: null };
}

async function listNasDiscoverySongs(input: {
  dependencies: SongDiscoveryRouteDependencies;
  queuedAssetIds: readonly string[];
}): Promise<SongDiscoverySong[]> {
  if (!input.dependencies.ktvIndex) {
    return [];
  }

  const records = await input.dependencies.ktvIndex.searchIndexedSongs({
    query: "",
    limit: 500,
    shuffle: true,
    versionsPerSong: 1,
    queuedIndexedAssetIds: input.queuedAssetIds,
    unreadableIndexedAssetIds: []
  });

  const songIds = records.map((record) => record.indexedSongId as SongId);
  const requestCounts = (await input.dependencies.queueEntries.listGlobalSongRequestCounts?.(songIds)) ?? new Map<SongId, number>();
  return records.map((record) => nasDiscoverySong(record, requestCounts.get(record.indexedSongId as SongId) ?? 0));
}

async function songsFromIndexedRecords(
  records: readonly SongSearchIndexedResult[],
  dependencies: SongDiscoveryRouteDependencies
): Promise<SongDiscoverySong[]> {
  const songIds = records.map((record) => record.indexedSongId as SongId);
  const requestCounts = (await dependencies.queueEntries.listGlobalSongRequestCounts?.(songIds)) ?? new Map<SongId, number>();
  return records.map((record) => nasDiscoverySong(record, requestCounts.get(record.indexedSongId as SongId) ?? 0));
}

async function listFullArtistModules(
  dependencies: SongDiscoveryRouteDependencies
): Promise<SongDiscoveryArtist[] | null> {
  const artists = await dependencies.ktvIndex?.listDiscoveryArtists?.();
  if (!artists) {
    return null;
  }

  return [...artists]
    .sort(
      (left, right) =>
        right.songCount - left.songCount || right.playCount - left.playCount || left.artistName.localeCompare(right.artistName)
    )
    .map((artist) => ({
      artistId: artist.artistId,
      artistName: artist.artistName,
      songCount: artist.songCount,
      songs: []
    }));
}

async function listFullGenreModules(
  dependencies: SongDiscoveryRouteDependencies
): Promise<SongDiscoveryGenre[] | null> {
  const genres = await dependencies.ktvIndex?.listDiscoveryGenres?.();
  if (!genres) {
    return null;
  }

  return [...genres]
    .sort(
      (left, right) =>
        right.songCount - left.songCount || right.playCount - left.playCount || left.genre.localeCompare(right.genre)
    )
    .map((genre) => ({
      genre: genre.genre,
      songCount: genre.songCount,
      songs: []
    }));
}

function nasDiscoverySong(record: SongSearchIndexedResult, playCount: number): SongDiscoverySong {
  const genre = nasGenre(record);
  return {
    source: "nas",
    songId: record.indexedSongId,
    title: record.title,
    artistId: nasArtistId(record.artistName),
    artistName: record.artistName,
    language: "mandarin",
    genre,
    matchReason: record.matchReason === "style" ? "default" : record.matchReason,
    queueState: record.versions.some((version) => version.queueState === "queued") ? "queued" : "not_queued",
    versions: record.versions.map((version) => ({
      assetId: version.indexedAssetId,
      displayName: version.displayName,
      sourceLabel: "NAS曲库",
      extension: version.extension,
      sizeBytes: version.sizeBytes,
      audioTrackCount: version.audioTrackCount,
      ...(version.styleTags ? { styleTags: version.styleTags } : {}),
      category: version.category,
      queueState: version.queueState,
      canQueue: version.canQueue,
      disabledLabel: version.disabledLabel
    })),
    playCount,
    recommendationWeight: nasRecommendationWeight(playCount)
  };
}

function nasRecommendationWeight(playCount: number): number {
  return 1 + playCount * 4;
}

function discoverySourceSongId(song: SongDiscoverySong): string {
  return song.songId;
}

function nasArtistId(artistName: string): string {
  const normalized = artistName
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return `nas-artist-${normalized || "unknown"}`;
}

function nasGenre(record: SongSearchIndexedResult): string[] {
  const tags = record.styleTags?.filter((tag) => tag.trim().length > 0) ?? [];
  return tags.length > 0 ? tags : [record.category || "未打标签"];
}

function selectWeightedSongs(songs: readonly SongDiscoverySong[], limit: number, seed: string): SongDiscoverySong[] {
  const remaining = [...songs];
  const selected: SongDiscoverySong[] = [];
  const random = seededRandom(seed);

  while (remaining.length > 0 && selected.length < limit) {
    const totalWeight = remaining.reduce((total, song) => total + song.recommendationWeight, 0);
    let cursor = random() * totalWeight;
    let selectedIndex = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      cursor -= remaining[index]!.recommendationWeight;
      if (cursor <= 0) {
        selectedIndex = index;
        break;
      }
    }
    selected.push(remaining.splice(selectedIndex, 1)[0]!);
  }

  return selected;
}

function surfaceCoveredSongs(
  selected: readonly SongDiscoverySong[],
  candidates: readonly SongDiscoverySong[],
  limit: number,
  seed: string
): SongDiscoverySong[] {
  const targetCoverCount = Math.min(6, limit, candidates.filter(hasCoverImage).length);
  const currentCoverCount = selected.filter(hasCoverImage).length;
  if (currentCoverCount >= targetCoverCount) {
    return [...selected];
  }

  const selectedIds = new Set(selected.map((song) => song.songId));
  const additionalCoveredSongs = selectWeightedSongs(
    candidates.filter((song) => hasCoverImage(song) && !selectedIds.has(song.songId)),
    targetCoverCount - currentCoverCount,
    `${seed}:covers`
  );
  if (additionalCoveredSongs.length === 0) {
    return [...selected];
  }

  const selectedWithReplacementSlots = [...selected];
  const promotedSongs: SongDiscoverySong[] = [];
  for (const coveredSong of additionalCoveredSongs) {
    const replacementIndex = lastUncoveredSongIndex(selectedWithReplacementSlots);
    if (replacementIndex < 0) {
      break;
    }
    selectedWithReplacementSlots.splice(replacementIndex, 1);
    promotedSongs.push(coveredSong);
  }

  if (promotedSongs.length === 0) {
    return [...selected];
  }

  return [...promotedSongs, ...selectedWithReplacementSlots].slice(0, limit);
}

function hasCoverImage(song: SongDiscoverySong): boolean {
  return typeof song.coverImageUrl === "string" && song.coverImageUrl.length > 0;
}

function lastUncoveredSongIndex(songs: readonly SongDiscoverySong[]): number {
  for (let index = songs.length - 1; index >= 0; index -= 1) {
    if (!hasCoverImage(songs[index]!)) {
      return index;
    }
  }
  return -1;
}

function mergeGenreModules(
  ...sources: ReadonlyArray<readonly SongDiscoveryGenre[] | null>
): SongDiscoveryGenre[] {
  const merged: SongDiscoveryGenre[] = [];
  const seen = new Set<string>();
  for (const list of sources) {
    for (const genre of list ?? []) {
      for (const name of splitGenreNames(genre.genre)) {
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);
        merged.push({ genre: name, songCount: genre.songCount, songs: [] });
      }
    }
  }
  return merged;
}

/**
 * 本地曲库的 style_tags 里混着「思恋;伤感」这种复合标签和「未打标签」这类占位值，
 * 直接当分类列出来没法点。拆成单个标签，丢掉占位值。
 */
function splitGenreNames(raw: string): string[] {
  return raw
    .split(/[;；、,，/|]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "未打标签" && part !== "未知");
}

function buildArtistModules(songs: readonly SongDiscoverySong[]): SongDiscoveryArtist[] {
  const byArtist = new Map<string, { artistId: string; artistName: string; songs: SongDiscoverySong[]; playCount: number }>();
  for (const song of songs) {
    const artistId = songArtistId(song);
    const record = byArtist.get(artistId) ?? {
      artistId,
      artistName: song.artistName,
      songs: [],
      playCount: 0
    };
    record.songs.push(song);
    record.playCount += song.playCount;
    byArtist.set(artistId, record);
  }

  return [...byArtist.values()]
    .sort(
      (left, right) =>
        right.songs.length - left.songs.length || right.playCount - left.playCount || left.artistName.localeCompare(right.artistName)
    )
    .map((artist) => ({
      artistId: artist.artistId,
      artistName: artist.artistName,
      songCount: artist.songs.length,
      songs: artist.songs.sort(compareDiscoverySongs)
    }));
}

function buildGenreModules(songs: readonly SongDiscoverySong[]): SongDiscoveryGenre[] {
  const byGenre = new Map<string, { genre: string; songs: SongDiscoverySong[]; playCount: number }>();
  for (const song of songs) {
    for (const genre of song.genre.length > 0 ? song.genre : ["其他"]) {
      const record = byGenre.get(genre) ?? { genre, songs: [], playCount: 0 };
      record.songs.push(song);
      record.playCount += song.playCount;
      byGenre.set(genre, record);
    }
  }

  return [...byGenre.values()]
    .sort(
      (left, right) =>
        right.songs.length - left.songs.length || right.playCount - left.playCount || left.genre.localeCompare(right.genre)
    )
    .map((genre) => ({
      genre: genre.genre,
      songCount: genre.songs.length,
      songs: genre.songs.sort(compareDiscoverySongs)
    }));
}

function compareDiscoverySongs(left: SongDiscoverySong, right: SongDiscoverySong): number {
  return right.playCount - left.playCount || right.recommendationWeight - left.recommendationWeight || left.title.localeCompare(right.title);
}

function songArtistId(song: SongDiscoverySong): string {
  return song.artistId;
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
