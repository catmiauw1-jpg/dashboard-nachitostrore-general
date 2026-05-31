import { NextResponse } from "next/server";
import { createOrder, updateOrder } from "@/lib/orderRepository";
import { RequestSecurityError, assertBodySize, cleanText, secureJsonHeaders } from "@/lib/requestSecurity";
import type { Order, OrderLineItem, OrderStatus, OrderType, PaymentStatus } from "@/types";

const maxN8nBodyBytes = 1024 * 1024;
const catalogType = "Cat\u00e1logo" as const;

type N8nOrderPayload = Record<string, unknown> & {
  action?: "create_order" | "update_order";
  orderId?: string;
  customerName?: string;
  customer?: string;
  customerPhone?: string;
  phone?: string;
  type?: "catalog" | "custom" | OrderType;
  product?: string;
  size?: string;
  color?: string;
  quantity?: number;
  total?: number;
  notes?: string;
  designDetails?: string;
  quoteOption?: string;
  referenceImages?: string[];
  items?: OrderLineItem[];
  payment?: Order["payment"];
  status?: Order["status"];
};

function webhookSecret() {
  return process.env.N8N_WEBHOOK_SECRET;
}

function hasValidSecret(request: Request) {
  const secret = webhookSecret();
  const auth = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-poleraflow-webhook-secret") ?? "";

  return Boolean(secret && (auth === `Bearer ${secret}` || headerSecret === secret));
}

function orderNumber() {
  return `#BOT-${Date.now().toString().slice(-8)}`;
}

function normalizePhone(value: unknown) {
  return cleanText(value, 30).replace(/[^\d+]/g, "").slice(0, 24);
}

function safeMoney(value: unknown) {
  const number = Number(value);
  return Math.min(Math.max(0, Number.isFinite(number) ? number : 0), 50_000);
}

function safeQuantity(value: unknown) {
  const number = Number(value);
  return Math.min(Math.max(1, Number.isFinite(number) ? Math.round(number) : 1), 20);
}

function normalizeType(value: unknown): OrderType {
  return value === "catalog" || value === catalogType ? catalogType : "Personalizada";
}

function normalizePayment(value: unknown): PaymentStatus {
  const payment = cleanText(value, 40).toLowerCase();

  if (payment.includes("50")) return "50% pagado";
  if (payment.includes("completo") || payment.includes("pagado")) return "Pago completo";
  return "Pendiente";
}

function normalizeStatus(value: unknown): OrderStatus {
  const status = cleanText(value, 60).toLowerCase();

  if (status.includes("cancel")) return "Cancelado";
  if (status.includes("entreg")) return "Entregado";
  if (status.includes("list")) return "Lista para enviar";
  if (status.includes("prepar")) return "En preparaci\u00f3n";
  return "Esperando pago";
}

function safeItems(payload: N8nOrderPayload, type: OrderType): OrderLineItem[] {
  if (Array.isArray(payload.items) && payload.items.length) {
    return payload.items.slice(0, 20).map((item) => {
      const quantity = safeQuantity(item.quantity);
      const unitPrice = safeMoney(item.unitPrice);

      return {
        productName: cleanText(item.productName, 120) || "Prenda",
        color: cleanText(item.color, 60) || undefined,
        size: cleanText(item.size, 20) || undefined,
        quantity,
        unitPrice,
        lineTotal: safeMoney(item.lineTotal) || quantity * unitPrice,
        isCustom: item.isCustom ?? type === "Personalizada",
        description: cleanText(item.description, 300) || undefined
      };
    });
  }

  const quantity = safeQuantity(payload.quantity);
  const total = safeMoney(payload.total);

  return [
    {
      productName: cleanText(payload.product, 120) || (type === catalogType ? "Pedido catalogo" : "Polera personalizada"),
      color: cleanText(payload.color, 60) || undefined,
      size: cleanText(payload.size, 20) || undefined,
      quantity,
      unitPrice: quantity > 0 ? total / quantity : total,
      lineTotal: total,
      isCustom: type === "Personalizada",
      description: cleanText(payload.designDetails ?? payload.notes, 300) || undefined
    }
  ];
}

function orderFromN8n(payload: N8nOrderPayload): Order {
  const type = normalizeType(payload.type);
  const items = safeItems(payload, type);
  const total = safeMoney(payload.total) || items.reduce((sum, item) => sum + item.lineTotal, 0);
  const prendas = items.reduce((sum, item) => sum + item.quantity, 0) || safeQuantity(payload.quantity);
  const firstItem = items[0];

  return {
    id: orderNumber(),
    customer: cleanText(payload.customerName ?? payload.customer, 80) || "Cliente WhatsApp",
    customerPhone: normalizePhone(payload.customerPhone ?? payload.phone) || undefined,
    type,
    product:
      cleanText(payload.product, 120) ||
      (items.length > 1 ? (type === catalogType ? "Pedido catalogo" : "Polera personalizada") : firstItem.productName),
    size: firstItem.size,
    color: firstItem.color,
    payment: normalizePayment(payload.payment),
    status: normalizeStatus(payload.status),
    total,
    channel: "WhatsApp",
    prendas,
    notes: cleanText(payload.notes, 1000) || undefined,
    source: "WhatsApp bot",
    botStatus: "Bot registrado",
    designDetails: cleanText(payload.designDetails ?? payload.notes, 1000) || undefined,
    quoteOption: cleanText(payload.quoteOption, 120) || undefined,
    referenceImages: Array.isArray(payload.referenceImages)
      ? payload.referenceImages.map((url) => cleanText(url, 400)).filter(Boolean).slice(0, 5)
      : [],
    items
  };
}

export async function POST(request: Request) {
  try {
    assertBodySize(request, maxN8nBodyBytes);

    if (!webhookSecret()) {
      throw new RequestSecurityError("N8N_WEBHOOK_SECRET no esta configurado.", 503);
    }

    if (!hasValidSecret(request)) {
      throw new RequestSecurityError("Webhook no autorizado.", 401);
    }

    const payload = (await request.json()) as N8nOrderPayload;

    if (payload.action === "update_order") {
      if (!payload.orderId) throw new RequestSecurityError("Falta orderId para actualizar.", 400);

      const orders = await updateOrder(payload.orderId, {
        payment: payload.payment ? normalizePayment(payload.payment) : undefined,
        status: payload.status ? normalizeStatus(payload.status) : undefined,
        notes: cleanText(payload.notes, 1000) || undefined,
        botStatus: "Bot registrado"
      });

      return NextResponse.json({ ok: true, orders }, { headers: secureJsonHeaders(request) });
    }

    const order = orderFromN8n(payload);
    const orders = await createOrder(order);

    return NextResponse.json(
      {
        ok: true,
        orderId: order.id,
        total: order.total,
        replyText: `Pedido ${order.id} registrado. Total: ${order.total} Bs. Por favor envia tu comprobante de pago para preparar tu polera.`,
        orders
      },
      { status: 201, headers: secureJsonHeaders(request) }
    );
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo procesar el webhook de n8n.";

    return NextResponse.json({ ok: false, error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
