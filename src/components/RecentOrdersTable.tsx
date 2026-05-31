import { badgeClass, formatCurrency } from "@/lib/format";
import type { Order } from "@/types";

interface RecentOrdersTableProps {
  orders: Order[];
}

export function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  const recentOrders = orders
    .filter((order) => order.status !== "Cancelado")
    .slice(0, 5);

  return (
    <article className="panel orders-card">
      <div className="panel-header">
        <div>
          <h3>Pedidos recientes</h3>
          <p>Ultimos pedidos registrados en el sistema</p>
        </div>
      </div>

      {recentOrders.length ? (
        <div className="table-wrap">
          <table className="order-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Producto</th>
                <th>Pago</th>
                <th>Estado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td><span className="order-id">{order.id}</span></td>
                  <td>
                    <div className="client-name">{order.customer}</div>
                    <div className="client-channel">{order.channel}</div>
                  </td>
                  <td>{order.product}</td>
                  <td>
                    <span className={`badge ${badgeClass(order.payment)}`}>{order.payment}</span>
                  </td>
                  <td>
                    <span className={`badge ${badgeClass(order.status)}`}>{order.status}</span>
                  </td>
                  <td className="total-cell">{formatCurrency(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state order-empty-state">
          <strong>Sin pedidos activos</strong>
          <p>Los pedidos nuevos de Nachito Store apareceran aqui.</p>
        </div>
      )}

      <div className="card-footer">
        <button className="link-btn" type="button">Ver todos los pedidos -&gt;</button>
      </div>
    </article>
  );
}
