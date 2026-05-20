"use client";

import { useMemo, useState } from "react";
import { badgeClass, formatCurrency } from "@/lib/format";
import type { Order, OrderLineItem, OrderStatus, OrderType, PaymentStatus } from "@/types";

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

function formatOrderDate(value?: string) {
  if (!value) return "Fecha por confirmar";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha por confirmar";

  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function orderItems(order: Order): OrderLineItem[] {
  if (order.items?.length) return order.items;

  const quantity = Math.max(1, order.prendas || 1);
  const unitPrice = quantity > 0 ? order.total / quantity : order.total;

  return [
    {
      productName: order.product,
      size: order.size,
      color: order.color,
      quantity,
      unitPrice,
      lineTotal: order.total,
      isCustom: order.type === "Personalizada",
      description: order.designDetails
    }
  ];
}

function orderSearchText(order: Order) {
  return [
    order.id,
    order.customer,
    order.product,
    order.payment,
    order.status,
    order.channel,
    order.type,
    order.quoteOption,
    order.notes,
    ...orderItems(order).flatMap((item) => [item.productName, item.color, item.size, item.description])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function OrdersSection({ orders, onRegisterOrder, onUpdateOrder }: OrdersSectionProps) {
  const [activeFilter, setActiveFilter] = useState<"Todos" | OrderType>("Todos");
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    return orders.filter((order) => {
      const matchesType = activeFilter === "Todos" || order.type === activeFilter;
      const matchesSearch = !normalizedQuery || orderSearchText(order).includes(normalizedQuery);

      return matchesType && matchesSearch;
    });
  }, [activeFilter, orders, query]);

  const preparationOrders = visibleOrders.filter((order) => order.status !== "Entregado" && order.status !== "Cancelado");
  const customWebOrders = orders.filter((order) => order.type === "Personalizada" && order.source === "Web personaliza");
  const readyOrders = orders.filter((order) => order.status === "Lista para enviar").length;
  const pendingPayments = orders.filter((order) => order.payment !== "Pago completo").length;
  const selectedOrder =
    preparationOrders.find((order) => order.id === selectedOrderId) ??
    preparationOrders[0] ??
    visibleOrders.find((order) => order.id === selectedOrderId) ??
    visibleOrders[0];
  const selectedItems = selectedOrder ? orderItems(selectedOrder) : [];
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0) || selectedOrder?.total || 0;

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Producción</span>
          <h2>Pedidos para preparar</h2>
          <p>
            Revisa pedidos de catálogo y personalizados desde la web. Selecciona un pedido para ver sus prendas,
            referencias, fecha, hora y total.
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
                <p>Selecciona un pedido para revisar qué pidió el cliente.</p>
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
            {preparationOrders.map((order) => {
              const items = orderItems(order);
              const itemSummary = items.slice(0, 2).map((item) => item.productName).join(", ");
              const isSelected = selectedOrder?.id === order.id;

              return (
                <button
                  className={`production-order-card order-selector-card${isSelected ? " active" : ""}`}
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  type="button"
                >
                  <div className="production-order-main">
                    <div className="order-card-head">
                      <div>
                        <span className="section-kicker">{order.id}</span>
                        <h4>{order.type === "Catálogo" && items.length > 1 ? "Pedido catálogo" : order.product}</h4>
                      </div>
                      <span className={`badge ${order.type === "Personalizada" ? "accent" : "info"}`}>{order.type}</span>
                    </div>

                    <p>{order.customer} · {formatOrderDate(order.createdAt)}</p>
                    <strong className="order-list-products">{itemSummary}{items.length > 2 ? ` +${items.length - 2}` : ""}</strong>

                    <div className="order-chip-row">
                      <span>{order.prendas} {order.prendas === 1 ? "prenda" : "prendas"}</span>
                      <span>{formatCurrency(order.total)}</span>
                      <span className={badgeClass(order.payment)}>{order.payment}</span>
                      <span className={badgeClass(order.status)}>{order.status}</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {!preparationOrders.length ? (
              <div className="empty-state">
                <strong>No hay pedidos activos</strong>
                <p>Cuando entre un pedido desde la web, aparecerá aquí para revisarlo.</p>
              </div>
            ) : null}
          </div>
        </article>

        <aside className="panel order-detail-panel">
          {selectedOrder ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="section-kicker">Detalle del pedido</span>
                  <h3>{selectedOrder.id}</h3>
                  <p>{selectedOrder.customer} · {selectedOrder.customerPhone ?? selectedOrder.channel}</p>
                </div>
                <span className={`badge ${selectedOrder.type === "Personalizada" ? "accent" : "info"}`}>
                  {selectedOrder.type}
                </span>
              </div>

              <div className="order-detail-time">
                <span>Fecha y hora del pedido</span>
                <strong>{formatOrderDate(selectedOrder.createdAt)}</strong>
              </div>

              <div className="order-detail-total">
                <span>Total del pedido</span>
                <strong>{formatCurrency(selectedTotal)}</strong>
                <small>{selectedOrder.prendas} {selectedOrder.prendas === 1 ? "prenda" : "prendas"}</small>
              </div>

              <div className="order-control-grid detail-controls">
                <label>
                  <span>Pago</span>
                  <select
                    className={`inline-select ${badgeClass(selectedOrder.payment)}`}
                    onChange={(event) =>
                      onUpdateOrder(selectedOrder.id, { payment: event.target.value as PaymentStatus })
                    }
                    value={selectedOrder.payment}
                  >
                    {paymentStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Preparación</span>
                  <select
                    className={`inline-select ${badgeClass(selectedOrder.status)}`}
                    onChange={(event) => onUpdateOrder(selectedOrder.id, { status: event.target.value as OrderStatus })}
                    value={selectedOrder.status}
                  >
                    {orderStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <button
                  className="btn"
                  onClick={() => onUpdateOrder(selectedOrder.id, { status: "Lista para enviar" })}
                  type="button"
                >
                  Marcar listo
                </button>
              </div>

              <div className="order-detail-block">
                <div className="order-detail-title">
                  <h4>Prendas escogidas</h4>
                  <span>{selectedItems.length} línea{selectedItems.length === 1 ? "" : "s"}</span>
                </div>

                <div className="order-line-list">
                  {selectedItems.map((item, index) => (
                    <article className="order-line-item" key={`${selectedOrder.id}-${item.productName}-${index}`}>
                      <div>
                        <strong>{item.productName}</strong>
                        <p>
                          {item.color ?? "Color por confirmar"} · Talla {item.size ?? "por confirmar"}
                          {item.description ? ` · ${item.description}` : ""}
                        </p>
                      </div>
                      <div className="order-line-numbers">
                        <span>{item.quantity}x {formatCurrency(item.unitPrice)}</span>
                        <strong>{formatCurrency(item.lineTotal)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              {selectedOrder.type === "Personalizada" ? (
                <div className="order-detail-block">
                  <div className="order-detail-title">
                    <h4>Personalización</h4>
                    <span>{selectedOrder.quoteOption ?? "Cotización por revisar"}</span>
                  </div>
                  <p className="order-detail-notes">
                    {selectedOrder.designDetails ?? selectedOrder.notes ?? "Sin detalles del diseño todavía."}
                  </p>

                  <div className="reference-preview-grid">
                    {(selectedOrder.referenceImages ?? []).map((reference, index) => (
                      <div className="reference-preview" key={`${selectedOrder.id}-${reference}-${index}`}>
                        {isReferenceUrl(reference) ? (
                          <img alt={`Referencia ${index + 1} de ${selectedOrder.customer}`} src={reference} />
                        ) : (
                          <div className="reference-placeholder">
                            <span>REF</span>
                            <strong>{index + 1}</strong>
                          </div>
                        )}
                        <div>
                          <strong>{referenceName(reference)}</strong>
                          {isReferenceUrl(reference) ? (
                            <a className="btn" download href={reference} rel="noreferrer" target="_blank">
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
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <strong>Selecciona un pedido</strong>
              <p>El detalle aparecerá aquí con prendas, total, fecha y hora.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
