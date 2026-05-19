import type { NavigationItem, SectionKey } from "@/types";

interface SidebarProps {
  activeSection: SectionKey;
  items: NavigationItem[];
  onSelect: (section: SectionKey) => void;
}

export function Sidebar({ activeSection, items, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">PF</div>
        <div>
          <h1>PoleraFlow</h1>
          <p>Operaciones del negocio</p>
        </div>
      </div>

      <p className="menu-label">Menú principal</p>
      <nav className="menu" aria-label="Navegación principal">
        {items.map((item) => (
          <button
            aria-current={activeSection === item.key ? "page" : undefined}
            className={activeSection === item.key ? "active" : undefined}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            <span className="menu-icon">{item.index}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <span>Estado del sistema</span>
        <p>Bot activo en 2 chats. 1 conversación requiere revisión manual por falta de comprobante.</p>
      </div>
    </aside>
  );
}
