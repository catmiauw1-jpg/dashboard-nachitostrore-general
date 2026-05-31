"use client";

import { useMemo, useState } from "react";
import { badgeClass, formatCurrency } from "@/lib/format";
import type { Order, OrderLineItem } from "@/types";

interface OrderHistorySectionProps {
  orders: Order[];
}

type HistoryTab = "Entregados" | "Cancelados";

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

function mainOrderTitle(order: Order, items: OrderLineItem[]) {
  if (order.type === "Catálogo" && items.length > 1) return "Pedido catálogo";
  return order.product;
}

function orderSearchText(order: Order) {
  return [
    order.id,
    order.customer,
    order.product,
    order.payment,
    order.status,
    order.type,
    order.notes,
    ...orderItems(order).flatMap((item) => [item.productName, item.color, item.size, item.description])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function OrderHistorySection({ orders }: OrderHistorySectionProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("Entregados");
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const completedOrders = useMemo(() => orders.filter((order) => order.status === "Entregado"), [orders]);
  const canceledOrders = useMemo(() => orders.filter((order) => order.status === "Cancelado"), [orders]);
  const closedOrders = activeTab === "Entregados" ? completedOrders : canceledOrders;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOrders = closedOrders.filter((order) => !normalizedQuery || orderSearchText(order).includes(normalizedQuery));
  const selectedOrder =
    selectedOrderId && orders.find((order) => order.id === selectedOrderId)?.status === activeTab.slice(0, -1)
      ? orders.find((order) => order.id === selectedOrderId)
      : visibleOrders[0];
  const selectedItems = selectedOrder ? orderItems(selectedOrder) : [];
  const closedTotal = closedOrders.reduce((sum, order) => sum + order.total, 0);

  return (
    <section className="section-workspace history-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Historial</span>
          <h2>Pedidos cerrados</h2>
          <p>Revisa pedidos entregados y cancelados en una sección aparte de la cola de preparación.</p>
        </div>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Entregados</span>
          <strong>{completedOrders.length}</strong>
          <small>Pedidos completados</small>
        </article>
        <article className="section-summary-card">
          <span>Cancelados</span>
          <strong>{canceledOrders.length}</strong>
          <small>Se limpian cada 24 horas</small>
        </article>
        <article className="section-summary-card">
          <span>Total sección</span>
          <strong>{formatCurrency(closedTotal)}</strong>
          <small>{activeTab.toLowerCase()}</small>
        </article>
      </div>

      <div className="history-layout">
        <article className="panel order-history-panel">
          <div className="orders-toolbar">
            <div className="panel-header compact-panel-header">
              <div>
                <h3>{activeTab}</h3>
                <p>{activeTab === "Entregados" ? "Pedidos finalizados correctamente." : "Pedidos cancelados antes de cerrar venta."}</p>
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

          <div className="segmented-control history-tabs">
            {(["Entregados", "Cancelados"] as const).map((tab) => (
              <button
                className={activeTab === tab ? "active" : undefined}
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedOrderId(null);
                }}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="order-history-list">
            {visibleOrders.map((order) => {
              const items = orderItems(order);
              const isSelected = selectedOrder?.id === order.id;

              return (
                <button
                  className={`history-order-card ${activeTab === "Cancelados" ? "canceled" : ""}${isSelected ? " active" : ""}`}
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  type="button"
                >
                  <div>
                    <strong>{order.id}</strong>
                    <p>{mainOrderTitle(order, items)} · {formatOrderDate(order.createdAt)}</p>
                  </div>
                  <span>{formatCurrency(order.total)}</span>
                </button>
              );
            })}

            {!visibleOrders.length ? (
              <div className="empty-state compact-empty">
                <strong>Sin {activeTab.toLowerCase()}</strong>
                <p>Cuando exista un pedido en este estado aparecerá aquí.</p>
              </div>
            ) : null}
          </div>
        </article>

        <aside className="panel order-detail-panel history-detail-panel">
          {selectedOrder ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="section-kicker">Detalle</span>
                  <h3>{selectedOrder.id}</h3>
                  <p>{selectedOrder.customer} · {formatOrderDate(selectedOrder.createdAt)}</p>
                </div>
                <span className={`badge ${badgeClass(selectedOrder.status)}`}>{selectedOrder.status}</span>
              </div>

              <div className="order-detail-grid">
                <div className="order-detail-time">
                  <span>Tipo</span>
                  <strong>{selectedOrder.type}</strong>
                </div>
                <div className="order-detail-total">
                  <span>Total</span>
                  <strong>{formatCurrency(selectedOrder.total)}</strong>
                  <small>{selectedOrder.prendas} {selectedOrder.prendas === 1 ? "prenda" : "prendas"}</small>
                </div>
              </div>

              <div className="order-detail-block">
                <div className="order-detail-title">
                  <h4>Prendas</h4>
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

              {selectedOrder.notes || selectedOrder.designDetails ? (
                <div className="order-detail-block">
                  <div className="order-detail-title">
                    <h4>Notas</h4>
                    <span>{selectedOrder.source ?? "Registro"}</span>
                  </div>
                  <p className="order-detail-notes">{selectedOrder.notes ?? selectedOrder.designDetails}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state order-detail-empty">
              <strong>Selecciona un pedido</strong>
              <p>El detalle aparecerá aquí cuando elijas un registro del historial.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
