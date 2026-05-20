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

function isReferenceUrl(reference: string) {
  return reference.startsWith("http") || reference.startsWith("/");
}

function referenceName(reference: string) {
  const cleanReference = reference.split("?")[0];
  return decodeURIComponent(cleanReference.split("/").pop() ?? reference);
}

export function OrdersSection({ orders, onRegisterOrder, onUpdateOrder }: OrdersSectionProps) {
  const [activeFilter, setActiveFilter] = useState<"Todos" | OrderType>("Todos");
  const [query, setQuery] = useState("");

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    return orders.filter((order) => {
      const matchesType = activeFilter === "Todos" || order.type === activeFilter;
      const matchesSearch =
        !normalizedQuery ||
        `${order.id} ${order.customer} ${order.product} ${order.payment} ${order.status} ${order.channel} ${order.type} ${order.quoteOption ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesType && matchesSearch;
    });
  }, [activeFilter, orders, query]);

  const preparationOrders = visibleOrders.filter((order) => order.status !== "Entregado" && order.status !== "Cancelado");
  const customWebOrders = orders.filter((order) => order.type === "Personalizada" && order.source === "Web personaliza");
  const readyOrders = orders.filter((order) => order.status === "Lista para enviar").length;
  const pendingPayments = orders.filter((order) => order.payment !== "Pago completo").length;

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Producción</span>
          <h2>Pedidos para preparar</h2>
          <p>
            Revisa los pedidos que llegan desde la web y WhatsApp. Marca avances, confirma pagos y abre
            las referencias de pedidos personalizados para empezar el trabajo.
          </p>
        </div>
        <button className="btn primary" onClick={onRegisterOrder} type="button">
          Registrar pedido
        </button>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>En preparación</span>
          <strong>{preparationOrders.length}</strong>
          <small>Pedidos activos</small>
        </article>
        <article className="section-summary-card">
          <span>Personalizados web</span>
          <strong>{customWebOrders.length}</strong>
          <small>Con referencias y detalles</small>
        </article>
        <article className="section-summary-card">
          <span>Listos</span>
          <strong>{readyOrders}</strong>
          <small>Para entregar o enviar</small>
        </article>
        <article className="section-summary-card">
          <span>Pagos pendientes</span>
          <strong>{pendingPayments}</strong>
          <small>{formatCurrency(orders.reduce((sum, order) => sum + order.total, 0))} registrados</small>
        </article>
      </div>

      <div className="orders-layout">
        <article className="panel production-panel">
          <div className="orders-toolbar">
            <div className="panel-header compact-panel-header">
              <div>
                <h3>Cola de preparación</h3>
                <p>Pedidos registrados para producir, empaquetar y marcar como listos.</p>
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

          <div className="production-list">
            {preparationOrders.map((order) => (
              <article className="production-order-card" key={order.id}>
                <div className="production-order-main">
                  <div className="order-card-head">
                    <div>
                      <span className="section-kicker">{order.id}</span>
                      <h4>{order.product}</h4>
                    </div>
                    <span className={`badge ${order.type === "Personalizada" ? "accent" : "info"}`}>{order.type}</span>
                  </div>

                  <p>{order.customer} · {order.customerPhone ?? order.channel}</p>

                  <div className="order-chip-row">
                    <span>{order.color ?? "Color por confirmar"}</span>
                    <span>{order.size ?? "Talla por confirmar"}</span>
                    <span>{order.prendas} {order.prendas === 1 ? "prenda" : "prendas"}</span>
                    <span>{order.source ?? "Web"}</span>
                  </div>
                </div>

                <div className="order-control-grid">
                  <label>
                    <span>Pago</span>
                    <select
                      className={`inline-select ${badgeClass(order.payment)}`}
                      onChange={(event) => onUpdateOrder(order.id, { payment: event.target.value as PaymentStatus })}
                      value={order.payment}
                    >
                      {paymentStatuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Preparación</span>
                    <select
                      className={`inline-select ${badgeClass(order.status)}`}
                      onChange={(event) => onUpdateOrder(order.id, { status: event.target.value as OrderStatus })}
                      value={order.status}
                    >
                      {orderStatuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="btn"
                    onClick={() => onUpdateOrder(order.id, { status: "Lista para enviar" })}
                    type="button"
                  >
                    Marcar listo
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="panel custom-inbox-panel">
          <div className="panel-header">
            <div>
              <h3>Personalizados desde la web</h3>
              <p>Referencias, ubicación del diseño y notas que el cliente envía desde Nachito Store.</p>
            </div>
            <span className="badge accent">Web</span>
          </div>

          <div className="custom-request-list">
            {customWebOrders.map((order) => (
              <article className="custom-request-card" key={order.id}>
                <div className="order-card-head">
                  <div>
                    <span className="section-kicker">{order.id}</span>
                    <h4>{order.customer}</h4>
                  </div>
                  <span className={`badge ${badgeClass(order.botStatus ?? "Atención manual")}`}>
                    {order.botStatus ?? "Atención manual"}
                  </span>
                </div>

                <div className="custom-request-meta">
                  <span>{order.color ?? "Color por confirmar"}</span>
                  <span>{order.size ?? "Talla por confirmar"}</span>
                  <span>{order.quoteOption ?? "Cotización por revisar"}</span>
                </div>

                <p>{order.designDetails ?? "Sin detalles del diseño."}</p>

                <div className="reference-preview-grid">
                  {(order.referenceImages ?? []).map((reference, index) => (
                    <div className="reference-preview" key={`${order.id}-${reference}`}>
                      {isReferenceUrl(reference) ? (
                        <img alt={`Referencia ${index + 1} de ${order.customer}`} src={reference} />
                      ) : (
                        <div className="reference-placeholder">
                          <span>REF</span>
                          <strong>{index + 1}</strong>
                        </div>
                      )}
                      <div>
                        <strong>{referenceName(reference)}</strong>
                        {isReferenceUrl(reference) ? (
                          <a className="btn" download href={reference} target="_blank">
                            Descargar
                          </a>
                        ) : (
                          <button className="btn" disabled type="button">
                            Descargar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
