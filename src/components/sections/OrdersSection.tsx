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
  const totalIncome = orders.reduce((sum, order) => sum + order.total, 0);

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Ventas</span>
          <h2>Pedidos</h2>
          <p>Administra en un solo lugar las compras del catálogo y las prendas personalizadas.</p>
        </div>
        <button className="btn primary" onClick={onRegisterOrder} type="button">
          Registrar pedido
        </button>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Pedidos</span>
          <strong>{orders.length}</strong>
          <small>{filteredOrders.length} visibles ahora</small>
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
          <span>Pagos pendientes</span>
          <strong>{pendingPayments}</strong>
          <small>{formatCurrency(totalIncome)} registrados</small>
        </article>
      </div>

      <article className="panel">
        <div className="orders-toolbar">
          <div className="panel-header compact-panel-header">
            <div>
              <h3>Centro de pedidos</h3>
              <p>Cambia pago y estado sin separar catálogo de pedidos personalizados.</p>
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
                <th>Tipo</th>
                <th>Pago</th>
                <th>Estado</th>
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
