import { useEffect, useState, type FormEvent } from "react";
import { languageName, statusText, useI18n } from "../i18n.js";
import { AssetPairEditor } from "./AssetPairEditor.js";
import type {
  AdminCatalogSong,
  CatalogAssetPatch,
  CatalogEvaluation,
  CatalogValidationResult,
  Language,
  SongMetadataPatch,
  SongStatus
} from "./types.js";

interface SongDetailEditorProps {
  song: AdminCatalogSong;
  isBusy: boolean;
  evaluation: CatalogEvaluation | null;
  validation: CatalogValidationResult | null;
  onSaveMetadata: (songId: string, input: SongMetadataPatch) => Promise<void>;
  onSetDefaultAsset: (songId: string, assetId: string) => Promise<void>;
  onUpdateAsset: (assetId: string, patch: CatalogAssetPatch) => Promise<void>;
  onRevalidate: (songId: string) => Promise<void>;
  onValidate: (songId: string) => Promise<void>;
}

interface SongFormState {
  title: string;
  artistName: string;
  language: Language;
  genre: string;
  tags: string;
  releaseYear: string;
  aliases: string;
  searchHints: string;
  status: SongStatus;
  defaultAssetId: string;
}

export function SongDetailEditor({
  song,
  isBusy,
  evaluation,
  validation,
  onSaveMetadata,
  onSetDefaultAsset,
  onUpdateAsset,
  onRevalidate,
  onValidate
}: SongDetailEditorProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<SongFormState>(() => toFormState(song));

  useEffect(() => {
    setForm(toFormState(song));
  }, [song]);

  const updateField = <K extends keyof SongFormState>(key: K, value: SongFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveMetadata = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSaveMetadata(song.id, toMetadataPatch(form));
  };

  return (
    <article className="song-detail-shell">
      <header className="editor-header">
        <div>
          <p className="status-label">{statusText(song.status, t)}</p>
          <h2>
            {song.artistName} - {song.title}
          </h2>
        </div>
        <div className="editor-actions">
          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => void onRevalidate(song.id)}>
            {t("songs.revalidate")}
          </button>
          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => void onValidate(song.id)}>
            {t("songs.validateJson")}
          </button>
        </div>
      </header>

      <form className="metadata-form" onSubmit={(event) => void saveMetadata(event)}>
        <label>
          <span>{t("candidate.title")}</span>
          <input value={form.title} onChange={(event) => updateField("title", event.target.value)} />
        </label>
        <label>
          <span>{t("candidate.artist")}</span>
          <input value={form.artistName} onChange={(event) => updateField("artistName", event.target.value)} />
        </label>
        <label>
          <span>{t("candidate.language")}</span>
          <select value={form.language} onChange={(event) => updateField("language", event.target.value as Language)}>
            <option value="mandarin">{languageName("mandarin", t)}</option>
            <option value="cantonese">{languageName("cantonese", t)}</option>
            <option value="other">{languageName("other", t)}</option>
          </select>
        </label>
        <label>
          <span>{t("songs.catalogStatus")}</span>
          <select value={form.status} onChange={(event) => updateField("status", event.target.value as SongStatus)}>
            <option value="ready">{statusText("ready", t)}</option>
            <option value="review_required">{statusText("review_required", t)}</option>
            <option value="unavailable">{statusText("unavailable", t)}</option>
          </select>
        </label>
        <label>
          <span>{t("candidate.genre")}</span>
          <input value={form.genre} onChange={(event) => updateField("genre", event.target.value)} />
        </label>
        <label>
          <span>{t("candidate.tags")}</span>
          <input value={form.tags} onChange={(event) => updateField("tags", event.target.value)} />
        </label>
        <label>
          <span>{t("candidate.year")}</span>
          <input inputMode="numeric" value={form.releaseYear} onChange={(event) => updateField("releaseYear", event.target.value)} />
        </label>
        <label>
          <span>{t("candidate.aliases")}</span>
          <input value={form.aliases} onChange={(event) => updateField("aliases", event.target.value)} />
        </label>
        <label className="wide-field">
          <span>{t("candidate.searchHints")}</span>
          <input value={form.searchHints} onChange={(event) => updateField("searchHints", event.target.value)} />
        </label>
        <div className="form-actions">
          <button className="primary-button" disabled={isBusy} type="submit">
            {t("songs.saveMetadata")}
          </button>
        </div>
      </form>

      <section className="metadata-form" aria-label={t("songs.defaultAssetAria")}>
        <label>
          <span>{t("songs.defaultAsset")}</span>
          <select value={form.defaultAssetId} onChange={(event) => updateField("defaultAssetId", event.target.value)}>
            {song.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.id}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button
            className="secondary-button"
            disabled={isBusy || !form.defaultAssetId}
            type="button"
            onClick={() => void onSetDefaultAsset(song.id, form.defaultAssetId)}
          >
            {t("songs.setDefaultAsset")}
          </button>
        </div>
      </section>

      {evaluation ? (
        <section className="validation-panel" aria-label={t("songs.revalidationAria")}>
          <h3>{t("songs.revalidation")}</h3>
          <p>
            {evaluation.status}
            {evaluation.reason ? `: ${evaluation.reason}` : ""}
          </p>
        </section>
      ) : null}

      {validation ? (
        <section className="validation-panel" aria-label={t("songs.validationAria")}>
          <h3>{t("songs.validation")}</h3>
          <p>{validation.status}</p>
          <ul>
            {validation.issues.map((issue) => (
              <li key={`${issue.code}-${issue.assetId ?? issue.path ?? issue.reason ?? "song"}`}>
                <strong>{issue.code}</strong>
                {issue.reason ? `: ${issue.reason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AssetPairEditor assets={song.assets} isBusy={isBusy} onUpdateAsset={onUpdateAsset} />
    </article>
  );
}

function toFormState(song: AdminCatalogSong): SongFormState {
  return {
    title: song.title,
    artistName: song.artistName,
    language: song.language,
    genre: song.genre.join(", "),
    tags: song.tags.join(", "),
    releaseYear: song.releaseYear?.toString() ?? "",
    aliases: song.aliases.join(", "),
    searchHints: song.searchHints.join(", "),
    status: song.status,
    defaultAssetId: song.defaultAssetId ?? song.assets[0]?.id ?? ""
  };
}

function toMetadataPatch(form: SongFormState): SongMetadataPatch {
  return {
    title: form.title.trim(),
    artistName: form.artistName.trim(),
    language: form.language,
    genre: splitCsv(form.genre),
    tags: splitCsv(form.tags),
    releaseYear: parseYear(form.releaseYear),
    aliases: splitCsv(form.aliases),
    searchHints: splitCsv(form.searchHints),
    status: form.status
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseYear(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
