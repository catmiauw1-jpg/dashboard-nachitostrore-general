"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  Customer,
  DeliveryMethod,
  Order,
  OrderLineItem,
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
const statusOptions: OrderStatus[] = ["Esperando pago", "En preparación", "Lista para enviar", "Entregado"];
const deliveryOptions: DeliveryMethod[] = ["Recoger", "Yango"];
const channelOptions: SalesChannel[] = ["WhatsApp", "Instagram", "Web", "Manual"];
const defaultSizes = ["M", "L", "XL"];
const defaultColors = ["Blanco arena", "Negro"];

function money(value: number) {
  return `${Math.max(0, value).toLocaleString("es-BO")} Bs`;
}

function cleanPhone(value: string) {
  return value.replace(/[^\d+]/g, "").slice(0, 24);
}

export function OrderFormModal({
  customers,
  isOpen,
  nextOrderNumber,
  products,
  onClose,
  onSubmit
}: OrderFormModalProps) {
  const firstProduct = products[0];
  const [orderType, setOrderType] = useState<OrderType>("Catálogo");
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("new");
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [channel, setChannel] = useState<SalesChannel>("WhatsApp");
  const [productId, setProductId] = useState(firstProduct?.id ?? "");
  const [customProduct, setCustomProduct] = useState("Polera personalizada");
  const [customQuote, setCustomQuote] = useState("Cotización por revisar");
  const [size, setSize] = useState(firstProduct?.sizes[0] ?? "M");
  const [color, setColor] = useState(firstProduct?.colors[0] ?? "Blanco arena");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(firstProduct?.basePrice ?? 0);
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

  const availableSizes = orderType === "Catálogo" ? selectedProduct?.sizes ?? defaultSizes : defaultSizes;
  const availableColors = orderType === "Catálogo" ? selectedProduct?.colors ?? defaultColors : defaultColors;
  const safeQuantity = Math.max(1, Number.isFinite(quantity) ? quantity : 1);
  const safePrice = Math.max(0, Number.isFinite(price) ? price : 0);
  const total = safeQuantity * safePrice;
  const customerName =
    customerMode === "existing" ? selectedCustomer?.name ?? "" : newCustomerName.trim();
  const customerPhone =
    customerMode === "existing" ? selectedCustomer?.phone : cleanPhone(newCustomerPhone);
  const productName = orderType === "Catálogo" ? selectedProduct?.name ?? "Producto del catálogo" : customProduct;

  useEffect(() => {
    if (!isOpen) return;

    if (customers.length && !customerId) {
      setCustomerMode("existing");
      setCustomerId(customers[0].id);
    }

    if (!customers.length) {
      setCustomerMode("new");
    }
  }, [customers, customerId, isOpen]);

  useEffect(() => {
    if (!selectedProduct || orderType !== "Catálogo") return;

    setPrice(selectedProduct.basePrice);
    setSize(selectedProduct.sizes[0] ?? "M");
    setColor(selectedProduct.colors[0] ?? "Blanco arena");
  }, [orderType, selectedProduct]);

  if (!isOpen) return null;

  const handleProductChange = (nextProductId: string) => {
    setProductId(nextProductId);
  };

  const handleTypeChange = (type: OrderType) => {
    setOrderType(type);
    if (type === "Personalizada") {
      setProductId("");
      setPrice(165);
      setSize("M");
      setColor("Negro");
      setStatus("Esperando pago");
    } else if (firstProduct) {
      setProductId(firstProduct.id);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const finalCustomer = customerName.trim() || "Cliente sin nombre";
    const finalProduct = productName.trim() || (orderType === "Catálogo" ? "Pedido catálogo" : "Polera personalizada");
    const lineItem: OrderLineItem = {
      productName: finalProduct,
      size,
      color,
      quantity: safeQuantity,
      unitPrice: safePrice,
      lineTotal: total,
      isCustom: orderType === "Personalizada",
      description: orderType === "Personalizada" ? notes.trim() || customQuote : undefined
    };

    onSubmit({
      id: `#${nextOrderNumber}`,
      customer: finalCustomer,
      customerPhone: customerPhone || undefined,
      createdAt: new Date().toISOString(),
      type: orderType,
      product: finalProduct,
      size,
      color,
      payment,
      status,
      total,
      channel,
      prendas: safeQuantity,
      delivery,
      notes: notes.trim() || undefined,
      source: channel === "Web" ? (orderType === "Catálogo" ? "Web catálogo" : "Web personaliza") : "Manual",
      botStatus: channel === "WhatsApp" || channel === "Web" ? "Bot registrado" : "Atención manual",
      designDetails: orderType === "Personalizada" ? notes.trim() || "Pendiente de revisar referencias." : undefined,
      quoteOption: orderType === "Personalizada" ? customQuote : undefined,
      referenceImages: orderType === "Personalizada" ? [] : undefined,
      items: [lineItem]
    });

    onClose();
  };

  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="order-modal improved-order-modal">
        <div className="modal-head improved-modal-head">
          <div>
            <span className="section-kicker">Pedido manual</span>
            <h2>Registrar pedido</h2>
            <p>Agrega una venta que llegó por WhatsApp, Instagram, tienda o atención manual.</p>
          </div>
          <button aria-label="Cerrar modal" className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form className="order-form improved-order-form" onSubmit={handleSubmit}>
          <div className="order-form-main">
            <section className="form-block order-type-block">
              <div className="form-block-head">
                <div>
                  <h3>Tipo de pedido</h3>
                  <p>Escoge si preparas una prenda del catálogo o una personalizada.</p>
                </div>
              </div>
              <div className="order-type-cards">
                {(["Catálogo", "Personalizada"] as OrderType[]).map((type) => (
                  <button
                    className={`order-type-card ${orderType === type ? "active" : ""}`}
                    key={type}
                    onClick={() => handleTypeChange(type)}
                    type="button"
                  >
                    <span>{type === "Catálogo" ? "CAT" : "DTF"}</span>
                    <strong>{type}</strong>
                    <small>
                      {type === "Catálogo" ? "Producto publicado en la web" : "Diseño, referencia o cotización"}
                    </small>
                  </button>
                ))}
              </div>
            </section>

            <section className="form-block">
              <div className="form-block-head">
                <div>
                  <h3>Cliente y canal</h3>
                  <p>Usa un cliente ya registrado o crea uno nuevo al instante.</p>
                </div>
              </div>

              <div className="form-grid two-columns">
                <label className="field">
                  <span>Modo cliente</span>
                  <select
                    value={customerMode}
                    onChange={(event) => setCustomerMode(event.target.value as "existing" | "new")}
                  >
                    <option disabled={!customers.length} value="existing">
                      Cliente registrado
                    </option>
                    <option value="new">Cliente nuevo</option>
                  </select>
                </label>

                <label className="field">
                  <span>Canal</span>
                  <select value={channel} onChange={(event) => setChannel(event.target.value as SalesChannel)}>
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
                      <span>WhatsApp</span>
                      <input
                        value={newCustomerPhone}
                        onChange={(event) => setNewCustomerPhone(cleanPhone(event.target.value))}
                        placeholder="+591..."
                      />
                    </label>
                  </>
                )}
              </div>
            </section>

            <section className="form-block">
              <div className="form-block-head">
                <div>
                  <h3>Prenda</h3>
                  <p>{orderType === "Catálogo" ? "Selecciona producto, talla, color y cantidad." : "Describe la prenda personalizada y su cotización."}</p>
                </div>
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
                  <>
                    <label className="field">
                      <span>Nombre del pedido</span>
                      <input
                        value={customProduct}
                        onChange={(event) => setCustomProduct(event.target.value)}
                        placeholder="Ej: Polera personalizada"
                      />
                    </label>
                    <label className="field">
                      <span>Cotización</span>
                      <input
                        value={customQuote}
                        onChange={(event) => setCustomQuote(event.target.value)}
                        placeholder="Ej: Espalda grande + frente pequeño"
                      />
                    </label>
                  </>
                )}

                <label className="field">
                  <span>Talla</span>
                  <select value={size} onChange={(event) => setSize(event.target.value)}>
                    {availableSizes.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Color</span>
                  <select value={color} onChange={(event) => setColor(event.target.value)}>
                    {availableColors.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Cantidad</span>
                  <input min={1} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
                </label>

                <label className="field">
                  <span>Precio unitario</span>
                  <input min={0} type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} />
                </label>
              </div>
            </section>

            <section className="form-block">
              <div className="form-block-head">
                <div>
                  <h3>Pago, estado y entrega</h3>
                  <p>Define cómo entra el pedido a la cola de preparación.</p>
                </div>
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
                  <select value={delivery} onChange={(event) => setDelivery(event.target.value as DeliveryMethod)}>
                    {deliveryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field wide-field">
                  <span>Notas internas o detalles del diseño</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Ej: entregar por Yango, comprobante recibido, diseño en espalda grande, frase frontal..."
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="order-form-summary">
            <span className="section-kicker">Resumen</span>
            <h3>{productName || "Pedido"}</h3>
            <div className="summary-row">
              <span>Cliente</span>
              <strong>{customerName || "Por registrar"}</strong>
            </div>
            <div className="summary-row">
              <span>WhatsApp</span>
              <strong>{customerPhone || "Sin número"}</strong>
            </div>
            <div className="summary-row">
              <span>Prenda</span>
              <strong>{safeQuantity}x · {color} · {size}</strong>
            </div>
            <div className="summary-row">
              <span>Pago</span>
              <strong>{payment}</strong>
            </div>
            <div className="summary-total">
              <span>Total estimado</span>
              <strong>{money(total)}</strong>
            </div>
            <button className="btn primary" type="submit">
              Guardar pedido
            </button>
            <button className="btn" onClick={onClose} type="button">
              Cancelar
            </button>
          </aside>
        </form>
      </div>
    </div>
  );
}
