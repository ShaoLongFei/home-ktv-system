import { useEffect, useMemo, useState, type FormEvent } from "react";
import { languageName, statusText, useI18n, vocalModeName } from "../i18n.js";
import { ConfirmActionDialog } from "./ConfirmActionDialog.js";
import type {
  AssetKind,
  ConflictResolution,
  ImportCandidate,
  ImportCandidateFileDetail,
  Language,
  MetadataUpdateInput,
  VocalMode
} from "./types.js";

interface CandidateEditorProps {
  candidate: ImportCandidate | null;
  isBusy: boolean;
  onSaveMetadata: (candidateId: string, input: MetadataUpdateInput) => Promise<void>;
  onHold: (candidateId: string) => Promise<void>;
  onApprove: (candidateId: string) => Promise<void>;
  onRejectDelete: (candidateId: string) => Promise<void>;
  onResolveConflict: (candidateId: string, input: ConflictResolution) => Promise<void>;
}

interface CandidateFormState {
  title: string;
  artistName: string;
  language: Language;
  defaultVocalMode: VocalMode;
  sameVersionConfirmed: boolean;
  genre: string;
  tags: string;
  releaseYear: string;
  aliases: string;
  searchHints: string;
  files: FileFormState[];
}

interface FileFormState {
  candidateFileId: string;
  label: string;
  selected: boolean;
  proposedVocalMode: VocalMode;
  proposedAssetKind: AssetKind;
}

type PendingConfirm = "approve" | "reject-delete" | null;

