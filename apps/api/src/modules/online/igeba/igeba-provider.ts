import type { IgebaClient, IgebaHealth, IgebaSong, IgebaSongAddress } from "./igeba-client.js";

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
