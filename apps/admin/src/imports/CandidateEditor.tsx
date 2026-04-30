import { useEffect, useMemo, useState, type FormEvent } from "react";
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

  if (!candidate || !form) {
    return (
      <div className="editor-empty">
        <h2>Select a candidate</h2>
        <p>Metadata and file review controls will appear here.</p>
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
    <article className="candidate-editor" aria-label="Candidate editor">
      <header className="editor-header">
        <div>
          <p className="status-label">{statusLabel(candidate.status)}</p>
          <h2>
            {candidate.artistName} - {candidate.title}
          </h2>
        </div>
        <div className="editor-actions">
          <button className="secondary-button" disabled={isBusy} type="button" onClick={() => void onHold(candidate.id)}>
            Hold
          </button>
          <button className="primary-button" disabled={isBusy} type="button" onClick={() => setPendingConfirm("approve")}>
            Approve
          </button>
          <button
            className="danger-button"
            disabled={isBusy}
            type="button"
            onClick={() => setPendingConfirm("reject-delete")}
          >
            Reject delete
          </button>
        </div>
      </header>

      <p className="action-note">Hold keeps files in imports/needs-review for later review.</p>

      <form className="metadata-form" onSubmit={(event) => void handleSave(event)}>
        <label>
          <span>Title</span>
          <input value={form.title} onChange={(event) => updateField("title", event.target.value)} />
        </label>
        <label>
          <span>Artist</span>
          <input value={form.artistName} onChange={(event) => updateField("artistName", event.target.value)} />
        </label>
        <label>
          <span>Language</span>
          <select value={form.language} onChange={(event) => updateField("language", event.target.value as Language)}>
            <option value="mandarin">Mandarin</option>
            <option value="cantonese">Cantonese</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          <span>Default vocal mode</span>
          <select
            value={form.defaultVocalMode}
            onChange={(event) => updateField("defaultVocalMode", event.target.value as VocalMode)}
          >
            <option value="instrumental">Instrumental</option>
            <option value="original">Original</option>
            <option value="dual">Dual</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          <span>Genre</span>
          <input value={form.genre} onChange={(event) => updateField("genre", event.target.value)} />
        </label>
        <label>
          <span>Tags</span>
          <input value={form.tags} onChange={(event) => updateField("tags", event.target.value)} />
        </label>
        <label>
          <span>Year</span>
          <input inputMode="numeric" value={form.releaseYear} onChange={(event) => updateField("releaseYear", event.target.value)} />
        </label>
        <label>
          <span>Aliases</span>
          <input value={form.aliases} onChange={(event) => updateField("aliases", event.target.value)} />
        </label>
        <label className="wide-field">
          <span>Search hints</span>
          <input value={form.searchHints} onChange={(event) => updateField("searchHints", event.target.value)} />
        </label>
        <label className="check-field">
          <input
            checked={form.sameVersionConfirmed}
            type="checkbox"
            onChange={(event) => updateField("sameVersionConfirmed", event.target.checked)}
          />
          <span>Same version proof confirmed</span>
        </label>

        <section className="file-role-grid" aria-label="File role editing">
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
                  <span>Use {fileName(file.relativePath)}</span>
                </label>
                <label>
                  <span>Vocal role for {fileName(file.relativePath)}</span>
                  <select
                    value={currentFile.proposedVocalMode}
                    onChange={(event) =>
                      updateFile(file.candidateFileId, { proposedVocalMode: event.target.value as VocalMode })
                    }
                  >
                    <option value="original">Original</option>
                    <option value="instrumental">Instrumental</option>
                    <option value="dual">Dual</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              </div>
            );
          })}
        </section>

        <div className="form-actions">
          <button className="primary-button" disabled={isBusy} type="submit">
            Save metadata
          </button>
        </div>
      </form>

      <section className="file-detail-section">
        <button className="link-button" type="button" onClick={() => setShowFiles((current) => !current)}>
          File details
        </button>
        {showFiles ? <CandidateFiles files={candidate.files} /> : null}
      </section>

      {conflict ? (
        <section className="conflict-section" aria-label="Conflict resolution">
          <h3>Conflict resolution</h3>
          <dl className="fact-grid">
            <div>
              <dt>Conflict type</dt>
              <dd>{conflict.conflictType}</dd>
            </div>
            <div>
              <dt>Target directory</dt>
              <dd>{conflict.targetDirectory}</dd>
            </div>
            <div>
              <dt>Matched song id</dt>
              <dd>{conflict.songId}</dd>
            </div>
          </dl>
          <div className="resolution-grid">
            <label>
              <span>Target song id</span>
              <input value={targetSongId} onChange={(event) => setTargetSongId(event.target.value)} />
            </label>
            <button className="secondary-button" disabled={isBusy || !targetSongId.trim()} type="button" onClick={() => void mergeExisting()}>
              Merge existing
            </button>
            <label>
              <span>Version suffix</span>
              <input value={versionSuffix} onChange={(event) => setVersionSuffix(event.target.value)} />
            </label>
            <button className="secondary-button" disabled={isBusy || !versionSuffix.trim()} type="button" onClick={() => void createVersion()}>
              Create version
            </button>
          </div>
        </section>
      ) : null}

      {pendingConfirm === "approve" ? (
        <ConfirmActionDialog
          confirmLabel="Approve"
          message="Approve this candidate into the formal library after the backend admission checks pass."
          title="Confirm approve"
          tone="normal"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}
      {pendingConfirm === "reject-delete" ? (
        <ConfirmActionDialog
          confirmLabel="Reject delete"
          message="Rejecting this candidate deletes its import files. This cannot be undone."
          title="Confirm reject delete"
          tone="danger"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}
    </article>
  );
}

function CandidateFiles({ files }: { files: ImportCandidateFileDetail[] }) {
  return (
    <div className="file-table" role="table" aria-label="Candidate file details">
      <div className="file-table-head" role="row">
        <span role="columnheader">File</span>
        <span role="columnheader">Role</span>
        <span role="columnheader">Root</span>
        <span role="columnheader">Probe</span>
        <span role="columnheader">Duration</span>
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

function statusLabel(status: ImportCandidate["status"]): string {
  if (status === "review_required") {
    return "Review required";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
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
