import { useMemo, useState } from "react";
import { capitalize, formatCurrency, months } from "@/lib/format";
import type { ChartData, ChartPoint, MonthKey, Period } from "@/types";

interface PerformanceChartProps {
  data: ChartData;
}

const chartWidth = 1040;
const chartHeight = 260;
const chartPadding = { top: 18, right: 48, bottom: 34, left: 54 };

function pointsFor(data: ChartPoint[], maxSales: number) {
  const innerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const gap = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;

  return data.map((item, index) => ({
    ...item,
    x: chartPadding.left + gap * index,
    y: chartPadding.top + innerHeight - (item.ventas / maxSales) * innerHeight
  }));
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    return `${path} C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  const [period, setPeriod] = useState<Period>("weekly");
  const [month, setMonth] = useState<MonthKey>(months[new Date().getMonth()] ?? "enero");
  const [isMonthOpen, setIsMonthOpen] = useState(false);

  const currentData = period === "monthly" ? data.monthly[month] : data[period];
  const maxSales = Math.max(100, ...currentData.map((item) => item.ventas));
  const maxGarments = Math.max(1, ...currentData.map((item) => item.prendas));
  const points = pointsFor(currentData, maxSales);
  const linePath = smoothPath(points);
  const baseline = chartHeight - chartPadding.bottom;
  const lastPoint = points[points.length - 1];
  const areaPath = points.length ? `${linePath} L ${lastPoint.x} ${baseline} L ${points[0].x} ${baseline} Z` : "";
  const bestPoint = currentData.reduce(
    (best, item) => (item.ventas > best.ventas ? item : best),
    currentData[0] ?? { label: "Sin datos", ventas: 0, prendas: 0, pedidos: 0 }
  );
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
  const ticks = [1, 0.8, 0.6, 0.4, 0.2, 0];

  return (
    <article className="panel perf-card">
      <div className="panel-header">
        <div>
          <h3>Rendimiento de ventas</h3>
          <p>Ventas en Bs y prendas vendidas por periodo</p>
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
                <span>v</span>
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

      <div className="perf-body">
        <div className="performance-summary">
          <div>
            <span>Total vendido</span>
            <strong>{formatCurrency(totals.ventas)}</strong>
            <small>{period === "weekly" ? "Esta semana" : period === "monthly" ? "Periodo mensual" : "Este ano"}</small>
          </div>
          <div>
            <span>Prendas</span>
            <strong>{totals.prendas}</strong>
            <small>Unidades vendidas</small>
          </div>
          <div>
            <span>Pedidos</span>
            <strong>{totals.pedidos}</strong>
            <small>Ordenes registradas</small>
          </div>
          <div>
            <span>Mejor periodo</span>
            <strong>{bestPoint.ventas > 0 ? bestPoint.label : "Sin ventas"}</strong>
            <small>Mayor volumen de venta</small>
          </div>
        </div>

        <div className="chart-wrap">
          <svg aria-label="Grafico de rendimiento" className="sales-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img">
            {ticks.map((tick) => {
              const y = chartPadding.top + (1 - tick) * (chartHeight - chartPadding.top - chartPadding.bottom);
              return (
                <g key={tick}>
                  <line className="chart-grid-line" x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y} y2={y} />
                  <text className="chart-y-label" x={chartPadding.left - 10} y={y + 4} textAnchor="end">
                    {Math.round(maxSales * tick)} Bs
                  </text>
                  <text className="chart-y-label chart-y-label-right" x={chartWidth - chartPadding.right + 12} y={y + 4}>
                    {Math.round(maxGarments * tick)} u.
                  </text>
                </g>
              );
            })}

            {currentData.map((item, index) => {
              const point = points[index];
              const barHeight = item.ventas > 0 ? Math.max(14, baseline - point.y) : 0;
              return (
                <g key={item.label}>
                  {barHeight ? (
                    <rect
                      className="chart-sales-bar"
                      height={barHeight}
                      rx="5"
                      width="96"
                      x={point.x - 48}
                      y={baseline - barHeight}
                    />
                  ) : null}
                  <text className="chart-x-label" textAnchor="middle" x={point.x} y={chartHeight - 10}>
                    {item.label}
                  </text>
                </g>
              );
            })}

            <path className="chart-area" d={areaPath} />
            <path className="chart-line" d={linePath} />
            {points.map((point) => (
              <circle className="chart-point" cx={point.x} cy={point.y} key={`${point.label}-${point.x}`} r="4" />
            ))}
          </svg>

          <div className="chart-legend">
            <span><i className="legend-dot prendas" />Prendas vendidas</span>
            <span><i className="legend-dot ventas" />Ventas (Bs)</span>
          </div>
        </div>
      </div>
    </article>
  );
}
