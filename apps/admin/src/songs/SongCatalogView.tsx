import { languageName, statusText, useI18n, vocalModeName } from "../i18n.js";
import { SongDetailEditor } from "./SongDetailEditor.js";
import { languageOptions, songStatusOptions, useSongCatalogRuntime } from "./use-song-catalog-runtime.js";
import type { AdminCatalogAsset, AdminCatalogSong, Language, SongStatus } from "./types.js";

export function SongCatalogView() {
  const { t } = useI18n();
  const {
    status,
    setStatus,
    language,
    setLanguage,
    songs,
    selectedSong,
    setSelectedSongId,
    evaluation,
    validation,
    queryIsError,
    queryIsLoading,
    isBusy,
    revalidateSong,
    saveMetadata,
    setDefaultAsset,
    updateAsset,
    validateSong
  } = useSongCatalogRuntime();

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>{t("songs.title")}</h1>
          <p>{t("songs.description")}</p>
        </div>
      </header>

      <section className="catalog-workbench" aria-label={t("songs.catalogAria")}>
        <aside className="catalog-list-pane" aria-label={t("songs.listAria")}>
          <p className="pane-title">{t("songs.formalSongs")}</p>
          <div className="catalog-filters">
            <label>
              <span>{t("songs.status")}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as SongStatus | "")}>
                {songStatusOptions.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option ? statusText(option, t) : t("songs.allStatuses")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("candidate.language")}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as Language | "")}>
                {languageOptions.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option ? languageName(option, t) : languageName("all", t)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {queryIsError ? <p className="queue-error-text">歌曲加载失败，请稍后重试。</p> : null}
          {queryIsLoading ? <p className="queue-empty-text">{t("songs.loading")}</p> : null}
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
                    {song.artistName} · {languageName(song.language, t)} · {statusText(song.status, t)} · {song.assets.length}{" "}
                    {t("songs.assets")}
                  </small>
                </span>
                <span className={`status-dot ${song.status}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </aside>

        <section className="catalog-detail-pane" aria-label={t("songs.detailAria")}>
          {selectedSong ? (
            <SongDetailEditor
              evaluation={evaluation}
              isBusy={isBusy}
              song={selectedSong}
              validation={validation}
              onRevalidate={async (songId) => {
                await revalidateSong(songId);
              }}
              onSaveMetadata={async (songId, input) => {
                await saveMetadata(songId, input);
              }}
              onSetDefaultAsset={async (songId, assetId) => {
                await setDefaultAsset(songId, assetId);
              }}
              onUpdateAsset={async (assetId, patch) => {
                await updateAsset(assetId, patch);
              }}
              onValidate={async (songId) => {
                await validateSong(songId);
              }}
            />
          ) : (
            <EmptySongDetail />
          )}
        </section>
      </section>
    </main>
  );
}

function SongResourceSummary({ song }: { song: AdminCatalogSong }) {
  const { t } = useI18n();
  return (
    <article className="song-detail-shell">
      <header className="editor-header">
        <div>
          <p className="status-label">{statusText(song.status, t)}</p>
          <h2>
            {song.artistName} - {song.title}
          </h2>
          <p className="action-note">
            {t("songs.defaultAsset")}: <strong>{song.defaultAssetId ?? t("common.none")}</strong>
          </p>
        </div>
      </header>

      <section className="asset-summary-grid" aria-label={t("asset.summaryAria")}>
        {song.assets.map((asset) => (
          <AssetSummary key={asset.id} asset={asset} />
        ))}
      </section>
    </article>
  );
}

function AssetSummary({ asset }: { asset: AdminCatalogAsset }) {
  const { t } = useI18n();
  return (
    <article className="asset-summary">
      <header>
        <strong>{asset.id}</strong>
        <span className="badge">{statusText(asset.status, t)}</span>
      </header>
      <dl className="asset-facts">
        <div>
          <dt>{t("asset.vocal")}</dt>
          <dd>{vocalModeName(asset.vocalMode, t)}</dd>
        </div>
        <div>
          <dt>{t("asset.lyric")}</dt>
          <dd>{asset.lyricMode}</dd>
        </div>
        <div>
          <dt>{t("asset.switchFamily")}</dt>
          <dd>{asset.switchFamily ?? t("common.none")}</dd>
        </div>
        <div>
          <dt>{t("asset.switchQuality")}</dt>
          <dd>{asset.switchQualityStatus}</dd>
        </div>
      </dl>
    </article>
  );
}

function EmptySongDetail() {
  const { t } = useI18n();
  return (
    <div className="editor-empty">
      <h2>{t("songs.emptyTitle")}</h2>
      <p>{t("songs.emptyBody")}</p>
    </div>
  );
}
