interface TopbarProps {
  isDark: boolean;
  onRegisterOrder: () => void;
  onToggleTheme: () => void;
}

export function Topbar({ isDark, onRegisterOrder, onToggleTheme }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="business-pill">
        <span className="live-dot" />
        Datos de ejemplo · actualización en tiempo real
      </div>
      <div className="actions">
        <button className="btn primary" onClick={onRegisterOrder} type="button">
          Registrar pedido
        </button>
        <button
          aria-label="Cambiar tema"
          className="btn icon"
          onClick={onToggleTheme}
          title="Cambiar tema"
          type="button"
        >
          {isDark ? "☀" : "☾"}
        </button>
      </div>
    </div>
  );
}
