import type { Order, OrderLineItem, Product } from "../types/index.ts";

const catalogType = "Catálogo";
const customPriceTiers = new Set([145, 155, 165, 175, 180]);

export class PublicOrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicOrderValidationError";
  }
}

function publicOrderId() {
  const timestamp = Date.now().toString(16).toUpperCase();
  const random = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `#WEB-${timestamp}-${random}`;
}

function normalized(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function publicWorkflowFields(type: Order["type"]): Pick<Order, "payment" | "status" | "channel" | "source" | "botStatus"> {
  return {
    payment: "Pendiente",
    status: "Esperando pago",
    channel: "Web",
    source: type === catalogType ? "Web catálogo" : "Web personaliza",
    botStatus: "Esperando comprobante"
  };
}

function catalogItems(order: Order, products: Product[]): OrderLineItem[] {
  const requestedItems = order.items?.length
    ? order.items
    : [{
        productName: order.product,
        color: order.color,
        size: order.size,
        quantity: order.prendas,
        unitPrice: order.total,
        lineTotal: order.total
      }];

  return requestedItems.map((item) => {
    const product = products.find((candidate) => normalized(candidate.name) === normalized(item.productName));
    if (!product) throw new PublicOrderValidationError(`El producto ${item.productName || "solicitado"} no existe.`);
    if (product.isHidden) throw new PublicOrderValidationError(`El producto ${product.name} no está disponible.`);
    if (product.isSoldOut) throw new PublicOrderValidationError(`El producto ${product.name} está agotado.`);
    if (!item.color || !product.colors.some((color) => normalized(color) === normalized(item.color))) {
      throw new PublicOrderValidationError(`El color solicitado no está disponible para ${product.name}.`);
    }
    if (!item.size || !product.sizes.some((size) => normalized(size) === normalized(item.size))) {
      throw new PublicOrderValidationError(`La talla solicitada no está disponible para ${product.name}.`);
    }

    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    return {
      ...item,
      productName: product.name,
      quantity,
      unitPrice: product.basePrice,
      lineTotal: product.basePrice * quantity
    };
  });
}

function secureCustomItems(order: Order): OrderLineItem[] | undefined {
  if (!order.items?.length) return undefined;

  return order.items.map((item) => {
    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    const unitPrice = Number(item.unitPrice);
    if (!customPriceTiers.has(unitPrice)) throw new PublicOrderValidationError("El precio de la personalización no es válido.");
    return { ...item, quantity, unitPrice, lineTotal: unitPrice * quantity };
  });
}

export function securePublicOrder(order: Order, products: Product[]): Order {
  if (order.type === catalogType) {
    const items = catalogItems(order, products);
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
    return {
      ...order,
      id: publicOrderId(),
      ...publicWorkflowFields(order.type),
      product: items[0]?.productName ?? order.product,
      prendas: items.reduce((sum, item) => sum + item.quantity, 0),
      total,
      items
    };
  }

  const items = secureCustomItems(order);
  const quantity = Math.max(1, Math.round(Number(order.prendas) || 1));
  const total = items?.reduce((sum, item) => sum + item.lineTotal, 0) ?? Number(order.total);
  const unitPrice = total / quantity;
  if (!Number.isFinite(total) || total <= 0 || (!items && !customPriceTiers.has(unitPrice))) {
    throw new PublicOrderValidationError("El precio de la personalización no es válido.");
  }

  return {
    ...order,
    id: publicOrderId(),
    ...publicWorkflowFields(order.type),
    total,
    prendas: items?.reduce((sum, item) => sum + item.quantity, 0) ?? quantity,
    items
  };
}
