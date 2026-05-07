import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ImportWorkbench } from "./imports/ImportWorkbench.js";
import { RoomStatusView } from "./rooms/RoomStatusView.js";
import { SongCatalogView } from "./songs/SongCatalogView.js";

type AdminView = "imports" | "songs" | "rooms";

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [view, setView] = useState<AdminView>("imports");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="admin-app-frame">
        <nav className="admin-mode-tabs" aria-label="Admin sections">
          <button className={view === "imports" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("imports")}>
            Imports
          </button>
          <button className={view === "songs" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("songs")}>
            Songs
          </button>
          <button className={view === "rooms" ? "mode-tab active" : "mode-tab"} type="button" onClick={() => setView("rooms")}>
            Rooms
          </button>
        </nav>
        {view === "imports" ? <ImportWorkbench /> : view === "songs" ? <SongCatalogView /> : <RoomStatusView />}
      </div>
    </QueryClientProvider>
  );
}
