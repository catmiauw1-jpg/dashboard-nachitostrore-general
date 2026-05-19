import type { Metric } from "@/types";

interface MetricCardsProps {
  metrics: Metric[];
}

export function MetricCards({ metrics }: MetricCardsProps) {
  return (
    <section className="grid-metrics">
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <div className="metric-head">
            <div>
              <span className="metric-label">{metric.label}</span>
              <strong className="metric-value">{metric.value}</strong>
            </div>
            <div className="metric-icon">{metric.icon}</div>
          </div>
          <div className="metric-subgrid">
            {metric.details.map((detail) => (
              <span className="mini-stat" key={detail}>
                {detail}
              </span>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
