import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchCatalogSongs } from "../api/client.js";
import type { AdminCatalogAsset, AdminCatalogSong, Language, SongStatus } from "./types.js";

const songStatusOptions: Array<{ value: SongStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "ready", label: "Ready" },
  { value: "review_required", label: "Review required" },
  { value: "unavailable", label: "Unavailable" }
];

const languageOptions: Array<{ value: Language | ""; label: string }> = [
  { value: "", label: "All languages" },
  { value: "mandarin", label: "Mandarin" },
  { value: "cantonese", label: "Cantonese" },
  { value: "other", label: "Other" }
];

export function SongCatalogView() {
  const [status, setStatus] = useState<SongStatus | "">("");
  const [language, setLanguage] = useState<Language | "">("");
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["catalog-songs", status, language],
    queryFn: () =>
      fetchCatalogSongs({
        ...(status ? { status } : {}),
        ...(language ? { language } : {})
      }),
    retry: false
  });
  const songs = query.data ?? [];

  useEffect(() => {
    if (songs.length === 0) {
      setSelectedSongId(null);
      return;
    }
    if (!selectedSongId || !songs.some((song) => song.id === selectedSongId)) {
      setSelectedSongId(songs[0]?.id ?? null);
    }
  }, [selectedSongId, songs]);

  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) ?? songs[0] ?? null,
    [selectedSongId, songs]
  );

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>Song catalog</h1>
          <p>Maintain formal songs, default resources, and switch eligibility.</p>
        </div>
      </header>

      <section className="catalog-workbench" aria-label="Formal song catalog">
        <aside className="catalog-list-pane" aria-label="Song list">
          <p className="pane-title">Formal songs</p>
          <div className="catalog-filters">
            <label>
              <span>Song status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as SongStatus | "")}>
                {songStatusOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Language</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as Language | "")}>
                {languageOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {query.isLoading ? <p className="queue-empty-text">Loading songs</p> : null}
          <div className="song-list">
            {songs.map((song) => (
              <button
                className={song.id === selectedSong?.id ? "song-row selected" : "song-row"}
                key={song.id}
                type="button"
                onClick={() => setSelectedSongId(song.id)}
              >
                <span className="song-row-main">
                  <strong>{song.title}</strong>
                  <small>
                    {song.artistName} · {song.language} · {song.status} · {song.assets.length} assets
                  </small>
                </span>
                <span className={`status-dot ${song.status}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </aside>

        <section className="catalog-detail-pane" aria-label="Song resource detail">
          {selectedSong ? <SongResourceSummary song={selectedSong} /> : <EmptySongDetail />}
        </section>
      </section>
    </main>
  );
}

function SongResourceSummary({ song }: { song: AdminCatalogSong }) {
  return (
    <article className="song-detail-shell">
      <header className="editor-header">
        <div>
          <p className="status-label">{song.status}</p>
          <h2>
            {song.artistName} - {song.title}
          </h2>
          <p className="action-note">
            Default asset: <strong>{song.defaultAssetId ?? "none"}</strong>
          </p>
        </div>
      </header>

      <section className="asset-summary-grid" aria-label="Asset summaries">
        {song.assets.map((asset) => (
          <AssetSummary key={asset.id} asset={asset} />
        ))}
      </section>
    </article>
  );
}

function AssetSummary({ asset }: { asset: AdminCatalogAsset }) {
  return (
    <article className="asset-summary">
      <header>
        <strong>{asset.id}</strong>
        <span className="badge">{asset.status}</span>
      </header>
      <dl className="asset-facts">
        <div>
          <dt>Vocal</dt>
          <dd>{asset.vocalMode}</dd>
        </div>
        <div>
          <dt>Lyric</dt>
          <dd>{asset.lyricMode}</dd>
        </div>
        <div>
          <dt>Switch family</dt>
          <dd>{asset.switchFamily ?? "none"}</dd>
        </div>
        <div>
          <dt>Switch quality</dt>
          <dd>{asset.switchQualityStatus}</dd>
        </div>
      </dl>
    </article>
  );
}

function EmptySongDetail() {
  return (
    <div className="editor-empty">
      <h2>Select a song</h2>
      <p>Formal song and resource maintenance controls will appear here.</p>
    </div>
  );
}
