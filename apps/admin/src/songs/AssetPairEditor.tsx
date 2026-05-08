import { useEffect, useState } from "react";
import { statusText, useI18n, vocalModeName } from "../i18n.js";
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
  const { t } = useI18n();
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
    <section className="asset-editor-section" aria-label={t("asset.editorAria")}>
      <h3>{t("asset.assets")}</h3>
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
                  <span>{t("asset.statusFor", { asset: asset.id })}</span>
                  <select
                    value={draft.status}
                    onChange={(event) => updateDraft(asset.id, { status: event.target.value as AssetStatus })}
                  >
                    <option value="ready">{statusText("ready", t)}</option>
                    <option value="caching">{statusText("caching", t)}</option>
                    <option value="failed">{statusText("failed", t)}</option>
                    <option value="unavailable">{statusText("unavailable", t)}</option>
                    <option value="stale">{statusText("stale", t)}</option>
                    <option value="promoted">{statusText("promoted", t)}</option>
                  </select>
                </label>
                <label>
                  <span>{t("asset.vocalFor", { asset: asset.id })}</span>
                  <select
                    value={draft.vocalMode}
                    onChange={(event) => updateDraft(asset.id, { vocalMode: event.target.value as VocalMode })}
                  >
                    <option value="original">{vocalModeName("original", t)}</option>
                    <option value="instrumental">{vocalModeName("instrumental", t)}</option>
                    <option value="dual">{vocalModeName("dual", t)}</option>
                    <option value="unknown">{vocalModeName("unknown", t)}</option>
                  </select>
                </label>
                <label>
                  <span>{t("asset.lyricFor", { asset: asset.id })}</span>
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
                  <span>{t("asset.switchFamilyFor", { asset: asset.id })}</span>
                  <input value={draft.switchFamily} onChange={(event) => updateDraft(asset.id, { switchFamily: event.target.value })} />
                </label>
              </div>
              <p className="action-note">{t("asset.switchQuality")}: {asset.switchQualityStatus}</p>
              <button className="secondary-button" disabled={isBusy} type="button" onClick={() => updateAsset(asset)}>
                {t("asset.update", { asset: asset.id })}
              </button>
            </article>
          );
        })}
      </div>
      {pendingChange ? (
        <ConfirmDangerDialog
          confirmLabel={t("asset.confirmApply")}
          message={t("asset.confirmMessage")}
          title={t("asset.confirmTitle")}
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
