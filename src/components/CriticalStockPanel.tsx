import { badgeClass, displayStockName } from "@/lib/format";
import type { StockItem } from "@/types";

interface CriticalStockPanelProps {
  stock: StockItem[];
}

export function CriticalStockPanel({ stock }: CriticalStockPanelProps) {
  const lowStock = stock.filter((item) => item.available <= item.min).length;
  const orderedStock = [...stock].sort((first, second) => {
    const firstCritical = first.available <= first.min ? 0 : 1;
    const secondCritical = second.available <= second.min ? 0 : 1;
    return firstCritical - secondCritical || first.available - second.available;
  });

  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <h3>Estado de stock</h3>
          <p>Prendas base disponibles para producir pedidos.</p>
        </div>
        <span className={`badge ${lowStock ? "danger" : "success"}`}>{lowStock} bajos</span>
      </div>

      <div className="stock-list">
        {orderedStock.map((item) => {
          const status = item.available <= item.min ? "Bajo" : "OK";

          return (
            <div className="stock-item" key={item.item}>
              <div>
                <h4>{displayStockName(item.item)}</h4>
                <p>
                  Minimo sugerido: {item.min} - Disponible: {item.available}
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
