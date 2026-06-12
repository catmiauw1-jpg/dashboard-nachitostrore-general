import { IconBasket, IconCoins, IconCurrencyDollar, IconTrendingUp } from "@tabler/icons-react";
import { CriticalStockPanel } from "@/components/CriticalStockPanel";
import { PerformanceChart } from "@/components/PerformanceChart";
import { RecentOrdersTable } from "@/components/RecentOrdersTable";
import { WhatsAppBotPanel } from "@/components/WhatsAppBotPanel";
import type { ChartData, Conversation, Metric, Order, SectionKey, StockItem } from "@/types";

interface HomeSectionProps {
  chartData: ChartData;
  chats: Conversation[];
  metrics: Metric[];
  orders: Order[];
  stock: StockItem[];
  onNavigate: (section: SectionKey) => void;
  onOpenConversations: () => void;
  onToggleBot: (index: number) => void;
}

export function HomeSection({
  chartData,
  chats,
  metrics,
  orders,
  stock,
  onNavigate,
  onOpenConversations,
  onToggleBot
}: HomeSectionProps) {
  const activeOrders = orders.filter((order) => order.status !== "Cancelado" && order.status !== "Entregado");
  const pendingPayments = activeOrders.filter((order) => order.payment !== "Pago completo");
  const inProduction = activeOrders.filter((order) => order.status.toLowerCase().includes("prepar"));
  const lowStock = stock.filter((item) => item.available <= item.min);
  const attentionChats = chats.filter((chat) => chat.alert || !chat.bot);
  const summaryCards = [
    {
      label: activeOrders.length === 1 ? "Pedido activo hoy" : "Pedidos activos hoy",
      value: String(activeOrders.length),
      sub: "En cobro, preparación o entrega",
      tag: activeOrders.length ? "Activo" : "Al día",
      tone: activeOrders.length ? "featured" : "",
      Icon: IconBasket
    },
    ...metrics
      .filter((metric) => metric.label !== "Pendientes")
      .slice(0, 3)
      .map((metric, index) => ({
        label: metric.label,
        value: metric.value,
        sub: metric.details.join(" - "),
        tag: index === 0 ? "Hoy" : index === 1 ? "7 días" : "Est.",
        tone: "",
        Icon: index === 0 ? IconCurrencyDollar : index === 1 ? IconTrendingUp : IconCoins
      }))
  ];

  return (
    <section className="home-workspace">
      <section>
        <div className="home-section-head">
          <span>Resumen de hoy</span>
          <small>Actualizado ahora</small>
        </div>
        <div className="stats-grid">
          {summaryCards.map((card, index) => (
            <article className={`stat-card ${card.tone}`} key={card.label}>
              <div className="stat-top">
                <span className={`stat-icon-wrap icon-${index === 0 ? "purple" : index === 1 ? "green" : index === 2 ? "blue" : "amber"}`}>
                  <card.Icon size={18} stroke={1.8} />
                </span>
                <span className={`stat-trend ${index === 0 && activeOrders.length ? "trend-warn" : index === 0 ? "trend-up" : "trend-neutral"}`}>
                  {card.tag}
                </span>
              </div>
              <strong className="stat-value">{card.value}</strong>
              <span className="stat-label">{card.label}</span>
              <small className="stat-sub">{card.sub}</small>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="home-section-head">
          <span>Qué necesita atención</span>
        </div>
        <div className="attention-grid">
          <button className="attention-card attention-action" onClick={() => onNavigate("pedidos")} type="button">
            <span className={`attention-dot ${pendingPayments.length ? "dot-warn" : "dot-ok"}`} />
            <div className="attention-body">
              <strong>Pedidos por cobrar</strong>
              <p>{pendingPayments.length ? "Pedidos sin pago completo." : "Sin pagos pendientes."}</p>
            </div>
            <span className="attention-count">{pendingPayments.length}</span>
          </button>
          <button className="attention-card attention-action" onClick={() => onNavigate("pedidos")} type="button">
            <span className="attention-dot dot-action" />
            <div className="attention-body">
              <strong>En preparación</strong>
              <p>Trabajos que necesitan producción.</p>
            </div>
            <span className="attention-count">{inProduction.length}</span>
          </button>
          <button className="attention-card attention-action" onClick={() => onNavigate("stock")} type="button">
            <span className={`attention-dot ${lowStock.length ? "dot-warn" : "dot-ok"}`} />
            <div className="attention-body">
              <strong>Stock bajo</strong>
              <p>{lowStock.length ? "Prendas con pocas unidades." : "Inventario dentro del mínimo."}</p>
            </div>
            <span className="attention-count">{lowStock.length}</span>
          </button>
          <button className="attention-card attention-action" onClick={() => onNavigate("whatsapp")} type="button">
            <span className={`attention-dot ${attentionChats.length ? "dot-info" : "dot-ok"}`} />
            <div className="attention-body">
              <strong>Chats manuales</strong>
              <p>{attentionChats.length ? "Conversaciones para revisar." : "Bot sin alertas visibles."}</p>
            </div>
            <span className="attention-count">{attentionChats.length}</span>
          </button>
        </div>
      </section>

      <PerformanceChart data={chartData} />

      <section className="bottom-row">
        <RecentOrdersTable orders={orders} onOpenOrders={() => onNavigate("pedidos")} />
        <aside className="right-col">
          <WhatsAppBotPanel
            chats={chats}
            onOpenConversations={() => onNavigate("whatsapp")}
            onToggleBot={onToggleBot}
          />
          <CriticalStockPanel stock={stock} onOpenStock={() => onNavigate("stock")} />
        </aside>
      </section>
    </section>
  );
}
