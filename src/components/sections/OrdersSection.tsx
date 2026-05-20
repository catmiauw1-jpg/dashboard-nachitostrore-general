"use client";

import { useEffect, useMemo, useState } from "react";
import { badgeClass, formatCurrency } from "@/lib/format";
import type { Order, OrderLineItem, OrderStatus, OrderType, PaymentStatus } from "@/types";

interface OrdersSectionProps {
  orders: Order[];
  onRegisterOrder: () => void;
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => void;
}

type StageFilter = "Activos" | "Esperando pago" | "En preparación" | "Listos" | "Historial";

const orderFilters: Array<"Todos" | OrderType> = ["Todos", "Catálogo", "Personalizada"];
const stageFilters: StageFilter[] = ["Activos", "Esperando pago", "En preparación", "Listos", "Historial"];
const paymentStatuses: PaymentStatus[] = ["Pendiente", "50% pagado", "Pago completo"];
const orderStatuses: OrderStatus[] = [
  "Esperando pago",
  "En preparación",
  "Lista para enviar",
  "Entregado",
  "Cancelado"
];

const quickSteps: Array<{ label: string; status: OrderStatus; helper: string }> = [
  { label: "Pago pendiente", status: "Esperando pago", helper: "Aún falta confirmar" },
  { label: "Preparar", status: "En preparación", helper: "Descuenta stock" },
  { label: "Listo", status: "Lista para enviar", helper: "Para entregar" },
  { label: "Entregado", status: "Entregado", helper: "Cierra pedido" }
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

function matchesStage(order: Order, stage: StageFilter) {
  if (stage === "Activos") return order.status !== "Entregado" && order.status !== "Cancelado";
  if (stage === "Listos") return order.status === "Lista para enviar";
  if (stage === "Historial") return order.status === "Entregado" || order.status === "Cancelado";
  return order.status === stage;
}

function mainOrderTitle(order: Order, items: OrderLineItem[]) {
  if (order.type === "Catálogo" && items.length > 1) return "Pedido catálogo";
  return order.product;
}

function firstOrderLine(order: Order, items: OrderLineItem[]) {
  if (!items.length) return "Sin prendas registradas";

  return items
    .slice(0, 2)
    .map((item) => {
      const details = [item.color, item.size ? `Talla ${item.size}` : undefined]
        .filter(Boolean)
        .join(" · ");
      return details ? `${item.productName} (${details})` : item.productName;
    })
    .join(", ");
}

export function OrdersSection({ orders, onRegisterOrder, onUpdateOrder }: OrdersSectionProps) {
  const [activeFilter, setActiveFilter] = useState<"Todos" | OrderType>("Todos");
  const [activeStage, setActiveStage] = useState<StageFilter>("Activos");
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [previewReference, setPreviewReference] = useState<string | null>(null);

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    return orders.filter((order) => {
      const matchesType = activeFilter === "Todos" || order.type === activeFilter;
      const matchesSearch = !normalizedQuery || orderSearchText(order).includes(normalizedQuery);

      return matchesType && matchesSearch;
    });
  }, [activeFilter, orders, query]);

  const displayedOrders = visibleOrders.filter((order) => matchesStage(order, activeStage));
  const activeOrders = orders.filter((order) => order.status !== "Entregado" && order.status !== "Cancelado");
  const customWebOrders = orders.filter(
    (order) =>
      order.type === "Personalizada" &&
      order.source === "Web personaliza" &&
      order.status !== "Cancelado" &&
      order.status !== "Entregado"
  );
  const readyOrders = orders.filter((order) => order.status === "Lista para enviar").length;
  const pendingPayments = orders.filter((order) => order.payment !== "Pago completo" && order.status !== "Cancelado").length;
  const selectedOrder = selectedOrderId ? orders.find((order) => order.id === selectedOrderId) : undefined;
  const selectedItems = selectedOrder ? orderItems(selectedOrder) : [];
  const selectedTotal = selectedOrder?.total ?? selectedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const activeSalesTotal = orders
    .filter((order) => order.status !== "Cancelado")
    .reduce((sum, order) => sum + order.total, 0);

  useEffect(() => {
    if (selectedOrderId && !orders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(null);
    }
  }, [orders, selectedOrderId]);

  const updateStatus = (orderId: string, status: OrderStatus) => {
    onUpdateOrder(orderId, { status });
    if (status === "Cancelado" || status === "Entregado") setActiveStage("Historial");
  };

  const downloadReference = async (reference: string) => {
    const filename = referenceName(reference);

    try {
      const response = await fetch(reference);
      if (!response.ok) throw new Error("No se pudo descargar");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement("a");
      link.href = reference;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  const selectedDetailsText = selectedOrder
    ? selectedOrder.notes && selectedOrder.notes.trim()
      ? selectedOrder.notes
      : selectedOrder.designDetails ?? "Sin detalles del diseño todavía."
    : "";

  return (
    <section className="section-workspace">
      <header className="section-head orders-head">
        <div>
          <span className="section-kicker">Producción</span>
          <h2>Pedidos para preparar</h2>
          <p>
            Controla pedidos de catálogo y personalizados desde la web. Selecciona uno para ver prendas, referencias,
            fecha, hora, pago y total.
          </p>
        </div>
        <button className="btn primary" onClick={onRegisterOrder} type="button">
          Registrar pedido
        </button>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Activos</span>
          <strong>{activeOrders.length}</strong>
          <small>Pedidos por atender</small>
        </article>
        <article className="section-summary-card">
          <span>Personalizados web</span>
          <strong>{customWebOrders.length}</strong>
          <small>Con referencias del cliente</small>
        </article>
        <article className="section-summary-card">
          <span>Listos</span>
          <strong>{readyOrders}</strong>
          <small>Para entregar o enviar</small>
        </article>
        <article className="section-summary-card">
          <span>Pagos pendientes</span>
          <strong>{pendingPayments}</strong>
          <small>{formatCurrency(activeSalesTotal)} registrados</small>
        </article>
      </div>

      <div className="orders-layout">
        <article className="panel production-panel">
          <div className="orders-toolbar">
            <div className="panel-header compact-panel-header">
              <div>
                <h3>Cola de preparación</h3>
                <p>Ordena el trabajo por estado y abre cada ficha para producir sin perder detalles.</p>
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

          <div className="orders-filter-stack">
            <div className="segmented-control orders-filter" aria-label="Filtrar por tipo de pedido">
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

            <div className="stage-filter" aria-label="Filtrar por estado">
              {stageFilters.map((filter) => (
                <button
                  className={activeStage === filter ? "active" : undefined}
                  key={filter}
                  onClick={() => setActiveStage(filter)}
                  type="button"
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="production-list">
            {displayedOrders.map((order) => {
              const items = orderItems(order);
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
                        <h4>{mainOrderTitle(order, items)}</h4>
                      </div>
                      <span className={`badge ${order.type === "Personalizada" ? "accent" : "info"}`}>{order.type}</span>
                    </div>

                    <p>{order.customer} · {formatOrderDate(order.createdAt)}</p>
                    <strong className="order-list-products">
                      {firstOrderLine(order, items)}
                      {items.length > 2 ? ` +${items.length - 2}` : ""}
                    </strong>

                    <div className="order-card-footer">
                      <div className="order-chip-row">
                        <span>{order.prendas} {order.prendas === 1 ? "prenda" : "prendas"}</span>
                        <span>{formatCurrency(order.total)}</span>
                        <span className={badgeClass(order.payment)}>{order.payment}</span>
                        <span className={badgeClass(order.status)}>{order.status}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {!displayedOrders.length ? (
              <div className="empty-state order-empty-state">
                <strong>No hay pedidos en este filtro</strong>
                <p>Cuando llegue un pedido desde la web aparecerá aquí en tiempo real.</p>
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

              <div className="order-detail-grid">
                <div className="order-detail-time">
                  <span>Fecha y hora</span>
                  <strong>{formatOrderDate(selectedOrder.createdAt)}</strong>
                </div>

                <div className="order-detail-total">
                  <span>Total</span>
                  <strong>{formatCurrency(selectedTotal)}</strong>
                  <small>{selectedOrder.prendas} {selectedOrder.prendas === 1 ? "prenda" : "prendas"}</small>
                  <small className={selectedOrder.stockDeducted ? "stock-deducted" : "stock-pending"}>
                    {selectedOrder.stockDeducted ? "Stock descontado" : "Stock pendiente"}
                  </small>
                </div>
              </div>

              <div className="order-detail-block workflow-block">
                <div className="order-detail-title">
                  <h4>Avance del pedido</h4>
                  <span>{selectedOrder.status}</span>
                </div>

                <div className="quick-step-grid">
                  {quickSteps.map((step) => (
                    <button
                      className={selectedOrder.status === step.status ? "quick-step active" : "quick-step"}
                      key={step.status}
                      onClick={() => updateStatus(selectedOrder.id, step.status)}
                      type="button"
                    >
                      <strong>{step.label}</strong>
                      <small>{step.helper}</small>
                    </button>
                  ))}
                </div>
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
                    onChange={(event) => updateStatus(selectedOrder.id, event.target.value as OrderStatus)}
                    value={selectedOrder.status}
                  >
                    {orderStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
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

              {selectedOrder.notes && selectedOrder.type === "Catálogo" ? (
                <div className="order-detail-block">
                  <div className="order-detail-title">
                    <h4>Notas del pedido</h4>
                    <span>Web</span>
                  </div>
                  <p className="order-detail-notes">{selectedOrder.notes}</p>
                </div>
              ) : null}

              {selectedOrder.type === "Personalizada" ? (
                <div className="order-detail-block">
                  <div className="order-detail-title">
                    <h4>Personalización</h4>
                    <span>{selectedOrder.quoteOption ?? "Cotización por revisar"}</span>
                  </div>
                  <p className="order-detail-notes">
                    {selectedDetailsText}
                  </p>

                  {(selectedOrder.referenceImages ?? []).length ? (
                    <div className="reference-preview-grid">
                      {(selectedOrder.referenceImages ?? []).map((reference, index) => (
                        <div className="reference-preview" key={`${selectedOrder.id}-${reference}-${index}`}>
                          {isReferenceUrl(reference) ? (
                            <button
                              className="reference-image-button"
                              onClick={() => setPreviewReference(reference)}
                              type="button"
                            >
                              <img alt={`Referencia ${index + 1} de ${selectedOrder.customer}`} src={reference} />
                            </button>
                          ) : (
                            <div className="reference-placeholder">
                              <span>REF</span>
                              <strong>{index + 1}</strong>
                            </div>
                          )}
                          <div>
                            <strong>{referenceName(reference)}</strong>
                            {isReferenceUrl(reference) ? (
                              <button className="btn" onClick={() => void downloadReference(reference)} type="button">
                                Descargar
                              </button>
                            ) : (
                              <button className="btn" disabled type="button">
                                Descargar
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state compact-empty">
                      <strong>Sin imágenes adjuntas</strong>
                      <p>Cuando el cliente suba referencias desde la web aparecerán aquí.</p>
                    </div>
                  )}
                </div>
              ) : null}

              <button
                className="btn danger subtle-cancel"
                onClick={() => updateStatus(selectedOrder.id, "Cancelado")}
                type="button"
              >
                Cancelar pedido
              </button>
            </>
          ) : (
            <div className="empty-state order-detail-empty">
              <strong>Selecciona un pedido</strong>
              <p>Elige un pedido de la cola para ver prendas, total, fecha, hora, pago y referencias.</p>
            </div>
          )}
        </aside>
      </div>

      {previewReference ? (
        <div className="image-preview-backdrop" onClick={() => setPreviewReference(null)} role="presentation">
          <div className="image-preview-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button className="btn image-preview-close" onClick={() => setPreviewReference(null)} type="button">
              Cerrar
            </button>
            <img alt="Referencia del pedido" src={previewReference} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
