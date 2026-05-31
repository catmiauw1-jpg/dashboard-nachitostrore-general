"use client";

import { useEffect, useMemo, useState } from "react";
import { badgeClass, formatCurrency } from "@/lib/format";
import type { Customer, Order, OrderLineItem } from "@/types";

interface CustomersSectionProps {
  customers: Customer[];
  orders: Order[];
  onUpdateCustomerNote: (customerId: string, notes: string) => Promise<void>;
}

interface CustomerProfile {
  key: string;
  customerId?: string;
  name: string;
  phone?: string;
  persistedNote?: string;
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
  favoriteProduct: string;
}

type SourceFilter = "all" | "web" | "active" | "frequent" | "other";

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

function normalizePhone(value?: string) {
  return value?.replace(/[^\d+]/g, "").trim() || "";
}

function isGenericCustomerName(value: string) {
  return ["cliente web", "cliente", "sin nombre", "cliente sin nombre"].includes(value.trim().toLowerCase());
}

function customerKey(order: Order) {
  const phone = normalizePhone(order.customerPhone);
  if (phone) return `phone:${phone}`;

  const name = order.customer.trim().toLowerCase();
  if (name && !isGenericCustomerName(name)) return `name:${name}`;

  return `order:${order.id}`;
}

function isNachitoStoreOrder(order: Order) {
  return order.channel === "Web" || order.source === "Web catálogo" || order.source === "Web personaliza";
}

function orderItems(order: Order): OrderLineItem[] {
  if (order.items?.length) return order.items;

  const quantity = Math.max(1, order.prendas || 1);

  return [
    {
      productName: order.product,
      size: order.size,
      color: order.color,
      quantity,
      unitPrice: order.total / quantity,
      lineTotal: order.total,
      isCustom: order.type === "Personalizada",
      description: order.designDetails
    }
  ];
}

function buildCustomerProfiles(orders: Order[], persistedCustomers: Customer[]): CustomerProfile[] {
  const groups = new Map<string, Order[]>();
  const persistedByPhone = new Map<string, Customer>();

  persistedCustomers.forEach((customer) => {
    const phone = normalizePhone(customer.phone);
    if (phone) persistedByPhone.set(phone, customer);
  });

  orders.forEach((order) => {
    const key = customerKey(order);
    groups.set(key, [...(groups.get(key) ?? []), order]);
  });

  const profiles: CustomerProfile[] = [...groups.entries()]
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
      const items = sortedOrders.flatMap(orderItems);
      const persistedCustomer = persistedByPhone.get(normalizePhone(sortedOrders.find((order) => normalizePhone(order.customerPhone))?.customerPhone));

      return {
        key,
        customerId: persistedCustomer?.id,
        name: sortedOrders.find((order) => !isGenericCustomerName(order.customer))?.customer ?? sortedOrders[0]?.customer ?? "Cliente sin nombre",
        phone: persistedCustomer?.phone ?? sortedOrders.find((order) => normalizePhone(order.customerPhone))?.customerPhone,
        persistedNote: persistedCustomer?.notes,
        registeredAt: oldestOrder?.createdAt,
        fromNachitoStore: sortedOrders.some(isNachitoStoreOrder),
        channels: [...new Set([persistedCustomer?.channel, ...sortedOrders.map((order) => order.channel)].filter(Boolean) as string[])],
        orders: sortedOrders,
        activeOrders,
        completedOrders,
        canceledOrders,
        totalSpent: billableOrders.reduce((sum, order) => sum + order.total, 0),
        totalGarments: billableOrders.reduce((sum, order) => sum + order.prendas, 0),
        lastOrder: sortedOrders[0],
        favoriteSize: mostCommon(items.map((item) => item.size), "Por confirmar"),
        favoriteColor: mostCommon(items.map((item) => item.color), "Por confirmar"),
        preferredType: mostCommon(sortedOrders.map((order) => order.type), "Sin preferencia"),
        favoriteProduct: mostCommon(items.map((item) => item.productName), "Sin producto frecuente")
      };
    });

  const profileKeys = new Set(profiles.map((profile) => profile.key));
  persistedCustomers.forEach((customer) => {
    const phone = normalizePhone(customer.phone);
    const key = phone ? `phone:${phone}` : `customer:${customer.id}`;
    if (profileKeys.has(key)) return;

    profiles.push({
      key,
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      persistedNote: customer.notes,
      registeredAt: customer.createdAt,
      fromNachitoStore: customer.channel === "Web",
      channels: [customer.channel],
      orders: [],
      activeOrders: [],
      completedOrders: [],
      canceledOrders: [],
      totalSpent: 0,
      totalGarments: 0,
      favoriteSize: customer.preferredSize ?? "Por confirmar",
      favoriteColor: customer.preferredColor ?? "Por confirmar",
      preferredType: "Sin pedidos todavía",
      favoriteProduct: "Sin producto frecuente"
    });
  });

  return profiles.sort((a, b) => {
      const first = a.lastOrder?.createdAt ? new Date(a.lastOrder.createdAt).getTime() : 0;
      const second = b.lastOrder?.createdAt ? new Date(b.lastOrder.createdAt).getTime() : 0;
      return second - first;
    });
}

