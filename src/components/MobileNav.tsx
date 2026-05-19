import type { NavigationItem, SectionKey } from "@/types";

interface MobileNavProps {
  activeSection: SectionKey;
  items: NavigationItem[];
  onSelect: (section: SectionKey) => void;
}

export function MobileNav({ activeSection, items, onSelect }: MobileNavProps) {
  return (
    <div className="mobile-menu">
      <strong>PoleraFlow</strong>
      <div className="mobile-menu-scroll" aria-label="Navegación móvil">
        {items.slice(0, 8).map((item) => (
          <button
            className={activeSection === item.key ? "active" : undefined}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
