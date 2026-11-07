import { useCallback, useEffect, useState } from "react";
import {
  evictOnlineAsset,
  fetchOnlineAssets,
  fetchOnlineDiscovery,
  fetchOnlineSourceStatus,
  importOnlineByPackage,
  importOnlineByQuery,
  pruneOnlineCache,
  type OnlineAssetResponse,
  type OnlineHotModuleResponse,
  type OnlineSourceStatusResponse
} from "../api/client.js";
import { useI18n } from "../i18n.js";

const packageTypeByObject: Record<string, number> = {
  Album: 2,
  Playlist: 3,
  Rank: 4
};

export function OnlineSourceView() {
  const { t } = useI18n();
  const [status, setStatus] = useState<OnlineSourceStatusResponse | null>(null);
  const [assets, setAssets] = useState<OnlineAssetResponse[]>([]);
  const [hotModules, setHotModules] = useState<OnlineHotModuleResponse[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const [nextStatus, nextAssets, discovery] = await Promise.all([
        fetchOnlineSourceStatus(),
        fetchOnlineAssets(50),
        fetchOnlineDiscovery().catch(() => ({ hotModules: [] }))
      ]);
      setStatus(nextStatus);
      setAssets(nextAssets.assets);
      setHotModules(discovery.hotModules);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (action: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    setErrorMessage(null);
    try {
      setNotice(await action());
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <span className="admin-eyebrow">Online Catalog</span>
          <h1>{t("online.title")}</h1>
          <p>{t("online.description")}</p>
        </div>
        <div className="admin-header-beam" aria-hidden="true">
          <span />
        </div>
        <div className="admin-header-actions">
          <button className="secondary-button" type="button" onClick={() => void load()} disabled={busy}>
            {busy ? t("common.refreshing") : t("online.refresh")}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => void runAction(async () => {
              const result = await pruneOnlineCache();
              return t("online.pruneDone").replace("{evicted}", String(result.evicted));
            })}
          >
            {t("online.prune")}
          </button>
        </div>
      </header>

      {errorMessage ? <p className="room-status-error">{errorMessage}</p> : null}
      {notice ? <p className="online-notice">{notice}</p> : null}

      <section className="room-status-grid" aria-label={t("online.statusAria")}>
        <dl className="room-status-summary">
          <div className={`metric-card ${status?.enabled ? "metric-card--green" : "metric-card--danger"}`}>
            <dt>{t("online.provider")}</dt>
            <dd>{status ? `${status.provider} · ${status.enabled ? t("online.enabled") : t("online.disabled")}` : t("common.loading")}</dd>
          </div>
          <div className="metric-card metric-card--blue">
            <dt>{t("online.cachedItems")}</dt>
            <dd>
              {status
                ? `${status.stats.ready} / ${status.quota.maxItems} · ${formatBytes(status.stats.bytes)}`
                : t("common.loading")}
            </dd>
          </div>
          <div className="metric-card metric-card--magenta">
            <dt>{t("online.pending")}</dt>
            <dd>{status ? `${status.activeJobs} / ${status.pendingJobs}` : t("common.loading")}</dd>
          </div>
          <div className="metric-card metric-card--green">
            <dt>{t("online.evictions")}</dt>
            <dd>{status ? status.metrics.evictions : t("common.loading")}</dd>
          </div>
          <div className="metric-card metric-card--danger">
            <dt>{t("online.failures")}</dt>
            <dd>{status ? `${status.stats.failed} / ${status.stats.unavailable}` : t("common.loading")}</dd>
          </div>
        </dl>
        {status ? (
          <p className="online-cache-dir">
            <code>{status.cacheDir}</code>
          </p>
        ) : null}
      </section>

      <section className="room-status-panel" aria-label={t("online.importAria")}>
        <h2>{t("online.importTitle")}</h2>
        <form
          className="online-import-form"
          onSubmit={(event) => {
            event.preventDefault();
            const keyword = query.trim();
            if (!keyword) {
              return;
            }
            void runAction(async () => {
              const result = await importOnlineByQuery({ query: keyword, limit });
              return t("online.importQueued").replace("{count}", String(result.queued));
            });
          }}
        >
          <input
            className="search-input"
            aria-label={t("online.importPlaceholder")}
            placeholder={t("online.importPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <label className="online-limit">
            <span>{t("online.limit")}</span>
            <input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(event) => setLimit(clampLimit(event.currentTarget.value))}
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy || !query.trim()}>
            {t("online.importSubmit")}
          </button>
        </form>
      </section>

      {hotModules.length > 0 ? (
        <section className="room-status-panel" aria-label={t("online.discoveryTitle")}>
          <h2>{t("online.discoveryTitle")}</h2>
          <ul className="online-module-list">
            {hotModules.map((module) => {
              const packageType = module.objectType ? packageTypeByObject[module.objectType] : undefined;
              return (
                <li key={module.headId}>
                  <div>
                    <strong>{module.title}</strong>
                    <small>{module.subTitle}</small>
                  </div>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    disabled={busy || !packageType || !module.objectId}
                    onClick={() => {
                      const packageId = module.objectId;
                      if (!packageType || !packageId) {
                        return;
                      }
                      void runAction(async () => {
                        const result = await importOnlineByPackage({
                          packageType,
                          packageId,
                          limit
                        });
                        return t("online.importQueued").replace("{count}", String(result.queued));
                      });
                    }}
                  >
                    {t("online.loadModule")}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="room-status-panel room-status-wide" aria-label={t("online.assetsTitle")}>
        <h2>{t("online.assetsTitle")}</h2>
        <table className="online-asset-table">
          <thead>
            <tr>
              <th>{t("online.colSong")}</th>
              <th>{t("online.colStatus")}</th>
              <th>{t("online.colSize")}</th>
              <th>{t("online.colUpdated")}</th>
              <th aria-label={t("online.colActions")} />
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td>
                  <strong>{readMetadataString(asset.metadata, "title") || asset.providerAssetId}</strong>
                  <small>{readMetadataString(asset.metadata, "artistName")}</small>
                </td>
                <td>
                  <span className={`online-status online-status--${asset.status}`}>{asset.status}</span>
                  {asset.errorReason ? <small>{asset.errorReason}</small> : null}
                </td>
                <td>{asset.cacheBytes == null ? "—" : formatBytes(asset.cacheBytes)}</td>
                <td>{asset.catalogSongId ?? "—"}</td>
                <td>
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    disabled={busy || asset.status !== "ready"}
                    onClick={() => void runAction(async () => {
                      await evictOnlineAsset(asset.id);
                      return t("online.evictDone");
                    })}
                  >
                    {t("online.evict")}
                  </button>
                </td>
              </tr>
            ))}
            {assets.length === 0 ? (
              <tr>
                <td colSpan={5}>{t("online.assetsEmpty")}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function clampLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return Math.min(50, Math.max(1, parsed));
}
