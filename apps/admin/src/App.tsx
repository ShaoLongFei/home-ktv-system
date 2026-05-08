import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ImportWorkbench } from "./imports/ImportWorkbench.js";
import { I18nProvider, LanguageSwitch, useI18n } from "./i18n.js";
import { RoomStatusView } from "./rooms/RoomStatusView.js";
import { SongCatalogView } from "./songs/SongCatalogView.js";

type AdminView = "imports" | "songs" | "rooms";

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
  const [view, setView] = useState<AdminView>("imports");

  return (
    <div className="admin-app-frame">
      <nav className="admin-mode-tabs" aria-label={t("app.nav.aria")}>
        <button className={view === "imports" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("imports")}>
          {t("app.nav.imports")}
        </button>
        <button className={view === "songs" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("songs")}>
          {t("app.nav.songs")}
        </button>
        <button className={view === "rooms" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("rooms")}>
          {t("app.nav.rooms")}
        </button>
        <LanguageSwitch />
      </nav>
      {view === "imports" ? <ImportWorkbench /> : view === "songs" ? <SongCatalogView /> : <RoomStatusView />}
    </div>
  );
}
