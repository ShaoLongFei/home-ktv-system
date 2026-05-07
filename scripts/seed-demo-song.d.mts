export interface SeedDemoSongOptions {
  apiBaseUrl?: string;
  mediaRoot?: string;
  roomSlug?: string;
  artistName?: string;
  title?: string;
  durationMs?: number;
  timeoutMs?: number;
  ffmpegBin?: string;
  versionSuffix?: string;
  fetchImpl?: typeof fetch;
  runCommand?: (command: string, args: string[]) => Promise<void>;
}

export interface SeedDemoSongResult {
  candidateId: string;
  status: string;
  song: {
    title: string;
    artistName: string;
  };
}

export interface SeedDemoSongsResult {
  songs: SeedDemoSongResult[];
}

export function seedDemoSong(options?: SeedDemoSongOptions): Promise<SeedDemoSongResult>;
export function seedDemoSongs(options?: SeedDemoSongOptions): Promise<SeedDemoSongsResult>;
