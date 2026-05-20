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

      return {
        key,
        name: sortedOrders[0]?.customer ?? "Cliente sin nombre",
        phone: sortedOrders.find((order) => order.customerPhone)?.customerPhone,
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
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

  const customers = useMemo(() => buildCustomerProfiles(orders), [orders]);
  const selectedCustomer = selectedCustomerKey
    ? customers.find((customer) => customer.key === selectedCustomerKey)
    : customers[0];
  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return customers;

    return customers.filter((customer) =>
      [
        customer.name,
        customer.phone,
        customer.favoriteColor,
        customer.favoriteSize,
        customer.preferredType,
        ...customer.channels
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [customers, query]);

  const frequentCustomers = customers.filter((customer) => customer.orders.length > 1).length;
  const activeCustomers = customers.filter((customer) => customer.activeOrders.length > 0).length;
  const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);

  return (
    <section className="section-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">CRM</span>
          <h2>Clientes</h2>
          <p>Perfiles creados automáticamente desde los pedidos de la web, WhatsApp o venta manual.</p>
        </div>
      </header>

      <div className="section-summary-grid">
        <article className="section-summary-card">
          <span>Registrados</span>
          <strong>{customers.length}</strong>
          <small>Clientes detectados</small>
        </article>
        <article className="section-summary-card">
          <span>Frecuentes</span>
          <strong>{frequentCustomers}</strong>
          <small>Más de un pedido</small>
        </article>
        <article className="section-summary-card">
          <span>Activos</span>
          <strong>{activeCustomers}</strong>
          <small>Con pedido abierto</small>
        </article>
        <article className="section-summary-card">
          <span>Total comprado</span>
          <strong>{formatCurrency(totalRevenue)}</strong>
          <small>Sin cancelados</small>
        </article>
      </div>

      <div className="customers-layout">
        <article className="panel customers-list-panel">
          <div className="orders-toolbar">
            <div className="panel-header compact-panel-header">
              <div>
                <h3>Lista de clientes</h3>
                <p>Busca por nombre, teléfono, color, talla o canal.</p>
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
                  <strong>{customer.name}</strong>
                  <p>{customer.phone ?? "Sin teléfono"} · {customer.channels.join(", ")}</p>
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
                <strong>No hay clientes todavía</strong>
                <p>Cuando entren pedidos desde la tienda, aquí se crearán perfiles automáticamente.</p>
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
                  <p>{selectedCustomer.phone ?? "Sin teléfono guardado"} · {selectedCustomer.channels.join(", ")}</p>
                </div>
                <span className={`badge ${selectedCustomer.activeOrders.length ? "warning" : "success"}`}>
                  {selectedCustomer.activeOrders.length ? "Pedido activo" : "Al día"}
                </span>
              </div>

              <div className="customer-detail-grid">
                <div>
                  <span>Total comprado</span>
                  <strong>{formatCurrency(selectedCustomer.totalSpent)}</strong>
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
              <p>Los clientes aparecerán cuando entren pedidos reales desde la tienda.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
