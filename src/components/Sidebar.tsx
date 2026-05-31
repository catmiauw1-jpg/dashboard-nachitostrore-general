import type { NavigationItem, SectionKey } from "@/types";

interface SidebarProps {
  activeSection: SectionKey;
  items: NavigationItem[];
  onSelect: (section: SectionKey) => void;
}

export function Sidebar({ activeSection, items, onSelect }: SidebarProps) {
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const groups: Array<{ label: string; keys: SectionKey[] }> = [
    { label: "Dashboard", keys: ["inicio"] },
    { label: "Ventas", keys: ["pedidos", "productos", "clientes"] },
    { label: "Operaciones", keys: ["stock", "gastos", "historial"] },
    { label: "Automatizacion", keys: ["whatsapp", "configuracion"] }
  ];
  const glyphs: Record<SectionKey, string> = {
    inicio: "IN",
    pedidos: "PE",
    historial: "HI",
    productos: "PR",
    stock: "ST",
    clientes: "CL",
    gastos: "GA",
    whatsapp: "WA",
    configuracion: "CO"
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">PF</div>
        <div>
          <h1>PoleraFlow</h1>
          <p>Operaciones del negocio</p>
        </div>
      </div>

      <nav className="menu" aria-label="Navegacion principal">
        {groups.map((group) => (
          <div className="menu-group" key={group.label}>
            <p className="menu-label">{group.label}</p>
            {group.keys.map((key) => {
              const item = itemByKey.get(key);
              if (!item) return null;

              return (
                <button
                  aria-current={activeSection === item.key ? "page" : undefined}
                  className={activeSection === item.key ? "active" : undefined}
                  key={item.key}
                  onClick={() => onSelect(item.key)}
                  type="button"
                >
                  <span className="menu-icon">{glyphs[item.key]}</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-card">
        <span className="status-dot" />
        <strong>Bot activo</strong>
        <p>Pedidos, stock y clientes conectados con Nachito Store.</p>
      </div>
    </aside>
  );
}