export function CandidateEditor({
  candidate,
  isBusy,
  onSaveMetadata,
  onHold,
  onApprove,
  onRejectDelete,
  onResolveConflict
}: CandidateEditorProps) {
  const { t } = useI18n();
  const [showFiles, setShowFiles] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [targetSongId, setTargetSongId] = useState("");
  const [versionSuffix, setVersionSuffix] = useState("");
  const [form, setForm] = useState<CandidateFormState | null>(() => (candidate ? toFormState(candidate) : null));

  useEffect(() => {
    setShowFiles(false);
    setPendingConfirm(null);
    setForm(candidate ? toFormState(candidate) : null);
    setTargetSongId(candidate ? conflictSongId(candidate) ?? "" : "");
    setVersionSuffix("");
  }, [candidate]);

  const conflict = useMemo(() => (candidate ? conflictMeta(candidate) : null), [candidate]);
  const previewFile = useMemo(() => (candidate ? realMvPreviewFile(candidate.files) : null), [candidate]);

  if (!candidate || !form) {
    return (
      <div className="editor-empty">
        <h2>{t("candidate.emptyTitle")}</h2>
        <p>{t("candidate.emptyBody")}</p>
      </div>
    );
  }

  const updateField = <K extends keyof CandidateFormState>(key: K, value: CandidateFormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateFile = (candidateFileId: string, patch: Partial<FileFormState>) => {
    setForm((current) =>
      current
        ? {
            ...current,
            files: current.files.map((file) =>
              file.candidateFileId === candidateFileId ? { ...file, ...patch } : file
            )
          }
        : current
    );
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSaveMetadata(candidate.id, toMetadataInput(form));
  };

  const handleConfirm = async () => {
    const action = pendingConfirm;
    setPendingConfirm(null);
    if (action === "approve") {
      await onApprove(candidate.id);
    }
    if (action === "reject-delete") {
      await onRejectDelete(candidate.id);
    }
  };

  const mergeExisting = async () => {
    const trimmedTarget = targetSongId.trim();
    if (!trimmedTarget) {
      return;
    }
    await onResolveConflict(candidate.id, { resolution: "merge_existing", targetSongId: trimmedTarget });
  };

  const createVersion = async () => {
    const trimmedSuffix = versionSuffix.trim();
    if (!trimmedSuffix) {
      return;
    }
    await onResolveConflict(candidate.id, { resolution: "create_version", versionSuffix: trimmedSuffix });
  };

  return (
    <article className="candidate-editor" aria-label={t("candidate.editorAria")}>
      <header className="editor-header">
        <div>
          <p className="status-label">{statusText(candidate.status, t)}</p>
          <h2>
            {candidate.artistName} - {candidate.title}
          </h2>
        </div>
        <div className="editor-actions">
          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => void onHold(candidate.id)}>
            {t("candidate.hold")}
          </button>
          <button className="primary-button" disabled={isBusy} type="button" onClick={() => setPendingConfirm("approve")}>
            {t("candidate.approve")}
          </button>
          <button
            className="danger-button"
            disabled={isBusy}
            type="button"
            onClick={() => setPendingConfirm("reject-delete")}
          >
            {t("candidate.rejectDelete")}
          </button>
        </div>
      </header>

      <p className="action-note">{t("candidate.holdNote")}</p>

      {previewFile ? <RealMvPreviewPanel file={previewFile} /> : null}

      <form className="metadata-form" onSubmit={(event) => void handleSave(event)}>
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
          <span>{t("candidate.defaultVocalMode")}</span>
          <select
            value={form.defaultVocalMode}
            onChange={(event) => updateField("defaultVocalMode", event.target.value as VocalMode)}
          >
            <option value="instrumental">{vocalModeName("instrumental", t)}</option>
            <option value="original">{vocalModeName("original", t)}</option>
            <option value="dual">{vocalModeName("dual", t)}</option>
            <option value="unknown">{vocalModeName("unknown", t)}</option>
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
        <label className="check-field">
          <input
            checked={form.sameVersionConfirmed}
            type="checkbox"
            onChange={(event) => updateField("sameVersionConfirmed", event.target.checked)}
          />
          <span>{t("candidate.sameVersion")}</span>
        </label>

        <section className="file-role-grid" aria-label={t("candidate.fileRoleAria")}>
          {candidate.files.map((file) => {
            const currentFile = form.files.find((item) => item.candidateFileId === file.candidateFileId);
            if (!currentFile) {
              return null;
            }

            return (
              <div className="file-role-row" key={file.candidateFileId}>
                <label>
                  <input
                    checked={currentFile.selected}
                    type="checkbox"
                    onChange={(event) => updateFile(file.candidateFileId, { selected: event.target.checked })}
                  />
                  <span>{t("candidate.useFile", { file: fileName(file.relativePath) })}</span>
                </label>
                <label>
                  <span>{t("candidate.vocalRole", { file: fileName(file.relativePath) })}</span>
                  <select
                    value={currentFile.proposedVocalMode}
                    onChange={(event) =>
                      updateFile(file.candidateFileId, { proposedVocalMode: event.target.value as VocalMode })
                    }
                  >
                    <option value="original">{vocalModeName("original", t)}</option>
                    <option value="instrumental">{vocalModeName("instrumental", t)}</option>
                    <option value="dual">{vocalModeName("dual", t)}</option>
                    <option value="unknown">{vocalModeName("unknown", t)}</option>
                  </select>
                </label>
              </div>
            );
          })}
        </section>

        <div className="form-actions">
          <button className="primary-button" disabled={isBusy} type="submit">
            {t("candidate.saveMetadata")}
          </button>
        </div>
      </form>

      <section className="file-detail-section">
        <button className="link-button" type="button" onClick={() => setShowFiles((current) => !current)}>
          {t("candidate.fileDetails")}
        </button>
        {showFiles ? <CandidateFiles files={candidate.files} /> : null}
      </section>

      {conflict ? (
        <section className="conflict-section" aria-label={t("candidate.conflictAria")}>
          <h3>{t("candidate.conflictTitle")}</h3>
          <dl className="fact-grid">
            <div>
              <dt>{t("candidate.conflictType")}</dt>
              <dd>{conflict.conflictType}</dd>
            </div>
            <div>
              <dt>{t("candidate.targetDirectory")}</dt>
              <dd>{conflict.targetDirectory}</dd>
            </div>
            <div>
              <dt>{t("candidate.matchedSongId")}</dt>
              <dd>{conflict.songId}</dd>
            </div>
          </dl>
          <div className="resolution-grid">
            <label>
              <span>{t("candidate.targetSongId")}</span>
              <input value={targetSongId} onChange={(event) => setTargetSongId(event.target.value)} />
            </label>
            <button className="secondary-button" disabled={isBusy || !targetSongId.trim()} type="button" onClick={() => void mergeExisting()}>
              {t("candidate.mergeExisting")}
            </button>
            <label>
              <span>{t("candidate.versionSuffix")}</span>
              <input value={versionSuffix} onChange={(event) => setVersionSuffix(event.target.value)} />
            </label>
            <button className="secondary-button" disabled={isBusy || !versionSuffix.trim()} type="button" onClick={() => void createVersion()}>
              {t("candidate.createVersion")}
            </button>
          </div>
        </section>
      ) : null}

      {pendingConfirm === "approve" ? (
        <ConfirmActionDialog
          confirmLabel={t("candidate.approve")}
          message={t("candidate.confirmApproveMessage")}
          title={t("candidate.confirmApproveTitle")}
          tone="normal"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}
      {pendingConfirm === "reject-delete" ? (
        <ConfirmActionDialog
          confirmLabel={t("candidate.rejectDelete")}
          message={t("candidate.confirmRejectMessage")}
          title={t("candidate.confirmRejectTitle")}
          tone="danger"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}
    </article>
  );
}

function RealMvPreviewPanel({ file }: { file: ImportCandidateFileDetail }) {
  const { t } = useI18n();
  const mediaInfo = file.mediaInfoSummary ?? null;
  const realMv = file.realMv ?? null;
  const sources = realMvSources(realMv);
  const warnings = realMvWarnings(file, realMv);
  const coverAlt = translated(t, "candidate.realMvCoverAlt", "MV 封面");

  return (
    <section className="real-mv-preview" aria-label={t("candidate.realMvPreviewAria")}>
      <div className="real-mv-cover">
        {file.coverPreviewUrl ? (
          <img alt={coverAlt} src={file.coverPreviewUrl} />
        ) : (
          <div className="real-mv-cover-empty">{translated(t, "candidate.noCover", "暂无封面")}</div>
        )}
      </div>
      <div className="real-mv-preview-body">
        <div className="real-mv-preview-header">
          <h3>{translated(t, "candidate.mediaInfo", "媒体信息")}</h3>
          {file.compatibilityStatus ? <span className="badge">{file.compatibilityStatus}</span> : null}
        </div>
        <dl className="fact-grid real-mv-facts">
          <div>
            <dt>{t("candidate.mediaContainer")}</dt>
            <dd>{mediaInfo?.container ?? t("common.unknown")}</dd>
          </div>
          <div>
            <dt>{t("candidate.duration")}</dt>
            <dd>{formatDuration(mediaInfo?.durationMs ?? file.durationMs ?? file.probeDurationMs)}</dd>
          </div>
          <div>
            <dt>{t("candidate.videoCodec")}</dt>
            <dd>{mediaInfo?.videoCodec ?? t("common.unknown")}</dd>
          </div>
          <div>
            <dt>{t("candidate.resolution")}</dt>
            <dd>{formatResolution(mediaInfo?.resolution)}</dd>
          </div>
          <div>
            <dt>{t("candidate.audioTracks")}</dt>
            <dd>{t("candidate.audioTrackCount", { count: String(mediaInfo?.audioTracks.length ?? 0) })}</dd>
          </div>
        </dl>
        {sources.length > 0 ? (
          <div className="real-mv-signal-row">
            <strong>{t("candidate.provenance")}</strong>
            <span className="chip-row">
              {sources.map((source) => (
                <span className="badge" key={source}>
                  {source}
                </span>
              ))}
            </span>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="real-mv-signal-row warning">
            <strong>{t("candidate.needsReview")}</strong>
            <span className="chip-row">
              {warnings.map((warning) => (
                <span className="warning-chip" key={warning}>
                  {warning}
                </span>
              ))}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CandidateFiles({ files }: { files: ImportCandidateFileDetail[] }) {
  const { t } = useI18n();
  return (
    <div className="file-table" role="table" aria-label={t("candidate.fileDetailsAria")}>
      <div className="file-table-head" role="row">
        <span role="columnheader">{t("candidate.file")}</span>
        <span role="columnheader">{t("candidate.role")}</span>
        <span role="columnheader">{t("candidate.root")}</span>
        <span role="columnheader">{t("candidate.probe")}</span>
        <span role="columnheader">{t("candidate.duration")}</span>
      </div>
      {files.map((file) => (
        <div className="file-table-row" key={file.candidateFileId} role="row">
          <span role="cell">
            <strong>{fileName(file.relativePath)}</strong>
            <small>{file.relativePath}</small>
          </span>
          <span className="badge" role="cell">
            {file.proposedVocalMode ?? "unknown"}
          </span>
          <span className="badge root-badge" role="cell">
            {file.rootKind}
          </span>
          <span className="badge probe-badge" role="cell">
            {file.probeStatus}
          </span>
          <span role="cell">{formatDuration(file.durationMs ?? file.probeDurationMs)}</span>
        </div>
      ))}
    </div>
  );
}

function realMvPreviewFile(files: ImportCandidateFileDetail[]): ImportCandidateFileDetail | null {
  return files.find((file) => file.selected && hasRealMvPreview(file)) ?? files.find(hasRealMvPreview) ?? null;
}

function hasRealMvPreview(file: ImportCandidateFileDetail): boolean {
  return Boolean(file.mediaInfoSummary || file.realMv || file.coverPreviewUrl);
}

function realMvSources(realMv: ImportCandidateFileDetail["realMv"] | null): string[] {
  if (!realMv?.metadataSources) {
    return [];
  }

  return Array.from(
    new Set(
      realMv.metadataSources
        .map((item) => (typeof item.source === "string" ? item.source : null))
        .filter((source): source is string => Boolean(source))
    )
  );
}

function realMvWarnings(
  file: ImportCandidateFileDetail,
  realMv: ImportCandidateFileDetail["realMv"] | null
): string[] {
  const warningCodes = new Set<string>();
  for (const reason of [...(file.compatibilityReasons ?? []), ...(realMv?.scannerReasons ?? [])]) {
    if (reason.code) {
      warningCodes.add(reason.code);
    }
  }
  for (const conflict of realMv?.metadataConflicts ?? []) {
    if (typeof conflict.field === "string") {
      warningCodes.add(conflict.field);
    }
  }
  return Array.from(warningCodes);
}

function toFormState(candidate: ImportCandidate): CandidateFormState {
  return {
    title: candidate.title,
    artistName: candidate.artistName,
    language: candidate.language,
    defaultVocalMode: asVocalMode(candidate.candidateMeta.defaultVocalMode) ?? "instrumental",
    sameVersionConfirmed: candidate.sameVersionConfirmed,
    genre: candidate.genre.join(", "),
    tags: candidate.tags.join(", "),
    releaseYear: candidate.releaseYear?.toString() ?? "",
    aliases: candidate.aliases.join(", "),
    searchHints: candidate.searchHints.join(", "),
    files: candidate.files.map((file) => ({
      candidateFileId: file.candidateFileId,
      label: fileName(file.relativePath),
      selected: file.selected,
      proposedVocalMode: file.proposedVocalMode ?? "unknown",
      proposedAssetKind: file.proposedAssetKind ?? "video"
    }))
  };
}

function toMetadataInput(form: CandidateFormState): MetadataUpdateInput {
  return {
    title: form.title.trim(),
    artistName: form.artistName.trim(),
    language: form.language,
    defaultVocalMode: form.defaultVocalMode,
    sameVersionConfirmed: form.sameVersionConfirmed,
    genre: splitCsv(form.genre),
    tags: splitCsv(form.tags),
    releaseYear: parseYear(form.releaseYear),
    aliases: splitCsv(form.aliases),
    searchHints: splitCsv(form.searchHints),
    files: form.files.map((file) => ({
      candidateFileId: file.candidateFileId,
      selected: file.selected,
      proposedVocalMode: file.proposedVocalMode,
      proposedAssetKind: file.proposedAssetKind
    }))
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

function conflictMeta(candidate: ImportCandidate): { conflictType: string; targetDirectory: string; songId: string } | null {
  if (candidate.status !== "conflict") {
    return null;
  }

  return {
    conflictType: stringMeta(candidate.candidateMeta.conflictType) ?? "unknown",
    targetDirectory: stringMeta(candidate.candidateMeta.targetDirectory) ?? "unknown",
    songId: conflictSongId(candidate) ?? "unknown"
  };
}

function conflictSongId(candidate: ImportCandidate): string | null {
  return candidate.conflictSongId ?? stringMeta(candidate.candidateMeta.songId);
}

function stringMeta(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asVocalMode(value: unknown): VocalMode | null {
  return value === "original" || value === "instrumental" || value === "dual" || value === "unknown" ? value : null;
}

function fileName(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "unknown";
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  const milliseconds = durationMs % 1_000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

function formatResolution(resolution: { width: number; height: number } | null | undefined): string {
  return resolution ? `${resolution.width} x ${resolution.height}` : "unknown";
}

function translated(
  t: (key: string, replacements?: Record<string, string>) => string,
  key: string,
  fallback: string
): string {
  const value = t(key);
  return value === key ? fallback : value;
}
