"use client";

import { useMemo, useState } from "react";
import { badgeClass, formatCurrency } from "@/lib/format";
import type { Order, OrderStatus, OrderType, PaymentStatus } from "@/types";

interface OrdersSectionProps {
  orders: Order[];
  onRegisterOrder: () => void;
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => void;
}

const orderFilters: Array<"Todos" | OrderType> = ["Todos", "Catálogo", "Personalizada"];
const paymentStatuses: PaymentStatus[] = ["Pendiente", "50% pagado", "Pago completo"];
const orderStatuses: OrderStatus[] = [
  "Esperando pago",
  "En preparación",
  "Lista para enviar",
  "Entregado",
  "Cancelado"
];
const orderFlow = [
  {
    step: "01",
    title: "Catálogo web",
    description: "El cliente elige una prenda publicada, talla y color. Al comprar pasa a WhatsApp.",
    status: "Web -> WhatsApp"
  },
  {
    step: "02",
    title: "Personaliza web",
    description: "El cliente sube referencias, elige color, talla y deja instrucciones del diseño.",
    status: "Referencias"
  },
  {
    step: "03",
    title: "Bot WhatsApp",
    description: "El bot confirma datos, pide comprobante y registra el pedido para producción.",
    status: "n8n"
  },
  {
    step: "04",
    title: "Dashboard",
    description: "Aquí revisas pago, estado, detalles, referencias y avance de cada prenda.",
    status: "Control"
  }
];

export function OrdersSection({ orders, onRegisterOrder, onUpdateOrder }: OrdersSectionProps) {
  const [activeFilter, setActiveFilter] = useState<"Todos" | OrderType>("Todos");
  const [query, setQuery] = useState("");

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    return orders.filter((order) => {
      const matchesType = activeFilter === "Todos" || order.type === activeFilter;
      const matchesSearch =
        !normalizedQuery ||
        `${order.id} ${order.customer} ${order.product} ${order.payment} ${order.status} ${order.channel} ${order.type}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesType && matchesSearch;
    });
  }, [activeFilter, orders, query]);

  const catalogCount = orders.filter((order) => order.type === "Catálogo").length;
  const customCount = orders.filter((order) => order.type === "Personalizada").length;
  const pendingPayments = orders.filter((order) => order.payment !== "Pago completo").length;
  const botRegisteredCount = orders.filter((order) => order.botStatus === "Bot registrado").length;
  const totalIncome = orders.reduce((sum, order) => sum + order.total, 0);

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Ventas</span>
          <h2>Pedidos</h2>
          <p>
            Controla lo que llega desde la web: compras del catálogo, pedidos personalizados,
            WhatsApp, comprobantes y referencias para producción.
          </p>
        </div>
        <button className="btn primary" onClick={onRegisterOrder} type="button">
          Registrar pedido
        </button>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Desde la web</span>
          <strong>{orders.length}</strong>
          <small>Catálogo y personaliza</small>
        </article>
        <article className="section-summary-card">
          <span>Catálogo</span>
          <strong>{catalogCount}</strong>
          <small>Prendas publicadas en la web</small>
        </article>
        <article className="section-summary-card">
          <span>Personalizadas</span>
          <strong>{customCount}</strong>
          <small>Diseños pedidos por clientes</small>
        </article>
        <article className="section-summary-card">
          <span>Bot registrados</span>
          <strong>{botRegisteredCount}</strong>
          <small>{pendingPayments} pagos pendientes · {formatCurrency(totalIncome)}</small>
        </article>
      </div>

      <div className="order-flow-grid">
        {orderFlow.map((item) => (
          <article className="order-flow-card" key={item.step}>
            <div>
              <span>{item.step}</span>
              <strong>{item.title}</strong>
            </div>
            <p>{item.description}</p>
            <small>{item.status}</small>
          </article>
        ))}
      </div>

      <article className="panel">
        <div className="orders-toolbar">
          <div className="panel-header compact-panel-header">
            <div>
              <h3>Centro de pedidos</h3>
              <p>Revisa qué llegó de la web y qué dejó el cliente antes de producir.</p>
            </div>
          </div>
          <input
            className="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pedido, cliente o prenda..."
            type="search"
            value={query}
          />
        </div>

        <div className="segmented-control orders-filter" aria-label="Filtrar pedidos">
          {orderFilters.map((filter) => (
            <button
              className={activeFilter === filter ? "active" : undefined}
              key={filter}
              onClick={() => setActiveFilter(filter)}
              type="button"
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Prenda</th>
                <th>Origen</th>
                <th>Pago</th>
                <th>Estado</th>
                <th>Bot</th>
                <th>Detalles web</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.id}</strong>
                    <small>{order.channel}</small>
                  </td>
                  <td>
                    <strong>{order.customer}</strong>
                    <small>{order.customerPhone ?? "Sin teléfono"}</small>
                  </td>
                  <td>
                    <strong>{order.product}</strong>
                    <small>
                      {[order.color, order.size, `${order.prendas} ${order.prendas === 1 ? "prenda" : "prendas"}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </td>
                  <td>
                    <span className={`badge ${order.type === "Personalizada" ? "accent" : "info"}`}>{order.type}</span>
                    <small>{order.source ?? "Web"}</small>
                  </td>
                  <td>
                    <select
                      className={`inline-select ${badgeClass(order.payment)}`}
                      onChange={(event) =>
                        onUpdateOrder(order.id, { payment: event.target.value as PaymentStatus })
                      }
                      value={order.payment}
                    >
                      {paymentStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={`inline-select ${badgeClass(order.status)}`}
                      onChange={(event) =>
                        onUpdateOrder(order.id, { status: event.target.value as OrderStatus })
                      }
                      value={order.status}
                    >
                      {orderStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${badgeClass(order.botStatus ?? "Atención manual")}`}>
                      {order.botStatus ?? "Atención manual"}
                    </span>
                    <small>{order.channel}</small>
                  </td>
                  <td>
                    {order.type === "Personalizada" ? (
                      <div className="order-reference-cell">
                        <strong>{order.referenceImages?.length ?? 0} referencias</strong>
                        <small>{order.designDetails ?? "Sin detalles del diseño"}</small>
                        {Boolean(order.referenceImages?.length) && (
                          <div className="reference-chip-list">
                            {order.referenceImages?.slice(0, 3).map((reference) => (
                              <span className="reference-chip" key={reference}>
                                {reference}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="order-reference-cell">
                        <strong>Producto del catálogo</strong>
                        <small>Prenda elegida en la web y continuada por WhatsApp.</small>
                      </div>
                    )}
                  </td>
                  <td>
                    <strong>{formatCurrency(order.total)}</strong>
                    <small>{order.delivery ?? "Sin entrega"}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
