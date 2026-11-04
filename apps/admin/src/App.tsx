import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AdminDashboardView } from "./dashboard/AdminDashboardView.js";
import { I18nProvider, LanguageSwitch, useI18n } from "./i18n.js";
import { OnlineSourceView } from "./online/OnlineSourceView.js";
import { RoomStatusView } from "./rooms/RoomStatusView.js";
import { SongCatalogView } from "./songs/SongCatalogView.js";

type AdminView = "dashboard" | "songs" | "online" | "rooms";

export function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <I18nProvider defaultLanguage="zh">
      <QueryClientProvider client={queryClient}>
        <AdminAppContent />
      </QueryClientProvider>
    </I18nProvider>
  );
}

function AdminAppContent() {
  const { t } = useI18n();
  const [view, setView] = useState<AdminView>("dashboard");

  return (
    <div className="admin-app-frame">
      <div className="admin-light-field" aria-hidden="true" />
      <nav className="admin-mode-tabs" aria-label={t("app.nav.aria")}>
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true" />
          <span>
            <strong>HomeKTV</strong>
            <small>Neon Operations</small>
          </span>
        </div>
        <div className="admin-tab-group">
          <button className={view === "dashboard" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("dashboard")}>
            {t("app.nav.dashboard")}
          </button>
          <button className={view === "songs" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("songs")}>
            {t("app.nav.songs")}
          </button>
          <button className={view === "online" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("online")}>
            {t("app.nav.online")}
          </button>
          <button className={view === "rooms" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("rooms")}>
            {t("app.nav.rooms")}
          </button>
        </div>
        <div className="admin-nav-utilities">
          <span className="system-pulse">
            <span aria-hidden="true" />
            Live Sync
          </span>
          <LanguageSwitch />
        </div>
      </nav>
      <div className="admin-view-stage">
        {view === "dashboard" ? (
          <AdminDashboardView />
        ) : view === "songs" ? (
          <SongCatalogView />
        ) : view === "online" ? (
          <OnlineSourceView />
        ) : (
          <RoomStatusView />
        )}
      </div>
    </div>
  );
}