export function CustomersSection({ customers: persistedCustomers, orders, onUpdateCustomerNote }: CustomersSectionProps) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);
  const [customerNotes, setCustomerNotes] = useState<Record<string, string>>({});

  const customers = useMemo(() => buildCustomerProfiles(orders, persistedCustomers), [orders, persistedCustomers]);

  useEffect(() => {
    try {
      const storedNotes = window.localStorage.getItem("poleraflow-customer-notes");
      if (storedNotes) setCustomerNotes(JSON.parse(storedNotes) as Record<string, string>);
    } catch {
      setCustomerNotes({});
    }
  }, []);

  useEffect(() => {
    setCustomerNotes((currentNotes) => {
      const nextNotes = { ...currentNotes };
      customers.forEach((customer) => {
        if (customer.persistedNote !== undefined && nextNotes[customer.key] === undefined) {
          nextNotes[customer.key] = customer.persistedNote;
        }
      });
      return nextNotes;
    });
  }, [customers]);

  const updateCustomerNoteDraft = (customerKeyValue: string, note: string) => {
    setCustomerNotes((currentNotes) => ({ ...currentNotes, [customerKeyValue]: note }));
  };

  const saveCustomerNote = async (customer: CustomerProfile, note: string) => {
    if (customer.customerId) {
      await onUpdateCustomerNote(customer.customerId, note);
      return;
    }

    setCustomerNotes((currentNotes) => {
      const nextNotes = { ...currentNotes, [customer.key]: note };
      window.localStorage.setItem("poleraflow-customer-notes", JSON.stringify(nextNotes));
      return nextNotes;
    });
  };

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sourceFilteredCustomers = customers.filter((customer) => {
      if (sourceFilter === "web") return customer.fromNachitoStore;
      if (sourceFilter === "active") return customer.activeOrders.length > 0;
      if (sourceFilter === "frequent") return customer.orders.length > 1;
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
        customer.favoriteProduct,
        customer.preferredType,
        customerNotes[customer.key],
        customer.fromNachitoStore ? "Nachito Store web registrado" : "Manual WhatsApp",
        ...customer.channels
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [customerNotes, customers, query, sourceFilter]);

  const selectedCustomer = selectedCustomerKey
    ? customers.find((customer) => customer.key === selectedCustomerKey)
    : filteredCustomers[0] ?? customers[0];

  const frequentCustomers = customers.filter((customer) => customer.orders.length > 1).length;
  const activeCustomers = customers.filter((customer) => customer.activeOrders.length > 0).length;
  const webCustomers = customers.filter((customer) => customer.fromNachitoStore).length;
  const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
  const selectedCustomerNote = selectedCustomer ? customerNotes[selectedCustomer.key] ?? selectedCustomer.persistedNote ?? "" : "";
  const whatsappLink = selectedCustomer?.phone
    ? `https://wa.me/${normalizePhone(selectedCustomer.phone).replace(/^\+/, "")}`
    : "";

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
          <span>Clientes únicos</span>
          <strong>{customers.length}</strong>
          <small>Agrupados por WhatsApp</small>
        </article>
        <article className="section-summary-card">
          <span>Desde la web</span>
          <strong>{webCustomers}</strong>
          <small>Registrados en Nachito Store</small>
        </article>
        <article className="section-summary-card">
          <span>Frecuentes</span>
          <strong>{frequentCustomers}</strong>
          <small>Más de un pedido</small>
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
                <h3>Registro de clientes</h3>
                <p>Busca por nombre, WhatsApp, color, talla, prenda u origen.</p>
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
            <button className={sourceFilter === "active" ? "active" : ""} onClick={() => setSourceFilter("active")} type="button">
              Activos
            </button>
            <button className={sourceFilter === "frequent" ? "active" : ""} onClick={() => setSourceFilter("frequent")} type="button">
              Frecuentes
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
                  <small className="customer-last-order">
                    Último pedido: {customer.lastOrder ? formatOrderDate(customer.lastOrder.createdAt) : "Sin fecha"}
                  </small>
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
                <p>Cuando alguien compre o cotice desde Nachito Store, aparecerá aquí con su WhatsApp.</p>
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
                  {selectedCustomer.activeOrders.length ? "Pedido activo" : "Al día"}
                </span>
              </div>

              <div className="customer-actions">
                <a className={`btn ${whatsappLink ? "" : "disabled"}`} href={whatsappLink || undefined} target="_blank" rel="noreferrer">
                  Abrir WhatsApp
                </a>
              </div>

              <div className="customer-detail-grid">
                <div>
                  <span>Origen</span>
                  <strong>{selectedCustomer.fromNachitoStore ? "Nachito Store" : "Otro"}</strong>
                </div>
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
                <div>
                  <span>Prenda frecuente</span>
                  <strong>{selectedCustomer.favoriteProduct}</strong>
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
                  <span>{selectedCustomer.channels.join(", ")}</span>
                </div>
              </div>

              <div className="order-detail-block">
                <div className="order-detail-title">
                  <h4>Notas internas</h4>
                  <span>Solo dashboard</span>
                </div>
                <textarea
                  className="customer-note-field"
                  onBlur={(event) => void saveCustomerNote(selectedCustomer, event.target.value)}
                  onChange={(event) => updateCustomerNoteDraft(selectedCustomer.key, event.target.value)}
                  placeholder="Ej: le gusta oversize negro, paga por QR, prefiere recoger..."
                  value={selectedCustomerNote}
                />
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
