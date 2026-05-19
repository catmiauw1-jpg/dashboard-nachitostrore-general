import { useMemo, useState } from "react";
import type { ChartData, MonthKey, Period } from "@/types";
import { capitalize, formatCurrency, months } from "@/lib/format";

interface PerformanceChartProps {
  data: ChartData;
}

const periodCopy: Record<Period, { title: string; description: (month: MonthKey) => string }> = {
  weekly: {
    title: "Rendimiento semanal",
    description: () => "Ventas en bolivianos y cantidad de prendas vendidas por día."
  },
  monthly: {
    title: "Rendimiento mensual",
    description: (month) => `Ventas en bolivianos y prendas vendidas durante ${capitalize(month)}.`
  },
  yearly: {
    title: "Rendimiento anual",
    description: () => "Comparación mensual de ventas, prendas y pedidos del año."
  }
};

export function PerformanceChart({ data }: PerformanceChartProps) {
  const [period, setPeriod] = useState<Period>("weekly");
  const [month, setMonth] = useState<MonthKey>("marzo");
  const [isMonthOpen, setIsMonthOpen] = useState(false);

  const currentData = period === "monthly" ? data.monthly[month] : data[period];
  const maxSales = Math.max(...currentData.map((item) => item.ventas));

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

      <div className="chart-shell">
        <div className="chart-summary">
          <span className="mini-stat">{formatCurrency(totals.ventas)} vendidos</span>
          <span className="mini-stat">{totals.prendas} prendas</span>
          <span className="mini-stat">{totals.pedidos} pedidos</span>
        </div>
        <div className={`chart ${period === "yearly" ? "yearly" : ""}`}>
          {currentData.map((item) => {
            const height = Math.round((item.ventas / maxSales) * 185);

            return (
              <div className="bar-wrap" key={item.label}>
                <div className="bar-value">
                  {formatCurrency(item.ventas)}
                  <span>{item.prendas} prendas</span>
                </div>
                <div
                  aria-label={`${item.label}: ${formatCurrency(item.ventas)}, ${item.prendas} prendas, ${item.pedidos} pedidos`}
                  className="bar"
                  style={{ height }}
                  title={`${item.label}: ${formatCurrency(item.ventas)} · ${item.prendas} prendas · ${item.pedidos} pedidos`}
                />
                <div className="bar-day">{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
