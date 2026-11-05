import type { IgebaClient, IgebaHealth, IgebaHotModule, IgebaSong, IgebaSongAddress } from "./igeba-client.js";

export interface OnlineCatalogCandidate {
  provider: string;
  providerSongId: string;
  title: string;
  artistName: string;
  durationMs: number | null;
  language: string;
  coverUrl: string | null;
  sourceLabel: string;
  tags: readonly string[];
  metadata: Record<string, unknown>;
}

export interface OnlineCatalogProvider {
  readonly id: string;
  readonly sourceLabel: string;
  search(keyword: string, limit: number): Promise<OnlineCatalogCandidate[]>;
  resolve(providerSongId: string): Promise<IgebaSongAddress>;
  download?(providerSongId: string, targetPath: string): Promise<{ bytes: number; songNumber: string }>;
  hotModules?(): Promise<IgebaHotModule[]>;
  discoverySingers?(limit: number): Promise<Array<{
    singerId: string;
    singerName: string;
    mark: string;
    pictureUrl: string | null;
  }>>;
  /** 分页取热门歌手：歌手点歌列表下滑加载用。 */
  discoverySingerPage?(input: {
    page: number;
    pageSize: number;
  }): Promise<{
    singers: Array<{ singerId: string; singerName: string; mark: string; pictureUrl: string | null }>;
    pageCount: number;
  }>;
  discoveryStyles?(): Promise<string[]>;
  recommendedSongs?(limit: number): Promise<OnlineCatalogCandidate[]>;
  songsBySinger?(input: {
    singerId: string;
    page: number;
    pageSize: number;
  }): Promise<{ candidates: OnlineCatalogCandidate[]; pageCount: number }>;
  songsByStyle?(input: {
    style: string;
    page: number;
    pageSize: number;
  }): Promise<{ candidates: OnlineCatalogCandidate[]; pageCount: number }>;
  packageSongs?(input: {
    packageType: number;
    packageId: string;
    limit: number;
  }): Promise<OnlineCatalogCandidate[]>;
  health(): IgebaHealth;
  probeHealth?(): Promise<IgebaHealth>;
}

export interface IgebaProviderOptions {
  id?: string;
  sourceLabel?: string;
}

export function createIgebaProvider(client: IgebaClient, options: IgebaProviderOptions = {}): OnlineCatalogProvider {
  const id = options.id ?? "igeba";
  const sourceLabel = options.sourceLabel ?? "在线曲库";

  return {
    id,
    sourceLabel,
    async search(keyword: string, limit: number): Promise<OnlineCatalogCandidate[]> {
      const page = await client.search(keyword, { pageSize: Math.min(50, Math.max(1, limit)) });
      return page.songs.map((song) => toCandidate(song, id, sourceLabel));
    },
    resolve: (providerSongId: string) => client.resolveAddress(providerSongId),
    async download(providerSongId: string, targetPath: string) {
      const address = await client.resolveAddress(providerSongId);
      const result = await client.downloadToFile(address, targetPath, {
        refresh: () => client.resolveAddress(providerSongId)
      });
      return { bytes: result.bytes, songNumber: providerSongId };
    },
    async hotModules() {
      return client.hotModules();
    },
    async discoverySingers(limit) {
      const page = await client.singerList({ pageSize: Math.min(50, Math.max(1, limit)) });
      return page.singers.map((singer) => ({
        singerId: singer.singerId,
        singerName: singer.singerName,
        mark: singer.mark,
        pictureUrl: singer.pictureUrl
      }));
    },
    async discoverySingerPage({ page, pageSize }) {
      const result = await client.singerList({
        page: Math.max(1, page),
        pageSize: Math.min(50, Math.max(1, pageSize))
      });
      return {
        singers: result.singers.map((singer) => ({
          singerId: singer.singerId,
          singerName: singer.singerName,
          mark: singer.mark,
          pictureUrl: singer.pictureUrl
        })),
        pageCount: result.pageCount
      };
    },
    async discoveryStyles() {
      return client.musicStyles();
    },
    async recommendedSongs(limit) {
      const ranks = await client.rankList();
      const hotRank =
        ranks.find((rank) => rank.rankTitle.includes("热歌")) ??
        ranks.find((rank) => rank.rankTitle.includes("飙升")) ??
        ranks[0];
      if (!hotRank) {
        return [];
      }
      const page = await client.rankSongs(hotRank.rankId, {
        order: [{ Hot: 1 }],
        pageSize: Math.min(50, Math.max(1, limit))
      });
      return page.songs.map((song) => toCandidate(song, id, sourceLabel));
    },
    async songsBySinger({ singerId, page, pageSize }) {
      const result = await client.songsBySingerId(singerId, { page, pageSize });
      return {
        candidates: result.songs.map((song) => toCandidate(song, id, sourceLabel)),
        pageCount: result.pageCount
      };
    },
    async songsByStyle({ style, page, pageSize }) {
      const result = await client.songsByStyle(style, { page, pageSize });
      return {
        candidates: result.songs.map((song) => toCandidate(song, id, sourceLabel)),
        pageCount: result.pageCount
      };
    },
    async packageSongs(input) {
      const page = await client.packageSongs({
        packageType: input.packageType,
        packageId: input.packageId,
        pageSize: Math.min(50, Math.max(1, input.limit))
      });
      return page.songs.map((song) => toCandidate(song, id, sourceLabel));
    },
    health: () => client.health(),
    probeHealth: () => client.probeHealth()
  };
}

function toCandidate(song: IgebaSong, provider: string, sourceLabel: string): OnlineCatalogCandidate {
  const tags = [song.mtvStyle, song.musicStyle, song.feeling].filter((tag) => tag.length > 0);
  return {
    provider,
    providerSongId: song.songNumber,
    title: song.title,
    artistName: song.artistName,
    durationMs: song.durationMs,
    language: song.language,
    coverUrl: song.coverUrl,
    sourceLabel,
    tags,
    metadata: {
      songNumber: song.songNumber,
      fileName: song.fileName,
      album: song.album,
      description: song.description,
      voiceChannel: song.voiceChannel,
      mtvStyle: song.mtvStyle,
      musicStyle: song.musicStyle,
      feeling: song.feeling
    }
  };
}
