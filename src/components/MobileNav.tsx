import {
  IconBrandWhatsapp,
  IconHistory,
  IconHome,
  IconPackage,
  IconReceipt,
  IconShoppingBag,
  IconShirt,
  IconUsers
} from "@tabler/icons-react";
import type { NavigationItem, SectionKey } from "@/types";

interface MobileNavProps {
  activeSection: SectionKey;
  items: NavigationItem[];
  onSelect: (section: SectionKey) => void;
}

export function MobileNav({ activeSection, items, onSelect }: MobileNavProps) {
  const icons: Partial<Record<SectionKey, typeof IconHome>> = {
    inicio: IconHome,
    pedidos: IconShoppingBag,
    productos: IconShirt,
    clientes: IconUsers,
    stock: IconPackage,
    gastos: IconReceipt,
    historial: IconHistory,
    whatsapp: IconBrandWhatsapp
  };

  return (
    <div className="mobile-menu">
      <strong>PoleraFlow</strong>
      <div className="mobile-menu-scroll" aria-label="Navegacion movil">
        {items.slice(0, 8).map((item) => {
          const Icon = icons[item.key];

          return (
            <button
              className={activeSection === item.key ? "active" : undefined}
              key={item.key}
              onClick={() => onSelect(item.key)}
              type="button"
            >
              {Icon ? <Icon size={16} stroke={1.8} /> : null}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
