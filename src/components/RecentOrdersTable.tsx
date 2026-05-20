import { useMemo, useState } from "react";
import { badgeClass, formatCurrency } from "@/lib/format";
import type { Order } from "@/types";

interface RecentOrdersTableProps {
  orders: Order[];
}

export function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  const [query, setQuery] = useState("");

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    const activeOrders = orders.filter((order) => order.status !== "Cancelado");

    if (!normalizedQuery) return activeOrders;

    return activeOrders.filter((order) =>
      `${order.id} ${order.customer} ${order.product} ${order.payment} ${order.status} ${order.channel}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [orders, query]);

  return (
    <article className="panel">
      <div className="orders-toolbar">
        <div className="panel-header compact-panel-header">
          <div>
            <h3>Pedidos recientes</h3>
            <p>Control de pedidos normales, personalizados, pagos y estados.</p>
          </div>
        </div>
        <input
          className="search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar pedido, cliente o estado..."
          type="search"
          value={query}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Producto</th>
              <th>Prendas</th>
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
                  <small>{order.type}</small>
                </td>
                <td>
                  <strong>{order.product}</strong>
                  <small>Pedido {order.type.toLowerCase()}</small>
                </td>
                <td>
                  <strong>{order.prendas}</strong>
                  <small>{order.prendas === 1 ? "prenda" : "prendas"}</small>
                </td>
                <td>
                  <span className={`badge ${badgeClass(order.payment)}`}>{order.payment}</span>
                </td>
                <td>
                  <span className={`badge ${badgeClass(order.status)}`}>{order.status}</span>
                </td>
                <td>
                  <strong>{formatCurrency(order.total)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
