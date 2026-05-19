import type { SectionDefinition } from "@/data/sectionDefinitions";

interface SectionWorkspaceProps {
  definition: SectionDefinition;
  onPrimaryAction?: () => void;
}

export function SectionWorkspace({ definition, onPrimaryAction }: SectionWorkspaceProps) {
  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">{definition.kicker}</span>
          <h2>{definition.title}</h2>
          <p>{definition.description}</p>
        </div>
        <button className="btn primary" onClick={onPrimaryAction} type="button">
          {definition.primaryAction}
        </button>
      </header>

      <div className="section-summary-grid">
        {definition.summary.map((item) => (
          <article className="section-summary-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>

      <div className="workspace-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h3>{definition.mainPanel.title}</h3>
              <p>{definition.mainPanel.description}</p>
            </div>
            <span className={`badge ${definition.mainPanel.badgeTone}`}>
              {definition.mainPanel.badge}
            </span>
          </div>

          <div className="module-list">
            {definition.mainPanel.items.map((item) => (
              <div className="module-row" key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <span className={`badge ${item.tone}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h3>Próximo paso</h3>
              <p>{definition.nextStep}</p>
            </div>
          </div>
          <div className="ready-box">
            <strong>Preparado para conectar después</strong>
            <p>{definition.futureConnection}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
