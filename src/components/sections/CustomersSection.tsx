"use client";

import { useMemo, useState } from "react";
import { badgeClass, formatCurrency } from "@/lib/format";
import type { Order } from "@/types";

interface CustomersSectionProps {
  orders: Order[];
}

interface CustomerProfile {
  key: string;
  name: string;
  phone?: string;
  registeredAt?: string;
  fromNachitoStore: boolean;
  channels: string[];
  orders: Order[];
  activeOrders: Order[];
  completedOrders: Order[];
  canceledOrders: Order[];
  totalSpent: number;
  totalGarments: number;
  lastOrder?: Order;
  favoriteSize: string;
  favoriteColor: string;
  preferredType: string;
}

type SourceFilter = "all" | "web" | "other";

function formatOrderDate(value?: string) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function mostCommon(values: Array<string | undefined>, fallback: string) {
  const counts = new Map<string, number>();

  values.filter(Boolean).forEach((value) => {
    counts.set(value as string, (counts.get(value as string) ?? 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

function customerKey(order: Order) {
  return order.customerPhone?.trim() || order.customer.trim().toLowerCase() || order.id;
}

function isNachitoStoreOrder(order: Order) {
  return order.channel === "Web" || order.source === "Web catálogo" || order.source === "Web personaliza";
}

function buildCustomerProfiles(orders: Order[]): CustomerProfile[] {
  const groups = new Map<string, Order[]>();

  orders.forEach((order) => {
    const key = customerKey(order);
    groups.set(key, [...(groups.get(key) ?? []), order]);
  });

  return [...groups.entries()]
    .map(([key, customerOrders]) => {
      const sortedOrders = [...customerOrders].sort((a, b) => {
        const first = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const second = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return second - first;
      });
      const billableOrders = sortedOrders.filter((order) => order.status !== "Cancelado");
      const activeOrders = sortedOrders.filter((order) => order.status !== "Cancelado" && order.status !== "Entregado");
      const completedOrders = sortedOrders.filter((order) => order.status === "Entregado");
      const canceledOrders = sortedOrders.filter((order) => order.status === "Cancelado");
      const oldestOrder = sortedOrders[sortedOrders.length - 1];

      return {
        key,
        name: sortedOrders[0]?.customer ?? "Cliente sin nombre",
        phone: sortedOrders.find((order) => order.customerPhone)?.customerPhone,
        registeredAt: oldestOrder?.createdAt,
        fromNachitoStore: sortedOrders.some(isNachitoStoreOrder),
        channels: [...new Set(sortedOrders.map((order) => order.channel))],
        orders: sortedOrders,
        activeOrders,
        completedOrders,
        canceledOrders,
        totalSpent: billableOrders.reduce((sum, order) => sum + order.total, 0),
        totalGarments: billableOrders.reduce((sum, order) => sum + order.prendas, 0),
        lastOrder: sortedOrders[0],
        favoriteSize: mostCommon(sortedOrders.map((order) => order.size), "Por confirmar"),
        favoriteColor: mostCommon(sortedOrders.map((order) => order.color), "Por confirmar"),
        preferredType: mostCommon(sortedOrders.map((order) => order.type), "Sin preferencia")
      };
    })
    .sort((a, b) => {
      const first = a.lastOrder?.createdAt ? new Date(a.lastOrder.createdAt).getTime() : 0;
      const second = b.lastOrder?.createdAt ? new Date(b.lastOrder.createdAt).getTime() : 0;
      return second - first;
    });
}

export function CustomersSection({ orders }: CustomersSectionProps) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

  const customers = useMemo(() => buildCustomerProfiles(orders), [orders]);
  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sourceFilteredCustomers = customers.filter((customer) => {
      if (sourceFilter === "web") return customer.fromNachitoStore;
      if (sourceFilter === "other") return !customer.fromNachitoStore;
      return true;
    });

    if (!normalizedQuery) return sourceFilteredCustomers;

    return sourceFilteredCustomers.filter((customer) =>
      [
        customer.name,
        customer.phone,
        customer.favoriteColor,
        customer.favoriteSize,
        customer.preferredType,
        customer.fromNachitoStore ? "Nachito Store web registrado" : "Manual WhatsApp",
        ...customer.channels
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [customers, query, sourceFilter]);
  const selectedCustomer = selectedCustomerKey
    ? customers.find((customer) => customer.key === selectedCustomerKey)
    : filteredCustomers[0] ?? customers[0];

  const frequentCustomers = customers.filter((customer) => customer.orders.length > 1).length;
  const activeCustomers = customers.filter((customer) => customer.activeOrders.length > 0).length;
  const webCustomers = customers.filter((customer) => customer.fromNachitoStore).length;
  const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Nachito Store</span>
          <h2>Clientes registrados</h2>
          <p>Personas que dejaron nombre y WhatsApp al comprar o cotizar desde la web.</p>
        </div>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Total clientes</span>
          <strong>{customers.length}</strong>
          <small>Detectados por pedidos</small>
        </article>
        <article className="section-summary-card">
          <span>Desde la web</span>
          <strong>{webCustomers}</strong>
          <small>Registrados en Nachito Store</small>
        </article>
        <article className="section-summary-card">
          <span>Frecuentes</span>
          <strong>{frequentCustomers}</strong>
          <small>Mas de un pedido</small>
        </article>
        <article className="section-summary-card">
          <span>Activos</span>
          <strong>{activeCustomers}</strong>
          <small>Con pedido abierto</small>
        </article>
      </div>

      <div className="customers-layout">
        <article className="panel customers-list-panel">
          <div className="orders-toolbar">
            <div className="panel-header compact-panel-header">
              <div>
                <h3>Registro de clientes</h3>
                <p>Busca por nombre, WhatsApp, color, talla u origen.</p>
              </div>
            </div>
            <input
              className="search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente..."
              type="search"
              value={query}
            />
          </div>

          <div className="segmented-control customers-filter" aria-label="Filtrar clientes">
            <button className={sourceFilter === "all" ? "active" : ""} onClick={() => setSourceFilter("all")} type="button">
              Todos
            </button>
            <button className={sourceFilter === "web" ? "active" : ""} onClick={() => setSourceFilter("web")} type="button">
              Nachito Store
            </button>
            <button className={sourceFilter === "other" ? "active" : ""} onClick={() => setSourceFilter("other")} type="button">
              Otros
            </button>
          </div>

          <div className="customer-list">
            {filteredCustomers.map((customer) => (
              <button
                className={`customer-card${selectedCustomer?.key === customer.key ? " active" : ""}`}
                key={customer.key}
                onClick={() => setSelectedCustomerKey(customer.key)}
                type="button"
              >
                <div className="customer-avatar">{customer.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <div className="customer-card-title">
                    <strong>{customer.name}</strong>
                    <span className={`customer-source-pill ${customer.fromNachitoStore ? "web" : "manual"}`}>
                      {customer.fromNachitoStore ? "Nachito Store" : "Otro origen"}
                    </span>
                  </div>
                  <p>{customer.phone ?? "Sin WhatsApp"} · Registrado {formatOrderDate(customer.registeredAt)}</p>
                  <div className="customer-card-stats">
                    <span>{customer.orders.length} pedidos</span>
                    <span>{formatCurrency(customer.totalSpent)}</span>
                    <span>{customer.activeOrders.length} activos</span>
                  </div>
                </div>
              </button>
            ))}

            {!filteredCustomers.length ? (
              <div className="empty-state order-empty-state">
                <strong>No hay clientes en este filtro</strong>
                <p>Cuando alguien compre o cotice desde Nachito Store, aparecera aqui con su WhatsApp.</p>
              </div>
            ) : null}
          </div>
        </article>

        <aside className="panel customer-detail-panel">
          {selectedCustomer ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="section-kicker">Perfil del cliente</span>
                  <h3>{selectedCustomer.name}</h3>
                  <p>{selectedCustomer.phone ?? "Sin WhatsApp guardado"} · Registrado {formatOrderDate(selectedCustomer.registeredAt)}</p>
                </div>
                <span className={`badge ${selectedCustomer.activeOrders.length ? "warning" : "success"}`}>
                  {selectedCustomer.activeOrders.length ? "Pedido activo" : "Al dia"}
                </span>
              </div>

              <div className="customer-detail-grid">
                <div>
                  <span>Origen</span>
                  <strong>{selectedCustomer.fromNachitoStore ? "Nachito Store" : "Otro"}</strong>
                </div>
                <div>
                  <span>Total comprado</span>
                  <strong>{formatCurrency(totalRevenue ? selectedCustomer.totalSpent : 0)}</strong>
                </div>
                <div>
                  <span>Prendas</span>
                  <strong>{selectedCustomer.totalGarments}</strong>
                </div>
                <div>
                  <span>Talla frecuente</span>
                  <strong>{selectedCustomer.favoriteSize}</strong>
                </div>
                <div>
                  <span>Color frecuente</span>
                  <strong>{selectedCustomer.favoriteColor}</strong>
                </div>
                <div>
                  <span>Canal</span>
                  <strong>{selectedCustomer.channels.join(", ")}</strong>
                </div>
              </div>

              <div className="order-detail-block">
                <div className="order-detail-title">
                  <h4>Preferencias</h4>
                  <span>{selectedCustomer.preferredType}</span>
                </div>
                <div className="customer-preference-row">
                  <span>{selectedCustomer.completedOrders.length} entregados</span>
                  <span>{selectedCustomer.canceledOrders.length} cancelados</span>
                  <span>{selectedCustomer.activeOrders.length} activos</span>
                </div>
              </div>

              <div className="order-detail-block">
                <div className="order-detail-title">
                  <h4>Historial de pedidos</h4>
                  <span>{selectedCustomer.orders.length}</span>
                </div>
                <div className="customer-history">
                  {selectedCustomer.orders.map((order) => (
                    <article className="customer-history-item" key={order.id}>
                      <div>
                        <strong>{order.product}</strong>
                        <p>{order.id} · {formatOrderDate(order.createdAt)}</p>
                      </div>
                      <div>
                        <span className={`badge ${badgeClass(order.status)}`}>{order.status}</span>
                        <strong>{formatCurrency(order.status === "Cancelado" ? 0 : order.total)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state order-detail-empty">
              <strong>Sin clientes</strong>
              <p>Los clientes apareceran cuando entren pedidos reales desde la tienda.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
