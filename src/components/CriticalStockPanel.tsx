import { badgeClass, displayStockName } from "@/lib/format";
import type { StockItem } from "@/types";

interface CriticalStockPanelProps {
  stock: StockItem[];
}

export function CriticalStockPanel({ stock }: CriticalStockPanelProps) {
  const lowStock = stock.filter((item) => item.available <= item.min).length;

  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <h3>Stock crítico</h3>
          <p>Prendas que están por debajo del mínimo recomendado.</p>
        </div>
        <span className="badge danger">{lowStock} bajos</span>
      </div>

      <div className="stock-list">
        {stock.map((item) => {
          const status = item.available <= item.min ? "Bajo" : "OK";

          return (
            <div className="stock-item" key={item.item}>
              <div>
                <h4>{displayStockName(item.item)}</h4>
                <p>
                  Mínimo sugerido: {item.min} · Disponible: {item.available}
                </p>
              </div>
              <div className="stock-meta">
                <span className="stock-number">{item.available}</span>
                <span className={`badge ${badgeClass(status)}`}>{status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
