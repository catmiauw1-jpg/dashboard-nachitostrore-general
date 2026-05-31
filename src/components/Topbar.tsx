import { IconMoon, IconPlus, IconSun, IconUserCircle } from "@tabler/icons-react";

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
          <IconUserCircle size={16} stroke={1.7} />
          {adminEmail}
        </div>
        <button className="btn primary" onClick={onRegisterOrder} type="button">
          <IconPlus size={16} stroke={1.9} />
          Registrar pedido
        </button>
        <button
          aria-label="Cambiar tema"
          className="btn icon"
          onClick={onToggleTheme}
          title="Cambiar tema"
          type="button"
        >
          {isDark ? <IconSun size={17} stroke={1.8} /> : <IconMoon size={17} stroke={1.8} />}
        </button>
        <button className="btn ghost" onClick={onSignOut} type="button">
          Salir
        </button>
      </div>
    </div>
  );
}
