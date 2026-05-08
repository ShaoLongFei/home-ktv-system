import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  fetchCatalogSongs,
  revalidateCatalogSong,
  updateCatalogAsset,
  updateCatalogDefaultAsset,
  updateCatalogSong,
  validateCatalogSong
} from "../api/client.js";
import { languageName, statusText, useI18n, vocalModeName } from "../i18n.js";
import { SongDetailEditor } from "./SongDetailEditor.js";
import type {
  AdminCatalogAsset,
  AdminCatalogSong,
  CatalogAssetPatch,
  CatalogEvaluation,
  CatalogValidationResult,
  Language,
  SongMetadataPatch,
  SongStatus
} from "./types.js";

const songStatusOptions: Array<SongStatus | ""> = ["", "ready", "review_required", "unavailable"];
const languageOptions: Array<Language | ""> = ["", "mandarin", "cantonese", "other"];

export function SongCatalogView() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SongStatus | "">("");
  const [language, setLanguage] = useState<Language | "">("");
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<CatalogEvaluation | null>(null);
  const [validation, setValidation] = useState<CatalogValidationResult | null>(null);
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

  const saveMetadataMutation = useMutation({
    mutationFn: ({ songId, input }: { songId: string; input: SongMetadataPatch }) => updateCatalogSong(songId, input),
    onSuccess: (result) => cacheSong(queryClient, result.song)
  });
  const defaultAssetMutation = useMutation({
    mutationFn: ({ songId, assetId }: { songId: string; assetId: string }) => updateCatalogDefaultAsset(songId, assetId),
    onSuccess: (result) => {
      setEvaluation(result.evaluation ?? null);
      cacheSong(queryClient, result.song);
    }
  });
  const assetMutation = useMutation({
    mutationFn: ({ assetId, patch }: { assetId: string; patch: CatalogAssetPatch }) => updateCatalogAsset(assetId, patch),
    onSuccess: (result) => {
      setEvaluation(result.evaluation ?? null);
      cacheSong(queryClient, result.song);
    }
  });
  const revalidateMutation = useMutation({
    mutationFn: (songId: string) => revalidateCatalogSong(songId),
    onSuccess: (result) => {
      setEvaluation(result.evaluation);
      cacheSong(queryClient, result.song);
    }
  });
  const validateMutation = useMutation({
    mutationFn: (songId: string) => validateCatalogSong(songId),
    onSuccess: (result) => setValidation(result)
  });

  const isBusy =
    saveMetadataMutation.isPending ||
    defaultAssetMutation.isPending ||
    assetMutation.isPending ||
    revalidateMutation.isPending ||
    validateMutation.isPending;

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
          {query.isLoading ? <p className="queue-empty-text">{t("songs.loading")}</p> : null}
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
                await revalidateMutation.mutateAsync(songId);
              }}
              onSaveMetadata={async (songId, input) => {
                await saveMetadataMutation.mutateAsync({ songId, input });
              }}
              onSetDefaultAsset={async (songId, assetId) => {
                await defaultAssetMutation.mutateAsync({ songId, assetId });
              }}
              onUpdateAsset={async (assetId, patch) => {
                await assetMutation.mutateAsync({ assetId, patch });
              }}
              onValidate={async (songId) => {
                await validateMutation.mutateAsync(songId);
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

function cacheSong(queryClient: ReturnType<typeof useQueryClient>, song: AdminCatalogSong) {
  queryClient.setQueriesData<AdminCatalogSong[]>({ queryKey: ["catalog-songs"] }, (current) =>
    current?.map((item) => (item.id === song.id ? song : item))
  );
}
