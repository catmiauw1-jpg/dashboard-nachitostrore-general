interface TopbarProps {
  adminEmail: string;
  isDark: boolean;
  onRegisterOrder: () => void;
  onSignOut: () => void | Promise<void>;
  onToggleTheme: () => void;
}

export function Topbar({ adminEmail, isDark, onRegisterOrder, onSignOut, onToggleTheme }: TopbarProps) {
  const today = new Intl.DateTimeFormat("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div>
          <h2>Buenos dias</h2>
          <p>{today}</p>
        </div>
      </div>
      <div className="actions">
        <div className="business-pill">
          <span className="live-dot" />
          {adminEmail}
        </div>
        <button className="btn primary" onClick={onRegisterOrder} type="button">
          + Registrar pedido
        </button>
        <button
          aria-label="Cambiar tema"
          className="btn icon"
          onClick={onToggleTheme}
          title="Cambiar tema"
          type="button"
        >
          {isDark ? "*" : "D"}
        </button>
        <button className="btn ghost" onClick={onSignOut} type="button">
          Salir
        </button>
      </div>
    </div>
  );
}
