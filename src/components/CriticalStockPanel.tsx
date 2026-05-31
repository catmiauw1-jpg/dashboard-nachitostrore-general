import { IconPackage } from "@tabler/icons-react";
import { displayStockName } from "@/lib/format";
import type { StockItem } from "@/types";

interface CriticalStockPanelProps {
  stock: StockItem[];
  onOpenStock: () => void;
}

export function CriticalStockPanel({ stock, onOpenStock }: CriticalStockPanelProps) {
  const orderedStock = [...stock]
    .sort((first, second) => {
      const firstCritical = first.available <= first.min ? 0 : 1;
      const secondCritical = second.available <= second.min ? 0 : 1;
      return firstCritical - secondCritical || first.available - second.available;
    })
    .slice(0, 4);

  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <h3><IconPackage size={17} stroke={1.7} />Stock bajo</h3>
          <p>Prendas que necesitan reposicion</p>
        </div>
      </div>

      <div className="stock-list">
        {orderedStock.map((item) => {
          const isLow = item.available <= item.min;

          return (
            <div className="stock-item" key={item.item}>
              <div>
                <div className="stock-name">{displayStockName(item.item).replace(/\s+[MLX]+$/i, "")}</div>
                <div className="stock-size">Talla {item.size}</div>
              </div>
              <div className="stock-right">
                <span className="stock-qty">{item.available}</span>
                <span className={`badge ${isLow ? "badge-low" : "success"}`}>{isLow ? "Bajo" : "OK"}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-footer">
        <button className="link-btn" onClick={onOpenStock} type="button">Ver estado de stock -&gt;</button>
      </div>
    </article>
  );
}
