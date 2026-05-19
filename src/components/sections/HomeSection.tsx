import { CriticalStockPanel } from "@/components/CriticalStockPanel";
import { MetricCards } from "@/components/MetricCards";
import { PerformanceChart } from "@/components/PerformanceChart";
import { RecentOrdersTable } from "@/components/RecentOrdersTable";
import { WhatsAppBotPanel } from "@/components/WhatsAppBotPanel";
import type { ChartData, Conversation, Metric, Order, StockItem } from "@/types";

interface HomeSectionProps {
  chartData: ChartData;
  chats: Conversation[];
  metrics: Metric[];
  orders: Order[];
  stock: StockItem[];
  onOpenConversations: () => void;
  onToggleBot: (index: number) => void;
}

export function HomeSection({
  chartData,
  chats,
  metrics,
  orders,
  stock,
  onOpenConversations,
  onToggleBot
}: HomeSectionProps) {
  return (
    <>
      <MetricCards metrics={metrics} />

      <section className="dashboard-grid">
        <PerformanceChart data={chartData} />
        <CriticalStockPanel stock={stock} />
      </section>

      <section className="dashboard-grid">
        <RecentOrdersTable orders={orders} />
        <WhatsAppBotPanel
          chats={chats}
          onOpenConversations={onOpenConversations}
          onToggleBot={onToggleBot}
        />
      </section>
    </>
  );
}
