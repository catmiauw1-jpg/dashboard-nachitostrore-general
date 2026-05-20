"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  Customer,
  DeliveryMethod,
  Order,
  OrderStatus,
  OrderType,
  PaymentStatus,
  Product,
  SalesChannel
} from "@/types";

interface OrderFormModalProps {
  customers: Customer[];
  isOpen: boolean;
  nextOrderNumber: number;
  products: Product[];
  onClose: () => void;
  onSubmit: (order: Order) => void;
}

const paymentOptions: PaymentStatus[] = ["Pendiente", "50% pagado", "Pago completo"];
const statusOptions: OrderStatus[] = [
  "Esperando pago",
  "En preparación",
  "Lista para enviar",
  "Entregado"
];
const deliveryOptions: DeliveryMethod[] = ["Recoger", "Yango"];
const channelOptions: SalesChannel[] = ["WhatsApp", "Instagram", "Web", "Manual"];

export function OrderFormModal({
  customers,
  isOpen,
  nextOrderNumber,
  products,
  onClose,
  onSubmit
}: OrderFormModalProps) {
  const [orderType, setOrderType] = useState<OrderType>("Catálogo");
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [channel, setChannel] = useState<SalesChannel>("WhatsApp");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [customProduct, setCustomProduct] = useState("Diseño DTF personalizado");
  const [size, setSize] = useState("M");
  const [color, setColor] = useState("Blanco hueso");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(products[0]?.basePrice ?? 0);
  const [payment, setPayment] = useState<PaymentStatus>("Pendiente");
  const [status, setStatus] = useState<OrderStatus>("Esperando pago");
  const [delivery, setDelivery] = useState<DeliveryMethod>("Recoger");
  const [notes, setNotes] = useState("");

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId),
    [customerId, customers]
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products]
  );

  if (!isOpen) return null;

  const handleProductChange = (nextProductId: string) => {
    const nextProduct = products.find((product) => product.id === nextProductId);

    setProductId(nextProductId);

    if (!nextProduct) return;

    setPrice(nextProduct.basePrice);
    setSize(nextProduct.sizes[0] ?? "");
    setColor(nextProduct.colors[0] ?? "");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const customerName =
      customerMode === "existing" ? selectedCustomer?.name ?? "Cliente sin nombre" : newCustomerName;
    const customerPhone =
      customerMode === "existing" ? selectedCustomer?.phone : newCustomerPhone || undefined;
    const productName = orderType === "Catálogo" ? selectedProduct?.name ?? "Producto" : customProduct;
    const safeQuantity = Math.max(1, quantity);
    const safePrice = Math.max(0, price);

    onSubmit({
      id: `#${nextOrderNumber}`,
      customer: customerName.trim() || "Cliente sin nombre",
      customerPhone,
      type: orderType,
      product: productName.trim() || "Pedido personalizado",
      size,
      color,
      payment,
      status,
      total: safePrice * safeQuantity,
      channel,
      prendas: safeQuantity,
      delivery,
      notes: notes.trim() || undefined,
      source: channel === "Web" ? (orderType === "Catálogo" ? "Web catálogo" : "Web personaliza") : "Manual",
      botStatus: channel === "WhatsApp" || channel === "Web" ? "Bot registrado" : "Atención manual",
      designDetails: orderType === "Personalizada" ? notes.trim() || "Pendiente de revisar referencias." : undefined,
      referenceImages: orderType === "Personalizada" ? ["Referencia pendiente"] : undefined
    });

    onClose();
  };

  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="order-modal">
        <div className="modal-head">
          <div>
            <span className="section-kicker">Nuevo pedido</span>
            <h2>Registrar pedido</h2>
            <p>Guarda una venta de catálogo o personalizada. Por ahora queda en datos locales.</p>
          </div>
          <button aria-label="Cerrar modal" className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form className="order-form" onSubmit={handleSubmit}>
          <section className="form-block">
            <div className="form-block-head">
              <h3>Tipo de pedido</h3>
              <p>Define si el cliente compra una prenda del catálogo o pide una personalizada.</p>
            </div>
            <div className="segmented-control">
              {(["Catálogo", "Personalizada"] as OrderType[]).map((type) => (
                <button
                  className={orderType === type ? "active" : ""}
                  key={type}
                  onClick={() => setOrderType(type)}
                  type="button"
                >
                  {type}
                </button>
              ))}
            </div>
          </section>

          <section className="form-block">
            <div className="form-block-head">
              <h3>Cliente</h3>
              <p>Selecciona uno existente o registra uno nuevo.</p>
            </div>

            <div className="form-grid two-columns">
              <label className="field">
                <span>Modo cliente</span>
                <select
                  value={customerMode}
                  onChange={(event) => setCustomerMode(event.target.value as "existing" | "new")}
                >
                  <option value="existing">Cliente existente</option>
                  <option value="new">Cliente nuevo</option>
                </select>
              </label>

              <label className="field">
                <span>Canal</span>
                <select
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as SalesChannel)}
                >
                  {channelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              {customerMode === "existing" ? (
                <label className="field wide-field">
                  <span>Cliente</span>
                  <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} · {customer.phone}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Nombre</span>
                    <input
                      required
                      value={newCustomerName}
                      onChange={(event) => setNewCustomerName(event.target.value)}
                      placeholder="Nombre del cliente"
                    />
                  </label>
                  <label className="field">
                    <span>Teléfono</span>
                    <input
                      value={newCustomerPhone}
                      onChange={(event) => setNewCustomerPhone(event.target.value)}
                      placeholder="+591..."
                    />
                  </label>
                </>
              )}
            </div>
          </section>

          <section className="form-block">
            <div className="form-block-head">
              <h3>Prenda</h3>
              <p>Registra la prenda, variante, cantidad y precio.</p>
            </div>

            <div className="form-grid two-columns">
              {orderType === "Catálogo" ? (
                <label className="field wide-field">
                  <span>Producto</span>
                  <select value={productId} onChange={(event) => handleProductChange(event.target.value)}>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {product.basePrice} Bs
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="field wide-field">
                  <span>Descripción personalizada</span>
                  <input
                    value={customProduct}
                    onChange={(event) => setCustomProduct(event.target.value)}
                    placeholder="Ej: DTF espalda + nombre frontal"
                  />
                </label>
              )}

              <label className="field">
                <span>Talla</span>
                <select value={size} onChange={(event) => setSize(event.target.value)}>
                  {(selectedProduct?.sizes ?? ["S", "M", "L", "XL"]).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Color</span>
                <select value={color} onChange={(event) => setColor(event.target.value)}>
                  {(selectedProduct?.colors ?? ["Blanco", "Negro", "Personalizado"]).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Cantidad</span>
                <input
                  min={1}
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </label>

              <label className="field">
                <span>Precio unitario</span>
                <input
                  min={0}
                  type="number"
                  value={price}
                  onChange={(event) => setPrice(Number(event.target.value))}
                />
              </label>
            </div>
          </section>

          <section className="form-block">
            <div className="form-block-head">
              <h3>Pago y entrega</h3>
              <p>Define estado de pago, pedido y forma de entrega.</p>
            </div>

            <div className="form-grid three-columns">
              <label className="field">
                <span>Pago</span>
                <select value={payment} onChange={(event) => setPayment(event.target.value as PaymentStatus)}>
                  {paymentOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Estado</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)}>
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Entrega</span>
                <select
                  value={delivery}
                  onChange={(event) => setDelivery(event.target.value as DeliveryMethod)}
                >
                  {deliveryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field wide-field">
                <span>Notas</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Detalles de diseño, dirección, comprobante o instrucciones internas."
                />
              </label>
            </div>
          </section>

          <div className="modal-actions">
            <div>
              <span>Total estimado</span>
              <strong>{Math.max(0, price) * Math.max(1, quantity)} Bs</strong>
            </div>
            <button className="btn" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="btn primary" type="submit">
              Guardar pedido
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
