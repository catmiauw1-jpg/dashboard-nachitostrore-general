import { useMemo, useState } from "react";
import { capitalize, formatCurrency, months } from "@/lib/format";
import type { ChartData, MonthKey, Period } from "@/types";

interface PerformanceChartProps {
  data: ChartData;
}

const periodCopy: Record<Period, { title: string; description: (month: MonthKey) => string }> = {
  weekly: {
    title: "Rendimiento semanal",
    description: () => "Resumen de ventas, pedidos y prendas por día."
  },
  monthly: {
    title: "Rendimiento mensual",
    description: (month) => `Resumen de ventas, pedidos y prendas durante ${capitalize(month)}.`
  },
  yearly: {
    title: "Rendimiento anual",
    description: () => "Resumen mensual de ventas, pedidos y prendas del año."
  }
};

export function PerformanceChart({ data }: PerformanceChartProps) {
  const [period, setPeriod] = useState<Period>("weekly");
  const [month, setMonth] = useState<MonthKey>(months[new Date().getMonth()] ?? "enero");
  const [isMonthOpen, setIsMonthOpen] = useState(false);

  const currentData = period === "monthly" ? data.monthly[month] : data[period];
  const maxSales = Math.max(1, ...currentData.map((item) => item.ventas));

  const totals = useMemo(
    () =>
      currentData.reduce(
        (summary, item) => ({
          ventas: summary.ventas + item.ventas,
          prendas: summary.prendas + item.prendas,
          pedidos: summary.pedidos + item.pedidos
        }),
        { ventas: 0, prendas: 0, pedidos: 0 }
      ),
    [currentData]
  );
  const bestPoint = currentData.reduce(
    (best, item) => (item.ventas > best.ventas ? item : best),
    currentData[0] ?? { label: "Sin datos", ventas: 0, prendas: 0, pedidos: 0 }
  );

  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <h3>{periodCopy[period].title}</h3>
          <p>{periodCopy[period].description(month)}</p>
        </div>

        <div className="chart-controls">
          <div className="period-switch">
            {(["weekly", "monthly", "yearly"] as Period[]).map((periodOption) => (
              <button
                className={`period-btn ${period === periodOption ? "active" : ""}`}
                key={periodOption}
                onClick={() => setPeriod(periodOption)}
                type="button"
              >
                {periodOption === "weekly" ? "Semanal" : periodOption === "monthly" ? "Mensual" : "Anual"}
              </button>
            ))}
          </div>

          {period === "monthly" ? (
            <div className={`custom-month ${isMonthOpen ? "open" : ""}`}>
              <button
                className="custom-month-btn"
                onClick={() => setIsMonthOpen((value) => !value)}
                type="button"
              >
                <span>{capitalize(month)}</span>
                <span>⌄</span>
              </button>
              <div className="custom-month-menu">
                {months.map((monthOption) => (
                  <button
                    className={`custom-month-option ${month === monthOption ? "active" : ""}`}
                    key={monthOption}
                    onClick={() => {
                      setMonth(monthOption);
                      setIsMonthOpen(false);
                    }}
                    type="button"
                  >
                    {capitalize(monthOption)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="chart-shell performance-shell">
        <div className="performance-summary">
          <div>
            <span>Total vendido</span>
            <strong>{formatCurrency(totals.ventas)}</strong>
          </div>
          <div>
            <span>Prendas</span>
            <strong>{totals.prendas}</strong>
          </div>
          <div>
            <span>Pedidos</span>
            <strong>{totals.pedidos}</strong>
          </div>
          <div>
            <span>Mejor resultado</span>
            <strong>{bestPoint.ventas > 0 ? bestPoint.label : "Sin ventas"}</strong>
          </div>
        </div>

        <div className="performance-list">
          {currentData.map((item) => {
            const width = Math.max(4, Math.round((item.ventas / maxSales) * 100));

            return (
              <div className="performance-row" key={item.label}>
                <div className="performance-row-label">
                  <strong>{item.label}</strong>
                  <span>{item.pedidos} {item.pedidos === 1 ? "pedido" : "pedidos"}</span>
                </div>
                <div className="performance-track">
                  <div
                    aria-label={`${item.label}: ${formatCurrency(item.ventas)}, ${item.prendas} prendas, ${item.pedidos} pedidos`}
                    className="performance-fill"
                    style={{ width: `${width}%` }}
                    title={`${item.label}: ${formatCurrency(item.ventas)} · ${item.prendas} prendas · ${item.pedidos} pedidos`}
                  />
                </div>
                <div className="performance-row-value">
                  <strong>{formatCurrency(item.ventas)}</strong>
                  <span>{item.prendas} prendas</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
