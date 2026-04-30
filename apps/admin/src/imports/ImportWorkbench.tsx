export function ImportWorkbench() {
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <h1>Import review workbench</h1>
          <p>Review grouped local media candidates before they enter the formal catalog.</p>
        </div>
        <button className="primary-button" type="button">
          Scan imports
        </button>
      </header>

      <section className="admin-workbench" aria-label="Import candidate workbench">
        <aside className="queue-pane" aria-label="Candidate queue">
          <p className="pane-title">Candidate queue</p>
          <div className="status-strip" aria-label="Candidate statuses">
            <span className="status-chip">
              Pending <strong>0</strong>
            </span>
            <span className="status-chip">
              Held <strong>0</strong>
            </span>
            <span className="status-chip">
              Review <strong>0</strong>
            </span>
            <span className="status-chip">
              Conflict <strong>0</strong>
            </span>
          </div>
          <div className="queue-empty">
            <p>No import candidates loaded.</p>
          </div>
        </aside>

        <section className="detail-pane" aria-label="Candidate detail">
          <div className="editor-empty">
            <h2>Select a candidate</h2>
            <p>Metadata and file review controls will appear here.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
