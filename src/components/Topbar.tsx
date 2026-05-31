interface TopbarProps {
  adminEmail: string;
  isDark: boolean;
  onRegisterOrder: () => void;
  onSignOut: () => void | Promise<void>;
  onToggleTheme: () => void;
}

export function Topbar({ adminEmail, isDark, onRegisterOrder, onSignOut, onToggleTheme }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="business-pill">
        <span className="live-dot" />
        Admin: {adminEmail}
      </div>
      <div className="actions">
        <button className="btn primary" onClick={onRegisterOrder} type="button">
          Registrar pedido
        </button>
        <button className="btn ghost" onClick={onSignOut} type="button">
          Salir
        </button>
        <button
          aria-label="Cambiar tema"
          className="btn icon"
          onClick={onToggleTheme}
          title="Cambiar tema"
          type="button"
        >
          {isDark ? "Sol" : "Luna"}
        </button>
      </div>
    </div>
  );
}
