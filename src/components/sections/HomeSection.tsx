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
  const activeOrders = orders.filter((order) => order.status !== "Cancelado" && order.status !== "Entregado");
  const pendingPayments = activeOrders.filter((order) => order.payment !== "Pago completo");
  const inProduction = activeOrders.filter((order) => order.status.toLowerCase().includes("prepar"));
  const readyOrders = activeOrders.filter((order) => order.status === "Lista para enviar");
  const customOrders = activeOrders.filter((order) => order.type === "Personalizada");
  const catalogOrders = activeOrders.filter((order) => order.type.toLowerCase().includes("cat"));
  const lowStock = stock.filter((item) => item.available <= item.min);
  const attentionChats = chats.filter((chat) => chat.alert || !chat.bot);

  return (
    <section className="home-workspace">
      <section className="home-command-grid">
        <article className="home-command-card">
          <div>
            <span className="section-kicker">Operacion de hoy</span>
            <h2>{activeOrders.length ? `${activeOrders.length} pedidos activos` : "Sin pedidos activos"}</h2>
            <p>
              {activeOrders.length
                ? "Prioriza cobros, preparacion y entregas pendientes."
                : "Cuando entre un pedido desde Nachito Store, aparecera aqui para atenderlo."}
            </p>
          </div>

          <div className="home-command-stats">
            <div>
              <span>Catalogo</span>
              <strong>{catalogOrders.length}</strong>
            </div>
            <div>
              <span>Personalizadas</span>
              <strong>{customOrders.length}</strong>
            </div>
            <div>
              <span>Listas</span>
              <strong>{readyOrders.length}</strong>
            </div>
          </div>
        </article>

        <aside className="home-focus-panel">
          <article>
            <span className="focus-dot warning" />
            <div>
              <strong>{pendingPayments.length} por cobrar</strong>
              <p>Pedidos sin pago completo.</p>
            </div>
          </article>
          <article>
            <span className="focus-dot accent" />
            <div>
              <strong>{inProduction.length} en preparacion</strong>
              <p>Trabajos que necesitan produccion.</p>
            </div>
          </article>
          <article>
            <span className={`focus-dot ${lowStock.length ? "danger" : "success"}`} />
            <div>
              <strong>{lowStock.length} stock bajo</strong>
              <p>{lowStock.length ? "Revisa prendas disponibles." : "Inventario dentro del minimo."}</p>
            </div>
          </article>
          <article>
            <span className={`focus-dot ${attentionChats.length ? "danger" : "success"}`} />
            <div>
              <strong>{attentionChats.length} chats manuales</strong>
              <p>{attentionChats.length ? "Conversaciones para revisar." : "Bot sin alertas visibles."}</p>
            </div>
          </article>
        </aside>
      </section>

      <MetricCards metrics={metrics} />

      <section className="home-insights-grid">
        <div className="home-main-panel">
          <PerformanceChart data={chartData} />
        </div>
        <aside className="home-side-stack">
          <CriticalStockPanel stock={stock} />
          <WhatsAppBotPanel
            chats={chats}
            onOpenConversations={onOpenConversations}
            onToggleBot={onToggleBot}
          />
        </aside>
      </section>

      <section className="home-orders-grid">
        <RecentOrdersTable orders={orders} />
      </section>
    </section>
  );
}
