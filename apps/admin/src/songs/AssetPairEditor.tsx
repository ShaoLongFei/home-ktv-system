import { useEffect, useState } from "react";
import { ConfirmDangerDialog } from "./ConfirmDangerDialog.js";
import type {
  AdminCatalogAsset,
  AssetStatus,
  CatalogAssetPatch,
  LyricMode,
  VocalMode
} from "./types.js";

interface AssetPairEditorProps {
  assets: AdminCatalogAsset[];
  isBusy: boolean;
  onUpdateAsset: (assetId: string, patch: CatalogAssetPatch) => Promise<void>;
}

interface AssetDraft {
  status: AssetStatus;
  vocalMode: VocalMode;
  lyricMode: LyricMode;
  switchFamily: string;
}

interface PendingChange {
  assetId: string;
  patch: CatalogAssetPatch;
}

export function AssetPairEditor({ assets, isBusy, onUpdateAsset }: AssetPairEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>(() => toDrafts(assets));
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  useEffect(() => {
    setDrafts(toDrafts(assets));
    setPendingChange(null);
  }, [assets]);

  const updateDraft = (assetId: string, patch: Partial<AssetDraft>) => {
    setDrafts((current) => ({
      ...current,
      [assetId]: {
        ...(current[assetId] ?? fallbackDraft()),
        ...patch
      }
    }));
  };

  const updateAsset = (asset: AdminCatalogAsset) => {
    const draft = drafts[asset.id] ?? toDraft(asset);
    const patch = buildChangedPatch(asset, draft);
    if (Object.keys(patch).length === 0) {
      return;
    }

    if (isDangerousChange(asset, patch)) {
      setPendingChange({ assetId: asset.id, patch });
      return;
    }

    void onUpdateAsset(asset.id, patch);
  };

  const confirmChange = async () => {
    const change = pendingChange;
    setPendingChange(null);
    if (change) {
      await onUpdateAsset(change.assetId, change.patch);
    }
  };

  return (
    <section className="asset-editor-section" aria-label="Asset pair editor">
      <h3>Assets</h3>
      <div className="asset-editor-grid">
        {assets.map((asset) => {
          const draft = drafts[asset.id] ?? toDraft(asset);
          return (
            <article className="asset-editor-card" key={asset.id}>
              <header>
                <div>
                  <strong>{asset.id}</strong>
                  <small>{asset.filePath}</small>
                </div>
                <span className="badge">{formatDuration(asset.durationMs)}</span>
              </header>
              <div className="asset-control-grid">
                <label>
                  <span>{`Status for ${asset.id}`}</span>
                  <select
                    value={draft.status}
                    onChange={(event) => updateDraft(asset.id, { status: event.target.value as AssetStatus })}
                  >
                    <option value="ready">ready</option>
                    <option value="caching">caching</option>
                    <option value="failed">failed</option>
                    <option value="unavailable">unavailable</option>
                    <option value="stale">stale</option>
                    <option value="promoted">promoted</option>
                  </select>
                </label>
                <label>
                  <span>{`Vocal mode for ${asset.id}`}</span>
                  <select
                    value={draft.vocalMode}
                    onChange={(event) => updateDraft(asset.id, { vocalMode: event.target.value as VocalMode })}
                  >
                    <option value="original">original</option>
                    <option value="instrumental">instrumental</option>
                    <option value="dual">dual</option>
                    <option value="unknown">unknown</option>
                  </select>
                </label>
                <label>
                  <span>{`Lyric mode for ${asset.id}`}</span>
                  <select
                    value={draft.lyricMode}
                    onChange={(event) => updateDraft(asset.id, { lyricMode: event.target.value as LyricMode })}
                  >
                    <option value="hard_sub">hard_sub</option>
                    <option value="soft_sub">soft_sub</option>
                    <option value="external_lrc">external_lrc</option>
                    <option value="none">none</option>
                  </select>
                </label>
                <label>
                  <span>{`Switch family for ${asset.id}`}</span>
                  <input value={draft.switchFamily} onChange={(event) => updateDraft(asset.id, { switchFamily: event.target.value })} />
                </label>
              </div>
              <p className="action-note">Switch quality: {asset.switchQualityStatus}</p>
              <button className="secondary-button" disabled={isBusy} type="button" onClick={() => updateAsset(asset)}>
                Update {asset.id}
              </button>
            </article>
          );
        })}
      </div>
      {pendingChange ? (
        <ConfirmDangerDialog
          confirmLabel="Apply change"
          message="This resource change can alter readiness or vocal switching eligibility and will be revalidated."
          title="Confirm catalog change"
          onCancel={() => setPendingChange(null)}
          onConfirm={() => void confirmChange()}
        />
      ) : null}
    </section>
  );
}

function toDrafts(assets: AdminCatalogAsset[]): Record<string, AssetDraft> {
  return Object.fromEntries(assets.map((asset) => [asset.id, toDraft(asset)]));
}

function toDraft(asset: AdminCatalogAsset): AssetDraft {
  return {
    status: asset.status,
    vocalMode: asset.vocalMode,
    lyricMode: asset.lyricMode,
    switchFamily: asset.switchFamily ?? ""
  };
}

function buildChangedPatch(asset: AdminCatalogAsset, draft: AssetDraft): CatalogAssetPatch {
  const patch: CatalogAssetPatch = {};
  const switchFamily = normalizeSwitchFamily(draft.switchFamily);

  if (draft.status !== asset.status) {
    patch.status = draft.status;
  }
  if (draft.vocalMode !== asset.vocalMode) {
    patch.vocalMode = draft.vocalMode;
  }
  if (draft.lyricMode !== asset.lyricMode) {
    patch.lyricMode = draft.lyricMode;
  }
  if (switchFamily !== asset.switchFamily) {
    patch.switchFamily = switchFamily;
  }

  return patch;
}

function isDangerousChange(asset: AdminCatalogAsset, patch: CatalogAssetPatch): boolean {
  return (
    (asset.status === "ready" && patch.status !== undefined && patch.status !== "ready") ||
    patch.vocalMode !== undefined ||
    patch.switchFamily !== undefined
  );
}

function normalizeSwitchFamily(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function fallbackDraft(): AssetDraft {
  return {
    status: "unavailable",
    vocalMode: "unknown",
    lyricMode: "none",
    switchFamily: ""
  };
}

function formatDuration(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
